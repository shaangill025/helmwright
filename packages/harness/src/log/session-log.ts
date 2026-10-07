import { chmodSync, closeSync, mkdirSync, openSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type SQLOutputValue } from "node:sqlite";
import { validateEvent, type Event } from "@helmwright/schema";
import { MESSAGE_APPENDED, isStorableMessagePayload } from "./messages.ts";

/** `PRAGMA user_version` of a session log this code can read and write. */
export const SESSION_LOG_SCHEMA_VERSION = 2;
/** `schemaVersion` written into each new event row. */
const EVENT_SCHEMA_VERSION = 1;
const BUSY_TIMEOUT_MS = 5_000;

// Ring 0: the events table is append-only and gap-free even for a raw connection.
const SCHEMA = `
CREATE TABLE events (
  seq INTEGER PRIMARY KEY CHECK (seq >= 0),
  schema_version INTEGER NOT NULL,
  event_id TEXT NOT NULL UNIQUE,
  graph_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  type TEXT NOT NULL,
  at TEXT NOT NULL,
  payload TEXT NOT NULL CHECK (json_valid(payload) AND json_type(payload) = 'object')
) STRICT;
CREATE INDEX events_run_id ON events (run_id, seq);
CREATE TRIGGER events_insert_guard BEFORE INSERT ON events BEGIN
  SELECT RAISE(ABORT, 'events: seq must be gap-free')
    WHERE NEW.seq IS NOT (SELECT COALESCE(MAX(seq), -1) + 1 FROM events);
  SELECT RAISE(ABORT, 'events: duplicate event_id')
    WHERE EXISTS (SELECT 1 FROM events WHERE event_id = NEW.event_id);
END;
CREATE TRIGGER events_no_update BEFORE UPDATE ON events BEGIN
  SELECT RAISE(ABORT, 'events is append-only: UPDATE rejected');
END;
CREATE TRIGGER events_no_delete BEFORE DELETE ON events BEGIN
  SELECT RAISE(ABORT, 'events is append-only: DELETE rejected');
END;
PRAGMA user_version = ${String(SESSION_LOG_SCHEMA_VERSION)};
`;
const COLUMNS =
  "seq, schema_version, event_id, graph_id, run_id, node_id, type, at, payload";

/** An event as supplied by a writer: the store assigns `seq` and `schemaVersion`. */
export type AppendInput = Omit<Event, "seq" | "schemaVersion">;

export interface EventsQuery {
  readonly runId?: string;
  readonly fromSeq?: number;
}

export type EventIssue = NonNullable<typeof validateEvent.errors>[number];

export class EventValidationError extends Error {
  readonly issues: readonly EventIssue[];
  constructor(issues: readonly EventIssue[]) {
    const detail = issues
      .map((i) => `${i.instancePath || "/"} ${i.message ?? i.keyword}`)
      .join("; ");
    super(`invalid event: ${detail}`);
    this.name = "EventValidationError";
    this.issues = issues;
  }
}

// deriveMessages would refuse (or silently change) such a message once stored.
const LOSSY_MESSAGE: EventIssue = {
  instancePath: "/payload/message",
  schemaPath: "#",
  keyword: "message",
  params: {},
  message: "must be a message that survives a JSON round trip unchanged",
};

export interface SessionLog {
  /** Validates, assigns the next gap-free seq and stores the event atomically. */
  append(input: AppendInput): Event;
  /**
   * Runs `fn` in one write transaction: all its appends commit or none do.
   * `fn` must be synchronous: a SQLite transaction cannot span an `await`.
   * A Promise-returning `fn` is a type error; at runtime its transaction is
   * rolled back, its rejection is marked handled, and a TypeError is thrown.
   * Anything it does after its first `await` runs outside the transaction.
   * If its rollback fails, this and every later write throw (N-3).
   */
  transaction<T>(fn: () => T extends PromiseLike<unknown> ? never : T): T;
  events(query?: EventsQuery): Event[];
  /** The highest stored seq, or `undefined` for an empty log. */
  lastSeq(): number | undefined;
  close(): void;
}

/**
 * Opens the session log database at `path`, creating it if missing.
 *
 * Permissions: the directory of `path` is treated as private to the log. It is
 * created 0700, or tightened to 0700 if it exists with group/other bits set;
 * the database and any existing `-wal`/`-shm` files are likewise created or
 * tightened to 0600. A directory the caller cannot chmod makes the open fail.
 *
 * Contention: M1 supports one writer process per log. A second process may
 * append concurrently, but SQLite's busy handler is not fair, so a writer that
 * waits longer than the 5 s busy timeout fails with SQLITE_BUSY.
 */
export function openSessionLog(path: string): SessionLog {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  restrict(dir, 0o700);
  closeSync(openSync(path, "a", 0o600));
  for (const file of [path, `${path}-wal`, `${path}-shm`])
    restrict(file, 0o600);
  const db = new DatabaseSync(path);
  try {
    db.exec(`PRAGMA busy_timeout = ${String(BUSY_TIMEOUT_MS)}`);
    const mode = db.prepare("PRAGMA journal_mode = WAL").get();
    if (mode?.["journal_mode"] !== "wal") {
      throw new Error(`session log ${path}: cannot enable WAL mode`);
    }
    db.exec("PRAGMA synchronous = FULL");
    migrate(db, path);
  } catch (error) {
    db.close();
    throw error;
  }
  return createLog(db);
}

