import { chmodSync, closeSync, mkdirSync, openSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type SQLOutputValue } from "node:sqlite";
import {
  validateEvent,
  type Event,
  type ObjectRecord,
} from "@helmwright/schema";
import { checkObjectEvent } from "../objects/events.ts";
import {
  OBJECTS_SCHEMA,
  applyEvent,
  checkProjections,
  createMapStore,
  createSqlStore,
  projectionDigest,
  storedRecords,
  type ProjectionCheck,
  type ProjectionStore,
} from "../objects/projection.ts";
import { MESSAGE_APPENDED, isStorableMessagePayload } from "./messages.ts";

/** `PRAGMA user_version` of a session log this code can read and write. */
export const SESSION_LOG_SCHEMA_VERSION = 3;
/** `schemaVersion` written into each new event row. */
const EVENT_SCHEMA_VERSION = 1;
const BUSY_TIMEOUT_MS = 5_000;

// Ring 0: the events table is append-only and gap-free even for a raw connection.
const EVENTS_SCHEMA = `
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
`;
const SET_VERSION = `PRAGMA user_version = ${String(SESSION_LOG_SCHEMA_VERSION)}`;
const COLUMNS =
  "seq, schema_version, event_id, graph_id, run_id, node_id, type, at, payload";

/** An event as supplied by a writer: the store assigns `seq` and `schemaVersion`. */
export type AppendInput = Omit<Event, "seq" | "schemaVersion">;

