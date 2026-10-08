import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync, StatementSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import type { DecisionOpenedRuling, Event } from "@helmwright/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EventValidationError,
  applyEvent,
  artifactRecorded,
  canonicalJson,
  contextDigest,
  createMapStore,
  decisionFootprintRecorded,
  decisionOpened,
  decisionOutcomeSignalled,
  footprintAddress,
  openSessionLog,
  runRecorded,
  taskCreated,
  type SessionLog,
} from "../../src/index.ts";

// Real node:sqlite files in a fresh temp dir and the real CLI; the only stub is the
// fault injection on the projection write.
const CLI = fileURLToPath(new URL("../../src/cli.ts", import.meta.url));
const RUN = "run-a";
const repoId = "/Users/x/repo/.git";
let dir: string;
let file: string;
let log: SessionLog;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "hw-projection-"));
  file = join(dir, "session.sqlite");
  log = openSessionLog(file);
});
afterEach(() => {
  log.close();
  rmSync(dir, { recursive: true, force: true });
});

let nextId = 0;
function append(type: string, payload: object, runId = RUN): Event {
  nextId += 1;
  return log.append({
    eventId: "evt-" + String(nextId),
    graphId: "graph-1",
    runId,
    nodeId: "node-1",
    type,
    at: new Date().toISOString(),
    payload: { ...payload },
  });
}
/** Runs `fn` on a separate raw connection to `path`. */
function raw<T>(fn: (db: DatabaseSync) => T, path = file): T {
  const db = new DatabaseSync(path);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}
const rowCount = () =>
  raw((db) => db.prepare("SELECT COUNT(*) AS n FROM objects").get()?.["n"]);

const TASK = "task.created";
const RUN_REC = "run.recorded";
const ART = "artifact.recorded";
const OPEN = "decision.opened";
const FP = "decision.footprint.recorded";
const OUT = "decision.outcome.signalled";
const task = (id = "task-1") =>
  taskCreated({ id, repoId, text: "add a dependency", scope: ["src/a.ts"] });
const run = (taskId = "task-1") =>
  runRecorded({
    taskId,
    engine: "scripted",
    baseCommit: "a".repeat(40),
    class: "bounded",
  });
const footprint = (ref: string) =>
  artifactRecorded({
    ...footprintAddress("footprint.file", repoId, ref),
    type: "footprint.file",
    repoId,
    ref,
  });
const [fileA, fileB] = [footprint("src/a.ts"), footprint("src/b.ts")];
const report = artifactRecorded({
  id: "artifact-report-1",
  type: "report",
  repoId,
  ref: "reports/r.json",
  sha256: "c".repeat(64),
});
const ruling = (o: Partial<Omit<DecisionOpenedRuling, "kind">> = {}) =>
  decisionOpened({
    id: "decision-2",
    authority: "harness",
    taskId: "task-1",
    runId: RUN,
    signalIds: ["evt-intake-1"],
    class: null,
    source: "intake",
    ruling: {
      what: "classified the task as bounded",
      why: "It touches one module.",
      costIfWrong: "a missed owner decision",
      rubricVersion: "intake-rubric-1",
    },
    ...o,
  });
const owned = decisionOpened({
  id: "decision-1",
  authority: "owner",
  taskId: "task-1",
  runId: RUN,
  signalIds: ["floor-dep-1"],
  class: "technology",
  source: "floor",
  brief: {
    question: "Which HTTP client should the harness use?",
    options: [
      { id: "a", label: "A", tradeoffs: "more code" },
      { id: "b", label: "B", tradeoffs: "one dependency" },
    ],
    recommendationSha256: "d".repeat(64),
    optionOrderSeed: "e".repeat(32),
    confidence: "medium",
    costIfWrong: "one module to rewrite",
    reversibility: "costly",
    uncertainty: "retries behind a proxy",
    blocked: "the fetch module",
    concepts: ["http-client"],
    // Decision 5: proposal hashes, not links, so this artifact need not exist.
    proposedFootprint: [fileB.id],
  },
});
const d3 = (o: Partial<Omit<DecisionOpenedRuling, "kind">> = {}) =>
  ruling({ id: "decision-3", ...o });
const recorded = (ids: [string, ...string[]], decisionId = "decision-2") =>
  decisionFootprintRecorded(decisionId, ids);
const signal = (ids: [string, ...string[]], runId = RUN) =>
  decisionOutcomeSignalled({
    decisionId: "decision-2",
    signal: "rework",
    runId,
    artifactIds: ids,
  });
const terminal = { kind: "incomplete", reason: "cancelled" };