/** Sets `mode` on `path` if it exists with any group/other permission bit. */
function restrict(path: string, mode: number): void {
  try {
    if ((statSync(path).mode & 0o077) !== 0) chmodSync(path, mode);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function userVersion(db: DatabaseSync): number {
  return Number(db.prepare("PRAGMA user_version").get()?.["user_version"]);
}

function migrate(db: DatabaseSync, path: string): void {
  if (userVersion(db) === SESSION_LOG_SCHEMA_VERSION) return;
  inTransaction(db, () => {
    const version = userVersion(db);
    if (version === SESSION_LOG_SCHEMA_VERSION) return;
    if (version !== 0) {
      throw new Error(
        `session log ${path}: unsupported schema version ${String(version)}`,
      );
    }
    if (db.prepare("SELECT 1 FROM sqlite_schema").get() !== undefined) {
      throw new Error(`session log ${path}: not a session log database`);
    }
    db.exec(SCHEMA);
  });
}

function inTransaction<T>(db: DatabaseSync, fn: () => T): T {
  return db.isTransaction ? fn() : runTransaction(db, fn);
}

function runTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    if (result instanceof Promise) {
      result.catch(() => undefined);
      throw new TypeError(
        "SessionLog.transaction callback must be synchronous",
      );
    }
    db.exec("COMMIT");
    return result;
  } catch (error) {
    // SQLite may already have rolled back (e.g. SQLITE_FULL).
    if (db.isTransaction) {
      try {
        db.exec("ROLLBACK");
      } catch (rollback) {
        throw new RollbackError(rollback, error);
      }
    }
    throw error;
  }
}

/** A failed ROLLBACK: the connection may still hold the open transaction. */
class RollbackError extends Error {
  constructor(rollback: unknown, cause: unknown) {
    const why = rollback instanceof Error ? rollback.message : "unknown error";
    super(`session log: rollback failed (${why}); no further writes`, {
      cause,
    });
    this.name = "RollbackError";
  }
}

function createLog(db: DatabaseSync): SessionLog {
  const insert = db.prepare(
    `INSERT INTO events (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const maxSeq = db.prepare("SELECT MAX(seq) AS seq FROM events");
  const all = db.prepare(
    `SELECT ${COLUMNS} FROM events WHERE seq >= ? ORDER BY seq`,
  );
  const byRun = db.prepare(
    `SELECT ${COLUMNS} FROM events WHERE run_id = ? AND seq >= ? ORDER BY seq`,
  );
  const lastSeq = (): number | undefined => {
    const seq = maxSeq.get()?.["seq"];
    return seq === null || seq === undefined ? undefined : Number(seq);
  };

  // N-3: after a failed rollback a write could join the stale transaction and never
  // commit, so every later write throws instead.
  let poisoned: RollbackError | undefined;
  const write = <T>(fn: () => T): T => {
    if (poisoned !== undefined) throw poisoned;
    try {
      return inTransaction(db, fn);
    } catch (error) {
      if (error instanceof RollbackError) poisoned = error;
      throw error;
    }
  };

  return {
    append(input) {
      return write(() => {
        const seq = (lastSeq() ?? -1) + 1;
        const schemaVersion = EVENT_SCHEMA_VERSION;
        const candidate: unknown = { ...input, schemaVersion, seq };
        if (!validateEvent(candidate)) {
          throw new EventValidationError(validateEvent.errors ?? []);
        }
        const e = candidate;
        if (
          e.type === MESSAGE_APPENDED &&
          !isStorableMessagePayload(e.payload)
        ) {
          throw new EventValidationError([LOSSY_MESSAGE]);
        }
        const payload = JSON.stringify(e.payload);
        insert.run(
          seq,
          schemaVersion,
          e.eventId,
          e.graphId,
          e.runId,
          e.nodeId,
          e.type,
          e.at,
          payload,
        );
        return toEvent({
          seq,
          schema_version: schemaVersion,
          event_id: e.eventId,
          graph_id: e.graphId,
          run_id: e.runId,
          node_id: e.nodeId,
          type: e.type,
          at: e.at,
          payload,
        });
      });
    },
    transaction(fn) {
      if (poisoned !== undefined) throw poisoned;
      if (db.isTransaction) {
        throw new Error("SessionLog.transaction cannot be nested");
      }
      return write(fn);
    },
    events(query = {}) {
      const fromSeq = query.fromSeq ?? 0;
      if (!Number.isSafeInteger(fromSeq) || fromSeq < 0) {
        throw new RangeError(`fromSeq must be a non-negative safe integer`);
      }
      const rows =
        query.runId === undefined
          ? all.all(fromSeq)
          : byRun.all(query.runId, fromSeq);
      return rows.map(toEvent);
    },
    lastSeq,
    close() {
      db.close();
    },
  };
}

/** Rebuilds and re-validates a stored row, so a raw writer cannot smuggle in a bad event. */
function toEvent(row: Record<string, SQLOutputValue>): Event {
  const text = row["payload"];
  const payload: unknown = typeof text === "string" ? JSON.parse(text) : text;
  const candidate: unknown = {
    schemaVersion: row["schema_version"],
    eventId: row["event_id"],
    seq: row["seq"],
    graphId: row["graph_id"],
    runId: row["run_id"],
    nodeId: row["node_id"],
    type: row["type"],
    at: row["at"],
    payload,
  };
  if (!validateEvent(candidate)) {
    throw new Error(
      `session log: corrupt event at seq ${String(row["seq"])}: ${new EventValidationError(validateEvent.errors ?? []).message}`,
    );
  }
  return candidate;
}
