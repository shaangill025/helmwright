import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import {
  validateObjectRecord,
  type DecisionBrief,
  type DecisionOpenedOwned,
  type DecisionOpenedRuling,
  type Event,
} from "@helmwright/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EventValidationError,
  ObjectEventError,
  artifactRecorded,
  checkObjectEvent,
  contextDigest,
  createdRecord,
  decisionFootprintRecorded,
  decisionOpened,
  decisionOutcomeSignalled,
  footprintAddress,
  openSessionLog,
  runRecorded,
  taskCreated,
  type AppendInput,
  type SessionLog,
} from "../../src/index.ts";

// Real node:sqlite database files in a fresh temp dir and the real CLI; no mocks.
const CLI = fileURLToPath(new URL("../../src/cli.ts", import.meta.url));
const runId = "run-0b7e2c51-58a4-4f0e-9d0c-3d1f4b2a6e90";
const repoId = "/Users/x/repo/.git";
let dir: string;
let file: string;
let log: SessionLog;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "hw-objects-"));
  file = join(dir, "session.sqlite");
  log = openSessionLog(file);
});
afterEach(() => {
  log.close();
  rmSync(dir, { recursive: true, force: true });
});

let nextId = 0;
function input(
  type: string,
  payload: Record<string, unknown>,
  overrides: Partial<AppendInput> = {},
): AppendInput {
  nextId += 1;
  return {
    eventId: "evt-" + String(nextId),
    graphId: "graph-1",
    runId,
    nodeId: "node-1",
    type,
    at: new Date().toISOString(),
    payload,
    ...overrides,
  };
}
const append = (type: string, payload: object) =>
  log.append(input(type, { ...payload }));
/** Inserts a row past every check but the table triggers, as a raw writer could. */
function rawInsert(type: string, payload: object): number {
  const seq = (log.lastSeq() ?? -1) + 1;
  const raw = new DatabaseSync(file);
  raw
    .prepare(
      "INSERT INTO events (seq, schema_version, event_id, graph_id, run_id," +
        " node_id, type, at, payload) VALUES (?, 1, ?, 'graph-1', ?, 'node-1', ?, ?, ?)",
    )
    .run(
      seq,
      "raw-" + String(seq),
      runId,
      type,
      new Date().toISOString(),
      JSON.stringify(payload),
    );
  raw.close();
  return seq;
}

const footprint = footprintAddress("footprint.file", repoId, "src/a.ts");
const option = (id: "a" | "b" | "c" | "d") => ({
  id,
  label: "Option " + id,
  tradeoffs: "one more dependency, less code to keep",
});
const brief: DecisionBrief = {
  question: "Which HTTP client should the harness use?",
  options: [option("a"), option("b")],
  recommendationSha256: "d".repeat(64),
  optionOrderSeed: "e".repeat(32),
  confidence: "medium",
  costIfWrong: "one module to rewrite",
  reversibility: "costly",
  uncertainty: "how retries behave behind a proxy",
  blocked: "the fetch module",
  concepts: ["http-client"],
  proposedFootprint: [footprint.id],
};
const owned: Omit<DecisionOpenedOwned, "kind"> = {
  id: "decision-1",
  authority: "owner",
  taskId: "task-1",
  runId,
  signalIds: ["floor-dep-1"],
  class: "technology",
  source: "floor",
  brief,
};
const ruling: Omit<DecisionOpenedRuling, "kind"> = {
  id: "decision-2",
  authority: "harness",
  taskId: "task-1",
  runId,
  signalIds: ["evt-intake-1"],
  class: null,
  source: "intake",
  ruling: {
    what: "classified the task as bounded",
    why: "It touches one module and adds no dependency.",
    costIfWrong: "a missed owner decision",
    rubricVersion: "intake-rubric-1",
  },
};
const task = taskCreated({
  id: "task-1",
  repoId,
  text: "add a dependency",
  scope: ["src/b.ts", "src/a.ts", "src/b.ts"],
});
const run = runRecorded({
  taskId: "task-1",
  engine: "scripted",
  baseCommit: "a".repeat(40),
  class: "bounded",
});
const artifact = artifactRecorded({
  ...footprint,
  type: "footprint.file",
  repoId,
  ref: "src/a.ts",
});