/** task-1, its run RUN, a footprint of that run and the Ruling decision-2. */
const SEED: [string, object][] = [
  [TASK, task()],
  [RUN_REC, run()],
  [ART, { ...fileA, runId: RUN }],
  [OPEN, ruling()],
];
const seed = () => {
  for (const [type, payload] of SEED) append(type, payload);
};

/** Expects append to refuse with `<type> <reason>`, changing no event and no row. */
function expectRefused(
  reason: string,
  type: string,
  payload: object,
  runId = RUN,
): void {
  const [before, rows] = [log.lastSeq(), rowCount()];
  const decision = log.object("decision-2");
  let error: unknown;
  try {
    append(type, payload, runId);
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(EventValidationError);
  expect((error as Error).message).toContain(type + " " + reason);
  expect([log.lastSeq(), rowCount()]).toEqual([before, rows]);
  expect(log.object("decision-2")).toEqual(decision);
}

describe("append applies object events in the same transaction (B5-3)", () => {
  it("commits an event and its row together, as canonical JSON", () => {
    const { at } = append(TASK, task());
    const record = log.object("task-1");
    expect(record).toMatchObject({ createdSeq: 0, createdAt: at, ring: 0 });
    expect(raw((db) => db.prepare("SELECT * FROM objects").all())).toEqual([
      {
        id: "task-1",
        kind: "task",
        ring: 0,
        created_seq: 0,
        updated_seq: 0,
        record: canonicalJson(record),
      },
    ]);
    expect(log.object("task-2")).toBeUndefined();
  });

  it("rolls back a transaction with a dangling link, and a caught refusal alone", () => {
    expect(() => {
      log.transaction(() => {
        append(TASK, task());
        append(RUN_REC, run("task-9"));
      });
    }).toThrow("run.recorded taskId is not a Task");
    expect([log.lastSeq(), rowCount()]).toEqual([undefined, 0]);

    log.transaction(() => {
      append(TASK, task());
      expect(() => append(RUN_REC, run("task-9"))).toThrow("not a Task");
      append("test.happened", {});
    });
    expect(log.events().map((e) => e.type)).toEqual([TASK, "test.happened"]);
    expect([log.object(RUN), rowCount()]).toEqual([undefined, 1]);
  });

  it("stores no event when the projection write fails", () => {
    const original = Reflect.get(StatementSync.prototype, "run") as unknown;
    const spy = vi
      .spyOn(StatementSync.prototype, "run")
      .mockImplementation(function (this: StatementSync, ...args) {
        if (this.sourceSQL.startsWith("INSERT INTO objects")) {
          throw new Error("disk I/O error");
        }
        return Reflect.apply(original as StatementSync["run"], this, args);
      });
    try {
      expect(() => append(TASK, task())).toThrow("disk I/O error");
    } finally {
      spy.mockRestore();
    }
    expect(log.lastSeq() ?? log.object("task-1")).toBeUndefined();
    expect(append(TASK, task()).seq).toBe(0);
    expect(log.object("task-1")).toMatchObject({ createdSeq: 0 });
  });
});

describe("applyEvent refuses (B5-3)", () => {
  beforeEach(seed);

  it("every dangling link", () => {
    const lost = { ...signal([fileA.id]), decisionId: "decision-9" };
    const cases: [string, string, object, string?][] = [
      ["taskId is not a Task", RUN_REC, run("task-9"), "run-c"],
      ["runId is not a Run", ART, { ...fileB, runId: "run-c" }],
      ["taskId is not a Task", OPEN, d3({ taskId: "task-9" })],
      ["runId is not a Run", OPEN, d3({ runId: "run-c" })],
      ["decisionId is not a Decision", FP, recorded([fileA.id], "decision-9")],
      ["artifactIds are not all footprint Artifacts", FP, recorded([fileB.id])],
      ["decisionId is not a Decision", OUT, lost],
      ["runId is not a Run", OUT, signal([fileA.id], "run-c")],
    ];
    for (const [reason, type, payload, runId] of cases) {
      expectRefused(reason, type, payload, runId);
    }
  });

  it("a link to another task's run, a closed run, a pending decision or a non-footprint", () => {
    append(TASK, task("task-2"));
    append(RUN_REC, run("task-2"), "run-b");
    const other = d3({ runId: "run-b" });
    expectRefused("runId is a run of another task", OPEN, other);
    append(OPEN, owned);
    const pending = recorded([fileA.id], "decision-1");
    expectRefused("decision is not resolved", FP, pending);
    append(ART, report);
    const mixed = recorded([fileA.id, report.id]);
    expectRefused("artifactIds are not all footprint Artifacts", FP, mixed);
    append(FP, recorded([fileA.id]));
    append(ART, fileB);
    const outside = signal([fileA.id, fileB.id]);
    expectRefused("artifactIds are not all in the footprint", OUT, outside);
    append("run.terminated", { terminal });
    expectRefused("runId is a terminated run", OPEN, d3());
  });

  it("a repeated object ID of every kind (decision 1)", () => {
    for (const [type, payload] of SEED) {
      expectRefused("repeats object ID", type, payload);
    }
  });

  it("a second footprint, a second terminal and an invalid terminal", () => {
    append(FP, recorded([fileA.id]));
    expect(log.object("decision-2")).toMatchObject({ footprint: [fileA.id] });
    expectRefused("footprint is already recorded", FP, recorded([fileA.id]));
    const end = "run.terminated";
    const bad = { terminal: { kind: "failed", error: "two\nlines" } };
    expectRefused("does not keep a valid record", end, bad);
    expectRefused("does not keep a valid record", end, {});
    append(end, { terminal });
    expect(log.object(RUN)).toMatchObject({ terminal });
    const again = { terminal: { kind: "completed" } };
    expectRefused("terminal is already set", end, again);
  });
});

describe("applyEvent changes (B5-3)", () => {
  it("ignores run.terminated with no Run row (decision 4) and other events", () => {
    append("run.started", { tools: [] });
    append("run.terminated", { terminal }, "run-legacy");
    append("run.terminated", { contextDigest: "x" });
    expect([log.lastSeq(), rowCount()]).toEqual([2, 0]);
  });

  it("appends outcomes in order with the envelope's at and seq", () => {
    seed();
    append(FP, recorded([fileA.id]));
    const first = append(OUT, signal([fileA.id]));
    const kind = "dependencyChanged";
    const second = append(OUT, { ...signal([fileA.id]), signal: kind });
    const outcome = ({ at, seq }: Event, signal: string) => ({
      ...{ kind: "signal", signal, runId: RUN, artifactIds: [fileA.id] },
      ...{ at, seq },
    });
    expect(log.object("decision-2")).toMatchObject({
      status: "resolved",
      footprint: [fileA.id],
      outcomes: [outcome(first, "rework"), outcome(second, kind)],
    });
    const sql = "SELECT created_seq, updated_seq FROM objects WHERE id = ?";
    expect(raw((db) => db.prepare(sql).get("decision-2"))).toEqual({
      created_seq: 3,
      updated_seq: second.seq,
    });
  });

  it("gives the same records and refusals through a Map store", () => {
    seed();
    append(FP, recorded([fileA.id]));
    append(OUT, signal([fileA.id]));
    const store = createMapStore();
    for (const event of log.events()) {
      expect(applyEvent(store, event)).toBeUndefined();
    }
    for (const id of ["task-1", RUN, fileA.id, "decision-2"]) {
      expect(store.get(id)).toEqual(log.object(id));
    }
    expect(applyEvent(store, log.events()[0] as Event)).toBe(
      "task.created repeats object ID",
    );
  });
});

describe("objects table guard (B5-3)", () => {
  it("refuses raw INSERT, UPDATE and DELETE from another connection", () => {
    append(TASK, task());
    const before = log.object("task-1");
    const writes = [
      "INSERT INTO objects VALUES ('task-2', 'task', 0, 9, 9, '{}')",
      "UPDATE objects SET updated_seq = 5",
      "DELETE FROM objects",
    ];
    raw((db) => {
      for (const sql of writes) {
        expect(() => {
          db.exec(sql);
        }).toThrow(/no such function/);
      }
      // With the function defined the guard still refuses. It is not a security
      // boundary: a raw writer can drop the triggers (B5-3b verify detects that).
      db.function("hw_projection_write", () => 0);
      for (const sql of writes) {
        expect(() => {
          db.exec(sql);
        }).toThrow(/objects is a projection/);
      }
    });
    expect([log.object("task-1"), rowCount()]).toEqual([before, 1]);
  });

  it("refuses to read a row whose record disagrees with its columns", () => {
    append(TASK, task());
    const record = { ...log.object("task-1"), createdSeq: 7 };
    const update = (sql: string, value: object) => {
      raw((db) => {
        db.function("hw_projection_write", () => 1);
        db.prepare(sql).run(JSON.stringify(value));
      });
    };
    update("UPDATE objects SET record = ?", record);
    expect(() => log.object("task-1")).toThrow("corrupt object row task-1");
    update("UPDATE objects SET record = ?, ring = 1", {
      ...record,
      createdSeq: 0,
    });
    expect(() => log.object("task-1")).toThrow("corrupt object row task-1");
  });
});

// Frozen copy of the v2 DDL (main df70055), so the migration meets a real v2 file.
const V2_SCHEMA = `
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
PRAGMA user_version = 2;
`;

describe("session log migration v2 to v3 (B5-3)", () => {
  const ended = { contextDigest: contextDigest([], []), terminal };
  const v2 = () => join(dir, "v2", "session.sqlite");
  /** Writes a v2 log at `v2()` with the frozen DDL and `events` inserted raw. */
  function v2Log(events: readonly (readonly [string, object])[]): void {
    mkdirSync(dirname(v2()), { recursive: true });
    raw((db) => {
      db.exec(V2_SCHEMA);
      const insert = db.prepare(
        "INSERT INTO events VALUES (?, 1, ?, 'graph-1', ?, 'node-1', ?, ?, ?)",
      );
      events.forEach(([type, payload], seq) => {
        const at = new Date().toISOString();
        const id = "evt-v2-" + String(seq);
        insert.run(seq, id, RUN, type, at, JSON.stringify(payload));
      });
    }, v2());
  }
  /** The user_version and table names of the v2 file. */
  const shape = () =>
    raw((db) => {
      const version = db.prepare("PRAGMA user_version").get();
      const tables = db
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'table'")
        .all();
      return {
        version: version?.["user_version"],
        tables: tables.map((row) => row["name"]).sort(),
      };
    }, v2());

  it("backfills the objects of a v2 file and reopens unchanged", () => {
    const events: [string, object][] = [
      ...SEED.slice(0, 2),
      ["run.started", { tools: [] }],
      ...SEED.slice(2),
      [FP, recorded([fileA.id])],
      [OUT, signal([fileA.id])],
      ["run.terminated", ended],
    ];
    v2Log(events);
    const migrated = openSessionLog(v2());
    expect(shape()).toEqual({ version: 3, tables: ["events", "objects"] });
    const stored = migrated.events();
    expect(stored.map((e) => e.type)).toEqual(events.map(([type]) => type));
    const ids = ["task-1", RUN, fileA.id, "decision-2"];
    const records = ids.map((id) => migrated.object(id));
    migrated.close();
    expect(records.map((r) => r?.createdSeq)).toEqual([0, 1, 3, 4]);
    expect(records[1]).toMatchObject({ terminal });
    expect(records[3]).toMatchObject({
      footprint: [fileA.id],
      outcomes: [{ runId: RUN, at: stored[6]?.at, seq: 6 }],
    });

    const again = openSessionLog(v2());
    expect(ids.map((id) => again.object(id))).toEqual(records);
    expect(again.events()).toEqual(stored);
    again.close();
  });

  it.each([
    [
      "a dangling link",
      [[RUN_REC, run()]],
      "seq 0: run.recorded taskId is not a Task",
    ],
    [
      "a refused event",
      [
        [TASK, task()],
        ["decision.owner.resolve", {}],
      ],
      "corrupt event at seq 1",
    ],
    ["no events table", [], "no events table"],
  ] as const)("fails on %s and leaves the file v2", (_, events, cause) => {
    v2Log(events);
    const drop = (db: DatabaseSync) => {
      db.exec("DROP TABLE events");
    };
    if (events.length === 0) raw(drop, v2());
    const before = shape();
    expect(() => openSessionLog(v2())).toThrow("cannot migrate v2 to v3: ");
    expect(() => openSessionLog(v2())).toThrow(cause);
    expect(shape()).toEqual(before);
    expect(before.version).toBe(2);
    expect(before.tables).not.toContain("objects");
  });

  it("migrates a v2 state dir through the real CLI replay (e2e)", () => {
    const args = [CLI, "replay", RUN, "--state-dir", dirname(v2())];
    const replay = () =>
      spawnSync(process.execPath, args, { encoding: "utf8", timeout: 60_000 });
    v2Log([
      ...SEED.slice(0, 2),
      ["run.started", { tools: [] }],
      ["run.terminated", ended],
    ]);
    const passed = replay();
    expect(passed.status, passed.stderr).toBe(0);
    expect(JSON.parse(passed.stdout)).toMatchObject({ match: true, events: 4 });
    const migrated = openSessionLog(v2());
    expect(migrated.object(RUN)).toMatchObject({ terminal });
    migrated.close();

    rmSync(dirname(v2()), { recursive: true });
    v2Log([
      [RUN_REC, run()],
      ["run.terminated", ended],
    ]);
    const refused = replay();
    expect(refused.status).toBe(1);
    expect(refused.stderr).toMatch(/cannot migrate v2 to v3/);
    expect(refused.stdout).toBe("");
    expect(shape().version).toBe(2);
  });
});
