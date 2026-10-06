import { closeSync, mkdirSync, openSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type SQLOutputValue } from "node:sqlite";
import { validateEvent, type Event } from "@helmwright/schema";

/** `PRAGMA user_version` of a session log this code can read and write. */
export const SESSION_LOG_SCHEMA_VERSION = 1;
const BUSY_TIMEOUT_MS = 5_000;

// Ring 0: the events table is append-only and gap-free even for a raw connection.
const SCHEMA = `
CREATE TABLE events (
  seq INTEGER PRIMARY KEY CHECK (seq >= 0),
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
const COLUMNS = "seq, event_id, graph_id, run_id, node_id, type, at, payload";

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

export interface SessionLog {
  /** Validates, assigns the next gap-free seq and stores the event atomically. */
  append(input: AppendInput): Event;
  /** Runs `fn` in one write transaction: all its appends commit or none do. */
  transaction<T>(fn: () => T): T;
  events(query?: EventsQuery): Event[];
  /** The highest stored seq, or `undefined` for an empty log. */
  lastSeq(): number | undefined;
  close(): void;
}

/** Opens (creating 0600 if missing) the session log database at `path`. */
export function openSessionLog(path: string): SessionLog {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  try {
    closeSync(openSync(path, "wx", 0o600));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
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
      throw new TypeError(
        "SessionLog.transaction callback must be synchronous",
      );
    }
    db.exec("COMMIT");
    return result;
  } catch (error) {
    // SQLite may already have rolled back (e.g. SQLITE_FULL).
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}

function createLog(db: DatabaseSync): SessionLog {
  const insert = db.prepare(
    `INSERT INTO events (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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

  return {
    append(input) {
      return inTransaction(db, () => {
        const seq = (lastSeq() ?? -1) + 1;
        const candidate: unknown = { ...input, schemaVersion: 1, seq };
        if (!validateEvent(candidate)) {
          throw new EventValidationError(validateEvent.errors ?? []);
        }
        const e = candidate;
        const payload = JSON.stringify(e.payload);
        insert.run(
          seq,
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
      if (db.isTransaction) {
        throw new Error("SessionLog.transaction cannot be nested");
      }
      return inTransaction(db, fn);
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
    schemaVersion: 1,
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