/** Expects `append` to refuse with EventValidationError and to store nothing. */
function expectRefused(type: string, payload: object, reason: RegExp): void {
  const before = log.lastSeq();
  let error: unknown;
  try {
    append(type, payload);
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(EventValidationError);
  expect((error as Error).message).toMatch(reason);
  expect(log.lastSeq()).toBe(before);
}

describe("SessionLog.append refuses (B5-2, OD-3)", () => {
  beforeEach(() => {
    append("run.started", { tools: [] });
  });

  it.each([
    "decision.owner.precommit",
    "decision.owner.precommit.skip",
    "decision.owner.resolve",
    "decision.owner.review",
    "decision.owner.unknownaction",
  ])("%s until SIG (Q-B5-1)", (type) => {
    expectRefused(type, { kind: type }, /refused until SIG/);
  });

  it("decision.recommendation.revealed until A3 (OD-2)", () => {
    const type = "decision.recommendation.revealed";
    expectRefused(type, { kind: type }, /refused until A3/);
  });

  it.each(["decision.opend", "task.updated", "artifact.deleted"])(
    "the unknown claimed type %s (OD-4)",
    (type) => {
      expectRefused(type, { kind: type }, /unknown object event type/);
    },
  );

  it.each([
    ["kind of another type", { ...task, kind: "run.recorded" }, /invalid/],
    ["blank text", { ...task, text: "   " }, /invalid/],
    ["unsorted scope", { ...task, scope: ["b", "a"] }, /sorted/],
    ["repeated scope", { ...task, scope: ["a", "a"] }, /sorted/],
  ])("task.created with %s", (_, payload, reason) => {
    expectRefused("task.created", payload, reason);
  });

  it.each([
    ["id", { ...artifact, id: "artifact-" + "b".repeat(64) }],
    ["sha256", { ...artifact, sha256: "b".repeat(64) }],
    ["repoId", { ...artifact, repoId: "/Users/y/repo/.git" }],
  ])("a footprint artifact whose %s breaks the content address", (_, a) => {
    expectRefused("artifact.recorded", a, /content-addressed/);
  });

  it.each([
    ["signal", { ...owned, signalIds: ["s-1", "s-1"] }, /signalIds/],
    [
      "option",
      { ...owned, brief: { ...brief, options: [option("a"), option("a")] } },
      /option IDs/,
    ],
    [
      "concept",
      { ...owned, brief: { ...brief, concepts: ["x", "x"] } },
      /concepts/,
    ],
    [
      "footprint",
      {
        ...owned,
        brief: { ...brief, proposedFootprint: [footprint.id, footprint.id] },
      },
      /proposedFootprint/,
    ],
  ])("decision.opened with a repeated %s ID", (_, decision, reason) => {
    expectRefused(
      "decision.opened",
      { ...decision, kind: "decision.opened" },
      reason,
    );
  });

  it("an intake Ruling with an owned class, and repeated artifact IDs", () => {
    const opened = { ...ruling, class: "scope", kind: "decision.opened" };
    expectRefused("decision.opened", opened, /class null/);
    for (const kind of [
      "decision.footprint.recorded",
      "decision.outcome.signalled",
    ]) {
      const ids = [footprint.id, footprint.id];
      const signal = { signal: "rework", runId };
      const payload = { kind, decisionId: "decision-1", artifactIds: ids };
      expectRefused(
        kind,
        { ...payload, ...(kind.endsWith("signalled") ? signal : {}) },
        /repeat/,
      );
    }
  });

  it("a run.recorded whose envelope runId is not a Run ID", () => {
    expect(() =>
      log.append(input("run.recorded", { ...run }, { runId: "r-1" })),
    ).toThrow(/does not create a valid record/);
    expect(log.lastSeq()).toBe(0);
  });

  it("rolls back a whole transaction with a refused event", () => {
    expect(() => {
      log.transaction(() => {
        append("task.created", task);
        append("decision.owner.precommit", {
          kind: "decision.owner.precommit",
        });
      });
    }).toThrow(EventValidationError);
    expect(log.events().map((e) => e.type)).toEqual(["run.started"]);
  });
});

describe("SessionLog reads (B5-2, OD-3)", () => {
  it.each([
    ["decision.owner.precommit", { kind: "decision.owner.precommit" }],
    ["task.created", { ...task, scope: ["b", "a"] }],
  ])("fail closed on a raw-inserted %s row", (type, payload) => {
    append("run.started", { tools: [] });
    append("config.accepted", { repo: repoId });
    const seq = rawInsert(type, payload);
    const corrupt = "corrupt event at seq " + String(seq);
    expect(() => log.events()).toThrow(corrupt);
    expect(() => log.events({ runId })).toThrow(corrupt);
    expect(log.events({ type: "config.accepted" })).toHaveLength(1);
    expect(log.events({ fromSeq: seq + 1 })).toEqual([]);
  });
});

describe("object event builders and createdRecord (OD-1, OD-8)", () => {
  it("logs each builder's payload and maps each creation to a valid record", () => {
    const stored = log.transaction(() => [
      append("task.created", task),
      append("run.recorded", run),
      append("artifact.recorded", artifact),
      append("decision.opened", decisionOpened(owned)),
      append("decision.opened", decisionOpened(ruling)),
      // B5-3: only a resolved decision (here the Ruling) takes a footprint.
      append(
        "decision.footprint.recorded",
        decisionFootprintRecorded("decision-2", [footprint.id]),
      ),
      append(
        "decision.outcome.signalled",
        decisionOutcomeSignalled({
          decisionId: "decision-2",
          signal: "rework",
          runId,
          artifactIds: [footprint.id],
        }),
      ),
    ]);
    expect(log.events()).toEqual(stored);
    const [t, r, a, o, h] = stored.map((e) => e.seq);
    const records = stored.slice(0, 5).map(createdRecord);
    for (const record of records)
      expect(validateObjectRecord(record)).toBe(true);
    const at = (seq: number | undefined) => stored[seq ?? -1]?.at;
    expect(records).toMatchObject([
      {
        kind: "task",
        id: "task-1",
        createdSeq: t,
        createdAt: at(t),
        status: "open",
      },
      {
        kind: "run",
        id: runId,
        graphId: "graph-1",
        nodeId: "node-1",
        createdSeq: r,
        createdAt: at(r),
        terminal: null,
      },
      { kind: "artifact", id: footprint.id, createdSeq: a, createdAt: at(a) },
      {
        kind: "decision",
        status: "pending",
        footprint: [],
        outcomes: [],
        createdSeq: o,
      },
      { kind: "decision", status: "resolved", class: null, createdSeq: h },
    ]);
    expect(records[0]).toMatchObject({ scope: ["src/a.ts", "src/b.ts"] });
    expect(() => createdRecord(stored[5] as Event)).toThrow(ObjectEventError);
  });

  it("addresses a footprint by the known vector", () => {
    const sha256 =
      "dbbc4be9cd6e5110f47a9bf4e496c676a7efb16cf68574d0cd20b5769ea815f5";
    expect(footprint).toEqual({ id: "artifact-" + sha256, sha256 });
  });

  it("throws ObjectEventError from a builder whose payload the log would refuse", () => {
    const bad = { ...owned, signalIds: ["s-1", "s-1"] };
    expect(() => decisionOpened(bad)).toThrow(ObjectEventError);
    expect(() => decisionFootprintRecorded("decision-1", [])).toThrow(
      /cannot be logged/,
    );
    expect(() =>
      artifactRecorded({ ...artifact, sha256: "b".repeat(64) }),
    ).toThrow(/content-addressed/);
  });

  it("still appends other types, run.* included (no regression)", () => {
    append("run.started", { tools: [] });
    append("run.terminated", { contextDigest: "x" });
    append("test.happened", { n: 1 });
    expect(log.events().map((e) => e.seq)).toEqual([0, 1, 2]);
    const event = {
      ...input("intake.classified", {}),
      seq: 0,
      schemaVersion: 1,
    };
    expect(checkObjectEvent(event as Event)).toBeUndefined();
  });
});

// It spawns the CLI twice: an explicit timeout, not the 5 s default.
describe(
  "replay through the real CLI (B5-2, e2e without Docker)",
  { timeout: 120_000 },
  () => {
    it("fails a replay that includes a raw-inserted owner event", () => {
      append("run.started", { tools: [] });
      append("run.terminated", { contextDigest: contextDigest([], []) });
      const replay = () =>
        spawnSync(
          process.execPath,
          [CLI, "replay", runId, "--state-dir", dir],
          {
            encoding: "utf8",
            timeout: 60_000,
          },
        );
      const control = replay();
      expect(control.status, control.stderr).toBe(0);
      rawInsert("decision.owner.precommit", {
        kind: "decision.owner.precommit",
      });
      const refused = replay();
      expect(refused.status).toBe(1);
      expect(refused.stderr).toMatch(/corrupt event at seq 2/);
      expect(refused.stdout).toBe("");
    });
  },
);
