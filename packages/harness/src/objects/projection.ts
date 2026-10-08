import { createHash } from "node:crypto";
import { DatabaseSync, type SQLOutputValue } from "node:sqlite";
import {
  validateObjectEvent,
  validateObjectRecord,
  type DecisionFootprintRecorded,
  type ArtifactRecorded,
  type DecisionOpened,
  type DecisionOutcomeSignalled,
  type Event,
  type ObjectRecord,
  type RunRecorded,
  type TaskCreated,
} from "@helmwright/schema";
import { canonicalJson } from "../loop/reminders.ts";
import {
  OBJECT_EVENT_TYPES,
  ObjectEventError,
  createdRecord,
} from "./events.ts";

// Ring 0 (B5-3): this module must not import the session log, which imports it.

/**
 * The SQL function that the `objects` triggers call. Its name must never change: the
 * triggers in existing log files refer to it.
 */
export const PROJECTION_WRITE_FUNCTION = "hw_projection_write";

const GUARD =
  "WHEN " +
  PROJECTION_WRITE_FUNCTION +
  "() IS NOT 1 BEGIN SELECT RAISE(ABORT, 'objects is a projection: write through SessionLog.append'); END;";

/**
 * The projection table (B5-3, Q26): one row per object, written only by `applyEvent` in
 * the transaction of its event. The triggers stop a connection that has not registered
 * the flag function; they are not a security boundary, because a raw writer can drop them.
 */
export const OBJECTS_SCHEMA = `
CREATE TABLE objects (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  kind TEXT NOT NULL CHECK (kind IN ('task', 'run', 'artifact', 'rule', 'skill', 'decision')),
  ring INTEGER NOT NULL CHECK (ring IN (0, 1, 2)),
  created_seq INTEGER NOT NULL UNIQUE CHECK (created_seq >= 0),
  updated_seq INTEGER NOT NULL CHECK (updated_seq >= created_seq),
  record TEXT NOT NULL CHECK (json_valid(record) AND json_type(record) = 'object'),
  CHECK (substr(id, 1, length(kind) + 1) = kind || '-')
) STRICT, WITHOUT ROWID;
CREATE TRIGGER objects_guard_insert BEFORE INSERT ON objects ${GUARD}
CREATE TRIGGER objects_guard_update BEFORE UPDATE ON objects ${GUARD}
CREATE TRIGGER objects_guard_delete BEFORE DELETE ON objects ${GUARD}
`;

/** Where `applyEvent` reads and writes object records. */
export interface ProjectionStore {
  /** The record with `id`, or undefined. */
  get(id: string): ObjectRecord | undefined;
  /** Creates `record` if `seq` is its `createdSeq`, else replaces the stored record. */
  put(record: ObjectRecord, seq: number): void;
}

/**
 * The store over `objects`; it registers the flag function on `db` (call it before any
 * DDL or row write) and prepares its statements on first use. Rows are canonical JSON,
 * read back with JSON.parse, validateObjectRecord and the id/kind/ring/created_seq check.
 */
export function createSqlStore(db: DatabaseSync): ProjectionStore {
  let writing = false;
  db.function(PROJECTION_WRITE_FUNCTION, () => (writing ? 1 : 0));
  const prepare = () => ({
    select: db.prepare(
      "SELECT id, kind, ring, created_seq, record FROM objects WHERE id = ?",
    ),
    insert: db.prepare(
      "INSERT INTO objects (id, kind, ring, created_seq, updated_seq, record) VALUES (?, ?, ?, ?, ?, ?)",
    ),
    update: db.prepare(
      "UPDATE objects SET updated_seq = ?, record = ? WHERE id = ? AND created_seq = ?",
    ),
  });
  let statements: ReturnType<typeof prepare> | undefined;
  const prepared = () => (statements ??= prepare());
  return {
    get(id) {
      const row = prepared().select.get(id);
      return row === undefined ? undefined : checkedRow(row, id);
    },
    put(record, seq) {
      const { insert, update } = prepared();
      const { id, kind, ring, createdSeq } = record;
      const text = canonicalJson(record);
      writing = true;
      try {
        if (createdSeq === seq) {
          insert.run(id, kind, ring, seq, seq, text);
        } else if (
          Number(update.run(seq, text, id, createdSeq).changes) !== 1
        ) {
          throw new Error("session log: no object row to update");
        }
      } finally {
        writing = false;
      }
    },
  };
}

function checkedRow(
  row: Record<string, SQLOutputValue>,
  id: string,
): ObjectRecord {
  const record = rowRecord(row);
  if (record === undefined) {
    throw new Error("session log: corrupt object row " + id);
  }
  return record;
}

/**
 * The valid record of `row` that agrees with its columns and is stored as its canonical
 * JSON (so key order, spacing, number form, escapes or a repeated key cannot hide an
 * edit from a reader of the text), or undefined.
 */