export interface EventsQuery {
  readonly runId?: string;
  readonly fromSeq?: number;
  /** Only events of this type (not with `runId`); rows of other types are never read. */
  readonly type?: string;
  /** With `type`: only events whose `payload.repo` is this string. */
  readonly repo?: string;
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

/** B5-2 (OD-3): an event that checkObjectEvent refuses, on append and on every read. */
const objectIssue = (reason: string): EventIssue => ({
  instancePath: "",
  schemaPath: "#",
  keyword: "objectEvent",
  params: {},
  message: reason,
});

export interface SessionLog {
  /**
   * Validates (also with checkObjectEvent), assigns the next gap-free seq and stores
   * the event atomically, with its change to the objects projection (B5-3): if
   * applyEvent refuses it, neither is stored, even inside a caught `transaction` error.
   */
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
  /** The projected record with `id` (B5-3), read back checked, or undefined. */
  object(id: string): ObjectRecord | undefined;
  /**
   * Re-applies every event, read through the checked path, in memory and compares the
   * result and the table's DDL with the objects table (B5-3b). Does not change the log.
   * @throws Error "corrupt event at seq N" or "cannot apply event at seq N"
   */
  verifyProjections(): ProjectionCheck;
  /**
   * Drops and recreates the objects table with its triggers and re-applies every event,
   * in one write transaction; returns the projection digest (B5-3b).
   * @throws Error as verifyProjections; then nothing changes
   */
  rebuildProjections(): string;
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
  let store: ProjectionStore;
  try {
    // Before migrate: the objects triggers call the function that this registers.
    store = createSqlStore(db);
    db.exec(`PRAGMA busy_timeout = ${String(BUSY_TIMEOUT_MS)}`);
    const mode = db.prepare("PRAGMA journal_mode = WAL").get();
    if (mode?.["journal_mode"] !== "wal") {
      throw new Error(`session log ${path}: cannot enable WAL mode`);
    }
    db.exec("PRAGMA synchronous = FULL");
    migrate(db, path, store);
  } catch (error) {
    db.close();
    throw error;
  }
  return createLog(db, store);
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

function migrate(db: DatabaseSync, path: string, store: ProjectionStore): void {
  if (userVersion(db) === SESSION_LOG_SCHEMA_VERSION) return;
  inTransaction(db, () => {
    const version = userVersion(db);
    if (version === SESSION_LOG_SCHEMA_VERSION) return;
    if (version === 2) {
      migrateV2(db, path, store);
      return;
    }
    if (version !== 0) {
      throw new Error(
        `session log ${path}: unsupported schema version ${String(version)}`,
      );
    }
    if (db.prepare("SELECT 1 FROM sqlite_schema").get() !== undefined) {
      throw new Error(`session log ${path}: not a session log database`);
    }
    db.exec(EVENTS_SCHEMA + OBJECTS_SCHEMA + SET_VERSION);
  });
}

/**
 * v2 to v3 (B5-3), inside migrate's transaction: adds the objects table and applies
 * every event, read through the checked path, in seq order. Any failure rolls the file
 * back to v2 with no objects table.
 */
function migrateV2(db: DatabaseSync, path: string, store: ProjectionStore) {
  const tables = "SELECT 1 FROM sqlite_schema WHERE type = 'table'";
  try {
    if (db.prepare(tables + " AND name = 'events'").get() === undefined) {
      throw new Error("no events table");
    }
    db.exec(OBJECTS_SCHEMA);
    applyAll(db, store);
    db.exec(SET_VERSION);
  } catch (error) {
    const cause = error instanceof Error ? error.message : "unknown error";
    throw new Error(`session log ${path}: cannot migrate v2 to v3: ${cause}`, {
      cause: error,
    });
  }
}

/** Applies every event of `db`, read through the checked path, to `store` in seq order. */
function applyAll(db: DatabaseSync, store: ProjectionStore): void {
  const rows = db.prepare(`SELECT ${COLUMNS} FROM events ORDER BY seq`).all();
  for (const event of rows.map(toEvent)) {
    const refused = applyEvent(store, event);
    if (refused !== undefined) {
      const seq = String(event.seq);
      throw new Error(
        `session log: cannot apply event at seq ${seq}: ${refused}`,
      );
    }
  }
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

/**
 * Runs `fn` inside a savepoint of the open transaction, so a failed append stores
 * nothing even when the caller of `SessionLog.transaction` catches its error.
 */
function atomically<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("SAVEPOINT hw_append");
  let result: T;
  try {
    result = fn();
  } catch (error) {
    // SQLite may already have rolled back the whole transaction (e.g. SQLITE_FULL).
    if (db.isTransaction) {
      try {
        db.exec("ROLLBACK TO hw_append");
        db.exec("RELEASE hw_append");
      } catch (rollback) {
        throw new RollbackError(rollback, error);
      }
    }
    throw error;
  }
  db.exec("RELEASE hw_append");
  return result;
}

/** The RollbackErrors made here, recognized by identity alone (no Proxy trap runs). */
const rollbackErrors = new WeakSet<object>();

/** A failed ROLLBACK: the connection may still hold the open transaction. */
class RollbackError extends Error {
  constructor(rollback: unknown, cause: unknown) {
    const why = rollback instanceof Error ? rollback.message : "unknown error";
    super(`session log: rollback failed (${why}); no further writes`, {
      cause,
    });
    this.name = "RollbackError";
    rollbackErrors.add(this);
  }
}

function createLog(db: DatabaseSync, store: ProjectionStore): SessionLog {
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
  const byType = db.prepare(
    `SELECT ${COLUMNS} FROM events WHERE type = ? AND (? IS NULL OR json_extract(payload, '$.repo') = ?) AND seq >= ? ORDER BY seq`,
  );
  const lastSeq = (): number | undefined => {
    const seq = maxSeq.get()?.["seq"];
    return seq === null || seq === undefined ? undefined : Number(seq);
  };

  // N-3: after a failed rollback a write could join the stale transaction and never
  // commit, so every later write throws instead.
  let poisoned: RollbackError | undefined;
  const write = <T>(fn: () => T, savepoint = false): T => {
    if (poisoned !== undefined) throw poisoned;
    try {
      return inTransaction(db, savepoint ? () => atomically(db, fn) : fn);
    } catch (error) {
      if (rollbackErrors.has(error as object))
        poisoned = error as RollbackError;
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
        const refused = checkObjectEvent(e);
        if (refused !== undefined) {
          throw new EventValidationError([objectIssue(refused)]);
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
        const stored = toEvent({
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
        // B5-3: the projection changes in the event's transaction, or neither is stored.
        const unapplied = applyEvent(store, stored);
        if (unapplied !== undefined) {
          throw new EventValidationError([objectIssue(unapplied)]);
        }
        return stored;
      }, true);
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
      const { runId, type, repo = null } = query;
      if (type !== undefined && runId !== undefined) {
        throw new RangeError("type and runId cannot be combined");
      }
      const rows =
        type !== undefined
          ? byType.all(type, repo, repo, fromSeq)
          : runId === undefined
            ? all.all(fromSeq)
            : byRun.all(runId, fromSeq);
      return rows.map(toEvent);
    },
    object(id) {
      return store.get(id);
    },
    verifyProjections() {
      // A write transaction, so the events and rows are read from one snapshot.
      return write(() => {
        const rebuilt = createMapStore();
        applyAll(db, rebuilt);
        return checkProjections(db, rebuilt.records());
      });
    },
    rebuildProjections() {
      return write(() => {
        db.exec("DROP TABLE IF EXISTS objects");
        db.exec(OBJECTS_SCHEMA);
        applyAll(db, store);
        return projectionDigest(storedRecords(db));
      });
    },
    lastSeq,
    close() {
      db.close();
    },
  };
}

/**
 * Rebuilds and re-validates a stored row, with checkObjectEvent, so a raw writer cannot
 * smuggle in a bad event.
 */
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
  const corrupt = (issues: readonly EventIssue[]) =>
    new Error(
      `session log: corrupt event at seq ${String(row["seq"])}: ${new EventValidationError(issues).message}`,
    );
  if (!validateEvent(candidate)) throw corrupt(validateEvent.errors ?? []);
  // B5-2 (OD-3): a raw-inserted refused event fails every read that includes it.
  const refused = checkObjectEvent(candidate);
  if (refused !== undefined) throw corrupt([objectIssue(refused)]);
  return candidate;
}

/** One raw event row as `inspectEvents` shows it. */
export interface InspectedEvent {
  readonly seq: unknown;
  readonly type: unknown;
  readonly runId: unknown;
  readonly at: unknown;
  /** The stored payload text, unparsed. */
  readonly payload: unknown;
  /** Why every read refuses the row ("corrupt event at seq N: ..."), or null. */
  readonly refused: string | null;
}

/**
 * The owner's diagnosis read (B5-3b, decision 2): up to `limit` raw event rows from
 * `fromSeq`, each with the reason a checked read refuses it. Opens `path` read-only:
 * no migration, no projection, no write to the database file (SQLite may leave empty
 * -wal and -shm files). `next` is the seq of the first row not returned, or null.
 */
export function inspectEvents(
  path: string,
  fromSeq: number,
  limit: number,
): { events: InspectedEvent[]; next: number | null } {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const sql = `SELECT ${COLUMNS} FROM events WHERE seq >= ? ORDER BY seq LIMIT ?`;
    const rows = db.prepare(sql).all(fromSeq, limit + 1);
    const events = rows.slice(0, limit).map((row) => {
      let refused: string | null = null;
      try {
        toEvent(row);
      } catch (error) {
        refused = error instanceof Error ? error.message : "unreadable row";
      }
      const { seq, type, run_id: runId, at, payload } = row;
      return { seq, type, runId, at, payload, refused };
    });
    const next = rows[limit]?.["seq"];
    return { events, next: next === undefined ? null : Number(next) };
  } finally {
    db.close();
  }
}