function rowRecord(
  row: Record<string, SQLOutputValue>,
): ObjectRecord | undefined {
  const text = row["record"];
  let record: unknown;
  try {
    record = typeof text === "string" ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
  return validateObjectRecord(record) &&
    text === canonicalJson(record) &&
    record.id === row["id"] &&
    record.kind === row["kind"] &&
    record.ring === row["ring"] &&
    record.createdSeq === row["created_seq"]
    ? record
    : undefined;
}

/** A store in memory with the same rules, for a rebuild that compares with the table. */
export interface MapStore extends ProjectionStore {
  /** The records by ID. */
  records(): ReadonlyMap<string, ObjectRecord>;
}

/** An in-memory store with the same rules, for a rebuild that compares with the table. */
export function createMapStore(): MapStore {
  const records = new Map<string, ObjectRecord>();
  return {
    records: () => records,
    get(id) {
      const record = records.get(id);
      return record === undefined ? undefined : structuredClone(record);
    },
    put(record, seq) {
      const exists = records.has(record.id);
      if (record.createdSeq === seq ? exists : !exists) {
        throw new Error("session log: object row conflicts with its seq");
      }
      records.set(record.id, structuredClone(record));
    },
  };
}

/**
 * Applies the stored, checked `event` to `store` (B5-3), or returns why the log must
 * refuse it, as fixed text naming fields, never values: a repeated object ID, a missing
 * or changed link, a second footprint or terminal, or a changed record that is invalid
 * or changes more than its key. `run.terminated` with no Run row changes nothing.
 */
export function applyEvent(
  store: ProjectionStore,
  event: Event,
): string | undefined {
  try {
    return apply(store, event);
  } catch (error) {
    if (error instanceof ObjectEventError) return error.message;
    throw error;
  }
}

function apply(store: ProjectionStore, event: Event): string | undefined {
  if (event.type === "run.terminated") return terminated(store, event);
  if (!OBJECT_EVENT_TYPES.includes(event.type)) return undefined;
  const payload: unknown = event.payload;
  if (!validateObjectEvent(payload) || payload.kind !== event.type) {
    return "invalid object event payload";
  }
  if (payload.kind === "decision.footprint.recorded") {
    return footprintRecorded(store, event, payload);
  }
  if (payload.kind === "decision.outcome.signalled") {
    return outcomeSignalled(store, event, payload);
  }
  const record = createdRecord(event);
  if (store.get(record.id) !== undefined) {
    return event.type + " repeats object ID";
  }
  const reason = linkReason(store, payload);
  if (reason === undefined) store.put(record, event.seq);
  return reason;
}

/** Why the links of a creation payload do not hold, if they do not. */
function linkReason(
  store: ProjectionStore,
  p: TaskCreated | RunRecorded | ArtifactRecorded | DecisionOpened,
): string | undefined {
  const kind = (id: string) => store.get(id)?.kind;
  if (p.kind === "task.created") return undefined;
  if (p.kind === "run.recorded") {
    const ok = kind(p.taskId) === "task";
    return ok ? undefined : p.kind + " taskId is not a Task";
  }
  if (p.kind === "artifact.recorded") {
    const ok = p.runId === undefined || kind(p.runId) === "run";
    return ok ? undefined : p.kind + " runId is not a Run";
  }
  if (kind(p.taskId) !== "task") return p.kind + " taskId is not a Task";
  const run = store.get(p.runId);
  if (run?.kind !== "run") return "decision.opened runId is not a Run";
  if (run.taskId !== p.taskId) {
    return "decision.opened runId is a run of another task";
  }
  return run.terminal === null
    ? undefined
    : "decision.opened runId is a terminated run";
}

function footprintRecorded(
  store: ProjectionStore,
  event: Event,
  p: DecisionFootprintRecorded,
): string | undefined {
  const decision = store.get(p.decisionId);
  if (decision?.kind !== "decision") {
    return "decision.footprint.recorded decisionId is not a Decision";
  }
  // Q47 "when the decision closes": Rulings pass; owned decisions wait for SIG.
  if (decision.status !== "resolved") {
    return "decision.footprint.recorded decision is not resolved";
  }
  if (decision.footprint.length > 0) {
    return "decision.footprint.recorded footprint is already recorded";
  }
  for (const id of p.artifactIds) {
    const artifact = store.get(id);
    if (
      artifact?.kind !== "artifact" ||
      !artifact.type.startsWith("footprint.")
    ) {
      return "decision.footprint.recorded artifactIds are not all footprint Artifacts";
    }
  }
  return update(store, event, decision, "footprint", [...p.artifactIds]);
}

function outcomeSignalled(
  store: ProjectionStore,
  event: Event,
  p: DecisionOutcomeSignalled,
): string | undefined {
  const decision = store.get(p.decisionId);
  if (decision?.kind !== "decision") {
    return "decision.outcome.signalled decisionId is not a Decision";
  }
  if (store.get(p.runId)?.kind !== "run") {
    return "decision.outcome.signalled runId is not a Run";
  }
  if (!p.artifactIds.every((id) => decision.footprint.includes(id))) {
    return "decision.outcome.signalled artifactIds are not all in the footprint";
  }
  const outcome = {
    kind: "signal",
    signal: p.signal,
    runId: p.runId,
    artifactIds: [...p.artifactIds],
    at: event.at,
    seq: event.seq,
  };
  const outcomes = [...decision.outcomes, outcome];
  return update(store, event, decision, "outcomes", outcomes);
}

/** Decision 4 (B5-3): with no Run row the run is legacy and nothing changes. */
function terminated(store: ProjectionStore, event: Event): string | undefined {
  const run = store.get(event.runId);
  if (run?.kind !== "run") return undefined;
  if (run.terminal !== null) return "run.terminated terminal is already set";
  return update(store, event, run, "terminal", event.payload["terminal"]);
}

/** The only keys an event may change after creation (SIG and B15 add `status`). */
type MutableKey = "terminal" | "footprint" | "outcomes";

/**
 * Stores `before` with only `key` set to `value`, if the record stays valid (which also
 * applies the 1024 caps on footprint and outcomes).
 */
function update(
  store: ProjectionStore,
  event: Event,
  before: ObjectRecord,
  key: MutableKey,
  value: unknown,
): string | undefined {
  const after: unknown = { ...before, [key]: value };
  if (!validateObjectRecord(after)) {
    return event.type + " does not keep a valid record";
  }
  store.put(after, event.seq);
  return undefined;
}

/** Tags the digest format; a new format gets a new tag. */
const DIGEST_TAG = "helmwright-projection-1";
const MAX_DIFFERING = 20;

/**
 * The projection digest (B5-3b): sha256 of the UTF-8 of canonicalJson([DIGEST_TAG,
 * records sorted by ID]). Sorting is in UTF-16 code-unit order (the default sort, as
 * canonicalJson sorts keys), never SQL text order or localeCompare.
 */
export function projectionDigest(
  records: ReadonlyMap<string, unknown>,
): string {
  const ids = [...records.keys()].sort();
  const sorted = ids.map((id) => records.get(id));
  const text = canonicalJson([DIGEST_TAG, sorted]);
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Each row of `objects` by ID: its record from JSON.parse (never json_extract), or
 * `{ corruptRow }` with the whole row if the record is invalid or disagrees with a column.
 */
export function storedRecords(db: DatabaseSync): Map<string, unknown> {
  const sql = "SELECT id, kind, ring, created_seq, record FROM objects";
  const rows = db.prepare(sql).all();
  return new Map(
    rows.map((row) => [
      String(row["id"]),
      rowRecord(row) ?? { corruptRow: row },
    ]),
  );
}

/** The result of comparing the objects table with a rebuild from the events. */
export interface ProjectionCheck {
  /** True only if `guarded` and the stored and rebuilt digests are equal. */
  readonly match: boolean;
  /** False if the table, its index or a guard trigger is missing, changed or added. */
  readonly guarded: boolean;
  /** The digest of the stored rows; null if the table is missing or changed. */
  readonly storedDigest: string | null;
  readonly rebuiltDigest: string;
  /** The first 20 IDs, in UTF-16 order, whose stored and rebuilt records differ. */
  readonly differingIds: readonly string[];
}

/** Compares the objects table of `db`, and its DDL, with `rebuilt` (B5-3b). */
export function checkProjections(
  db: DatabaseSync,
  rebuilt: ReadonlyMap<string, ObjectRecord>,
): ProjectionCheck {
  const actual = objectsSchema(db);
  const created = createdSchema();
  const guarded =
    actual.size === created.size &&
    [...created].every(([name, entry]) => actual.get(name) === entry);
  const intact = actual.get("objects") === created.get("objects");
  const stored = intact ? storedRecords(db) : new Map<string, unknown>();
  const ids = new Set([...stored.keys(), ...rebuilt.keys()]);
  const differ = (id: string) =>
    canonicalJson(stored.get(id)) !== canonicalJson(rebuilt.get(id));
  const storedDigest = intact ? projectionDigest(stored) : null;
  const rebuiltDigest = projectionDigest(rebuilt);
  return {
    match: guarded && storedDigest === rebuiltDigest,
    guarded,
    storedDigest,
    rebuiltDigest,
    differingIds: [...ids].filter(differ).sort().slice(0, MAX_DIFFERING),
  };
}

/** Name to type and SQL of each schema object on `objects` (table, index, triggers). */
function objectsSchema(db: DatabaseSync): Map<string, string> {
  const sql =
    "SELECT name, type, sql FROM sqlite_schema WHERE tbl_name = 'objects'";
  return new Map(
    db
      .prepare(sql)
      .all()
      .map((row) => [
        String(row["name"]),
        canonicalJson([row["type"], row["sql"]]),
      ]),
  );
}

let createdCache: Map<string, string> | undefined;

/** The schema objects that OBJECTS_SCHEMA creates, from an in-memory database. */
function createdSchema(): Map<string, string> {
  if (createdCache === undefined) {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(OBJECTS_SCHEMA);
      createdCache = objectsSchema(db);
    } finally {
      db.close();
    }
  }
  return createdCache;
}
