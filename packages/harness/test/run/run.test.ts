import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateFloorEvent,
  type FloorFinding,
  type FloorSignal,
} from "@helmwright/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SANDBOX_CLEANUP_FAILED,
  errorMessage,
  executeRun,
  floorChecked,
  floorFaults,
  openSessionLog,
  replayRun,
  runRecorded,
  taskCreated,
  type Engine,
  type EngineTurn,
  type Message,
  type RunSetup,
  type SessionLog,
} from "../../src/index.ts";
import { floorDecision } from "../../src/floor/materiality.ts";
import type { FloorChange } from "../../src/floor/rules.ts";
import { floorSignalled } from "../../src/floor/tree.ts";
import {
  FLOOR_REJECTED,
  FLOOR_UNCHECKED,
  loadTask,
  earlyLine,
  stopReason,
  type EarlyCheck,
  type EarlyShown,
} from "../../src/run/run.ts";

const LIMITS = {
  maxIterations: 5,
  maxToolCallsPerIteration: 2,
  timeoutMs: 60_000,
  noProgressIterations: 5,
};
const DESYNC_AT_1 = /^FAILED: context desync at message index 1 /;
let dir: string;
let log: SessionLog;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "hw-run-"));
  log = openSessionLog(join(dir, "session.sqlite"));
});
afterEach(() => {
  log.close();
  rmSync(dir, { recursive: true, force: true });
});

/**
 * Three steps (tool call, tool call, done). During step `mutateAt` it mutates,
 * in place, the tool-call input it returned at step 1, which the loop's
 * in-memory assistant message (context index 1) shares.
 */
function mutatingEngine(mutateAt: number) {
  const seen: Message[][] = [];
  const input = { argv: ["echo", "logged"] };
  const turns: EngineTurn[] = [
    {
      text: "1",
      toolCalls: [{ id: "c1", name: "t", input }],
      claimsDone: false,
    },
    {
      text: "2",
      toolCalls: [{ id: "c2", name: "t", input: 2 }],
      claimsDone: false,
    },
    { text: "done", toolCalls: [], claimsDone: true },
  ];
  const engine: Engine = {
    step(step) {
      seen.push([...step.messages]);
      if (seen.length === mutateAt) input.argv[1] = "mutated";
      const turn = turns[seen.length - 1];
      if (turn === undefined) throw new Error("script exhausted");
      return Promise.resolve(turn);
    },
  };
  return { engine, seen };
}

const ok = () => Promise.resolve({ status: "ok", output: "out" } as const);

function run(
  engine: Engine,
  checkDesync: boolean,
  runLog = log,
  connect: RunSetup["connect"] = () => ok,
  more: Partial<RunSetup> = {},
) {
  return executeRun({
    ...{ log: runLog, graphId: "graph-1", runId: "run-1", nodeId: "node-1" },
    ...{ title: "task", limits: LIMITS, engine },
    // S5: replay compares floor.checked's base commit with this one.
    started: { baseCommit: "a".repeat(40) },
    tools: [{ name: "t", description: "test tool" }],
    connect,
    checkDesync,
    // SF-2: a run with no floor cannot complete; tests that omit it get a pass.
    floor: () => ({
      checked: floorChecked("a".repeat(40), "a".repeat(40), []),
      before: [],
    }),
    ...more,
  });
}

function terminated() {
  const events = log.events({ runId: "run-1" });
  expect(events.filter((e) => e.type === "run.terminated")).toHaveLength(1);
  return events.at(-1);
}

describe("executeRun", () => {
  it("gives the engine the logged context, not the loop's mutated copy", async () => {
    const { engine, seen } = mutatingEngine(2);
    const outcome = await run(engine, false);
    expect(outcome.terminal).toEqual({ kind: "completed" });
    expect(seen[2]?.[1]).toEqual({
      role: "assistant",
      text: "1",
      toolCalls: [{ id: "c1", name: "t", input: { argv: ["echo", "logged"] } }],
    });
    // The recorded digest is of the loop's own transcript: replay disagrees.
    expect(terminated()?.type).toBe("run.terminated");
    log.close();
    expect(replayRun("run-1", dir)).toMatchObject({ match: false });
    log = openSessionLog(join(dir, "session.sqlite"));
  });

  it("fails the run at the next step when the desync check fires", async () => {
    const { engine, seen } = mutatingEngine(2);
    const outcome = await run(engine, true);
    expect(seen).toHaveLength(2);
    expect(outcome.summary).toMatch(DESYNC_AT_1);
    expect(terminated()?.payload["terminal"]).toEqual(outcome.terminal);
  });

  it("logs run.terminated failed when the final check throws", async () => {
    const { engine, seen } = mutatingEngine(3);
    const outcome = await run(engine, true);
    expect(seen).toHaveLength(3);
    expect(outcome.terminal).toMatchObject({ kind: "failed" });
    expect(outcome.summary).toMatch(DESYNC_AT_1);
    expect(terminated()?.payload).toMatchObject({
      terminal: outcome.terminal,
      contextDigest: outcome.contextDigest,
    });
  });

  it("reports the original error when logging a message fails", async () => {
    let messages = 0;
    const full: SessionLog = {
      append(input) {
        if (input.type === "message.appended" && ++messages === 2) {
          throw new Error("database or disk is full (SQLITE_FULL)");
        }
        return log.append(input);
      },
      transaction: (fn) => log.transaction(fn),
      events: (query) => log.events(query),
      object: (id) => log.object(id),
      verifyProjections: () => log.verifyProjections(),
      rebuildProjections: () => log.rebuildProjections(),
      lastSeq: () => log.lastSeq(),
      close: () => {
        log.close();
      },
    };
    const outcome = await run(mutatingEngine(0).engine, true, full);
    expect(outcome.terminal).toMatchObject({ kind: "failed" });
    expect(outcome.summary).toContain("SQLITE_FULL");
    expect(terminated()?.payload["terminal"]).toEqual(outcome.terminal);
  });

  it("fails the run before the next step once the broker halts it (S6)", async () => {
    const { engine, seen } = mutatingEngine(0);
    const outcome = await run(engine, true, log, ({ emit, halt }) => () => {
      emit("permission.test", { note: "logged by the executor" });
      halt("sandbox cleanup failed");
      return ok();
    });
    // The tool call of step 1 ran; step 2 was never taken.
    expect(seen).toHaveLength(1);
    expect(outcome.terminal).toEqual({
      kind: "failed",
      error: "sandbox cleanup failed",
    });
    const events = log.events({ runId: "run-1" });
    expect(events.map((e) => e.type)).toContain("permission.test");
    expect(terminated()?.payload["terminal"]).toEqual(outcome.terminal);
    log.close();
    expect(replayRun("run-1", dir)).toMatchObject({ match: true });
    log = openSessionLog(join(dir, "session.sqlite"));
  });

  it("refuses the run when connect throws, before any engine step", async () => {
    const { engine, seen } = mutatingEngine(0);
    const outcome = await run(engine, true, log, () => {
      throw new Error("run refused: Ring 0 check of the worktree: bad link");
    });
    expect(seen).toHaveLength(0);
    expect(outcome.terminal).toMatchObject({ kind: "failed" });
    expect(outcome.summary).toContain("run refused");
    const types = log.events({ runId: "run-1" }).map((e) => e.type);
    // The floor still checks the unchanged candidate.
    expect(types).toEqual(["run.started", "floor.checked", "run.terminated"]);
  });

  it("fails a run halted in its last allowed iteration (SF-3)", async () => {
    const { engine } = mutatingEngine(0);
    const outcome = await run(
      engine,
      true,
      log,
      ({ halt }) =>
        () => {
          halt("sandbox cleanup failed");
          return ok();
        },
      { limits: { ...LIMITS, maxIterations: 1 } },
    );
    expect(outcome.terminal).toEqual({
      kind: "failed",
      error: "sandbox cleanup failed",
    });
    expect(terminated()?.payload["terminal"]).toEqual(outcome.terminal);
  });

  it("logs run.terminated only after a timed-out call settles (SF-4)", async () => {
    const { engine } = mutatingEngine(0);
    const outcome = await run(
      engine,
      true,
      log,
      ({ emit, halt }) =>
        () =>
          // Ignores the loop's abort; halts about 50 ms after the run's timeout.
          new Promise((done) => {
            setTimeout(() => {
              emit("permission.test", { note: "late" });
              halt("sandbox cleanup failed");
              done({ status: "ok", output: "late" });
            }, 150);
          }),
      { limits: { ...LIMITS, timeoutMs: 100 } },
    );
    expect(outcome.terminal).toEqual({
      kind: "failed",
      error: "sandbox cleanup failed",
    });
    const types = log.events({ runId: "run-1" }).map((e) => e.type);
    expect(types.slice(-2)).toEqual(["permission.test", "run.terminated"]);
    expect(terminated()?.payload["terminal"]).toEqual(outcome.terminal);
  });

  it("fails a run whose timed-out call never settles (SF-4)", async () => {
    const { engine } = mutatingEngine(0);
    const outcome = await run(
      engine,
      true,
      log,
      () => () => new Promise(() => undefined),
      { limits: { ...LIMITS, timeoutMs: 100 }, settleMs: 50 },
    );
    expect(outcome.terminal).toMatchObject({ kind: "failed" });
    expect(outcome.summary).toContain("sandbox cleanup unconfirmed");
    expect(terminated()?.payload["terminal"]).toEqual(outcome.terminal);
  });

  it("keeps cleanup unconfirmed when the final check throws (S-1)", async () => {
    const outcome = await run(
      mutatingEngine(0).engine,
      true,
      log,
      () => (call) => {
        // Desyncs the logged context, so the final derive throws.
        (call.input as { argv: string[] }).argv[1] = "mutated";
        return new Promise(() => undefined);
      },
      { limits: { ...LIMITS, timeoutMs: 100 }, settleMs: 50 },
    );
    expect(outcome.summary).toContain("sandbox cleanup unconfirmed");
    expect(terminated()?.payload["terminal"]).toEqual(outcome.terminal);
  });

  it("reports a desync when the S-1 call settles (S-1 control)", async () => {
    const outcome = await run(
      mutatingEngine(0).engine,
      true,
      log,
      () => (call) => {
        (call.input as { argv: string[] }).argv[1] = "mutated";
        return ok();
      },
      { limits: { ...LIMITS, timeoutMs: 100 }, settleMs: 50 },
    );
    expect(outcome.summary).toMatch(DESYNC_AT_1);
    expect(terminated()?.payload["terminal"]).toEqual(outcome.terminal);
  });

  it("ranks the loop's own failure above a final desync (Nit-2)", async () => {
    const input = { argv: ["echo", "logged"] };
    const turns = [
      {
        text: "1",
        toolCalls: [{ id: "c1", name: "t", input }],
        claimsDone: false,
      },
    ];
    let steps = 0;
    const engine: Engine = {
      step() {
        steps += 1;
        const turn = turns[steps - 1];
        if (turn !== undefined) return Promise.resolve(turn);
        // After this step's context was checked: the final check desyncs.
        input.argv[1] = "mutated";
        return Promise.reject(new Error("engine broke"));
      },
    };
    const outcome = await run(engine, true);
    // N-3: the final desync stays visible after the loop's own failure.
    expect(outcome.summary).toMatch(
      /^FAILED: engine broke; also: context desync at message index 1 /,
    );
    expect(terminated()?.payload["terminal"]).toEqual(outcome.terminal);
  });

  it("refuses appends from a call that settles after the run ended", async () => {
    // N-2 (#35): no transaction even begins after the run ended.
    const exec = vi.spyOn(DatabaseSync.prototype, "exec");
    const thrown: string[] = [];
    const { promise: late, resolve: settle } =
      Promise.withResolvers<undefined>();
    // The call settles only once executeRun has returned, whatever the load.
    const { promise: runEnded, resolve: endRun } =
      Promise.withResolvers<undefined>();
    const outcome = await run(
      mutatingEngine(0).engine,
      true,
      log,
      ({ emit, emitAll }) =>
        () =>
          new Promise((done) => {
            void runEnded.then(() => {
              for (const append of [
                () => {
                  emit("permission.test", {});
                },
                () => {
                  emitAll([{ type: "permission.test", payload: {} }]);
                },
              ]) {
                try {
                  append();
                } catch (error) {
                  thrown.push(errorMessage(error));
                }
              }
              done({ status: "ok", output: "late" });
              settle(undefined);
            });
          }),
      { limits: { ...LIMITS, timeoutMs: 100 }, settleMs: 50 },
    );
    const begunAtEnd = exec.mock.calls.length;
    endRun(undefined);
    await late;
    const begun = exec.mock.calls.slice(begunAtEnd).map(([sql]) => sql);
    exec.mockRestore();
    expect(begun.filter((sql) => sql.includes("BEGIN"))).toEqual([]);
    expect(outcome.summary).toContain("sandbox cleanup unconfirmed");
    expect(thrown).toEqual(["the run has ended", "the run has ended"]);
    expect(terminated()?.type).toBe("run.terminated");
  });

  it("commits none of an emitAll batch with an invalid event", async () => {
    let failure = "";
    const outcome = await run(
      mutatingEngine(0).engine,
      true,
      log,
      ({ emitAll }) =>
        () => {
          try {
            emitAll([
              { type: "permission.test", payload: { n: 1 } },
              { type: "Not A Type", payload: {} },
            ]);
          } catch (error) {
            failure = errorMessage(error);
          }
          return ok();
        },
    );
    expect(failure).not.toBe("");
    const types = log.events({ runId: "run-1" }).map((e) => e.type);
    expect(types).not.toContain("permission.test");
    expect(outcome.terminal).toMatchObject({ kind: "failed" });
    expect(terminated()?.payload["terminal"]).toEqual(outcome.terminal);
  });

  it("ranks a halt above a later failed append (N-4)", async () => {
    let appends = 0;
    const full: SessionLog = {
      append(input) {
        if (input.type === "permission.test" && ++appends === 1) {
          throw new Error("database or disk is full (SQLITE_FULL)");
        }
        return log.append(input);
      },
      transaction: (fn) => log.transaction(fn),
      events: (query) => log.events(query),
      object: (id) => log.object(id),
      verifyProjections: () => log.verifyProjections(),
      rebuildProjections: () => log.rebuildProjections(),
      lastSeq: () => log.lastSeq(),
      close: () => {
        log.close();
      },
    };
    const outcome = await run(
      mutatingEngine(0).engine,
      true,
      full,
      ({ emit, halt }) =>
        () => {
          halt("halted first");
          expect(() => {
            emit("permission.test", {});
          }).toThrow("SQLITE_FULL");
          return ok();
        },
    );
    expect(outcome.terminal).toEqual({ kind: "failed", error: "halted first" });
  });

  it("lets a sandbox cleanup failure override an earlier halt (S6)", async () => {
    const outcome = await run(
      mutatingEngine(0).engine,
      true,
      log,
      ({ halt }) =>
        () => {
          halt("another reason");
          halt(SANDBOX_CLEANUP_FAILED);
          halt("a later reason");
          return ok();
        },
    );
    expect(outcome.terminal).toEqual({
      kind: "failed",
      error: SANDBOX_CLEANUP_FAILED,
    });
  });

  it("rejects an invalid settleMs before run.started (N-5)", async () => {
    for (const settleMs of [-1, 1.5, Number.NaN, 2 ** 31]) {
      await expect(
        run(mutatingEngine(0).engine, true, log, () => ok, { settleMs }),
      ).rejects.toThrow(RangeError);
    }
    expect(log.events()).toEqual([]);
  });

  it("rejects invalid limits before run.started (N-f)", async () => {
    for (const timeoutMs of [0, Number.NaN]) {
      const limits = { ...LIMITS, timeoutMs };
      await expect(
        run(mutatingEngine(0).engine, true, log, () => ok, { limits }),
      ).rejects.toThrow(RangeError);
    }
    expect(log.events()).toEqual([]);
  });

  it("ranks cleanup unconfirmed above a stop (N-e)", () => {
    const stop = { early: true, timedOut: true, cancelled: true };
    expect(stopReason({ ...stop, unconfirmed: false })).toBe("timeout");
    expect(stopReason({ ...stop, timedOut: false, unconfirmed: false })).toBe(
      "cancelled",
    );
    expect(stopReason({ ...stop, unconfirmed: true })).toBeUndefined();
    expect(
      stopReason({ ...stop, early: false, unconfirmed: false }),
    ).toBeUndefined();
  });
});

describe("executeRun's Task and Run records (B5-4)", () => {
  const records = () => [
    {
      type: "task.created",
      payload: {
        ...taskCreated({
          id: "task-1",
          repoId: "/r/.git",
          text: "task",
          scope: [],
        }),
      },
    },
    {
      type: "run.recorded",
      payload: {
        ...runRecorded({
          ...{ taskId: "task-1", engine: "scripted" },
          ...{ baseCommit: "a".repeat(40), class: "bounded" },
        }),
      },
    },
  ];
  const escaped = { kind: "failed", error: "a\\u{a}b\\u{1b}" } as const;
  const failing: Engine = {
    step: () => Promise.reject(new Error("a\nb\u001b")),
  };

  /** The Run's terminal equals the one run.terminated logged, and the outcome's. */
  function expectRunEnded(terminal: object) {
    expect(terminated()?.payload["terminal"]).toEqual(terminal);
    expect(log.object("run-1")).toMatchObject({
      ...{ kind: "run", taskId: "task-1", class: "bounded" },
      terminal,
    });
  }

  it("logs the records first, in run.started's transaction", async () => {
    const outcome = await run(mutatingEngine(0).engine, true, log, undefined, {
      records,
    });
    const types = log.events({ runId: "run-1" }).map((e) => e.type);
    expect(types.slice(0, 3)).toEqual([
      ...["task.created", "run.recorded", "run.started"],
    ]);
    expect(log.object("task-1")).toMatchObject({ kind: "task", text: "task" });
    expectRunEnded(outcome.terminal);
  });

  // A-dep: floor.signalled, its decisions and floor.checked commit together, or none do.
  const oid = "a".repeat(40);
  const floorSignal: FloorSignal = {
    ...{ id: "evt-signalled:0", type: "dependency.added" },
    ...{ path: "package.json", field: "dependencies", name: "left-pad" },
    ...{ runtime: true, from: null, to: "^1.0.0" },
  };
  // Its Brief's Direct claim cites the signal, which must be in the log (Q70-1).
  const signalled = {
    type: "floor.signalled",
    payload: { kind: "floor.signalled", signals: [floorSignal] },
    eventId: "evt-signalled",
  };
  const decision = floorDecision({
    ...{ runId: "run-1", taskId: "task-1", repoId: "/r/.git", index: 0 },
    signal: floorSignal,
    ...{ threshold: "runtimeAddOrMajor", lockfiles: [], seed: "0".repeat(32) },
    key: new Uint8Array(32),
  });
  const floorWith = (before: readonly object[]) => () => ({
    checked: floorChecked(oid, oid, []),
    before: before as { type: string; payload: Record<string, unknown> }[],
  });

  it("logs the floor's events, then floor.checked, in one transaction (A-dep)", async () => {
    const opened = { type: "decision.opened", payload: { ...decision } };
    const outcome = await run(mutatingEngine(0).engine, true, log, undefined, {
      records,
      floor: floorWith([signalled, opened]),
    });
    expect(outcome).toMatchObject({
      terminal: { kind: "completed" },
      pending: [decision.id],
    });
    const events = log.events({ runId: "run-1" });
    expect(events.slice(-4).map((e) => e.type)).toEqual([
      ...["floor.signalled", "decision.opened", "floor.checked"],
      "run.terminated",
    ]);
    expect(events.at(-4)?.eventId).toBe("evt-signalled");
    expect(log.object(decision.id)).toMatchObject({ status: "pending" });
  });

  it.each<[string, Partial<RunSetup>]>([
    ["failed", {}],
    [
      "halted",
      {
        connect:
          ({ halt }) =>
          () => {
            halt("stopped by the broker");
            return ok();
          },
      },
    ],
  ])("logs the floor's events of a %s run too (A-dep)", async (_kind, more) => {
    const opened = { type: "decision.opened", payload: { ...decision } };
    const engine = more.connect ? mutatingEngine(0).engine : failing;
    const outcome = await run(engine, true, log, more.connect, {
      records,
      floor: floorWith([signalled, opened]),
    });
    expect(outcome).toMatchObject({
      terminal: { kind: "failed" },
      pending: [decision.id],
    });
    const types = log.events({ runId: "run-1" }).map((e) => e.type);
    expect(types.slice(-4)).toEqual([
      ...["floor.signalled", "decision.opened", "floor.checked"],
      "run.terminated",
    ]);
    expect(log.object(decision.id)).toMatchObject({ status: "pending" });
    expectRunEnded(outcome.terminal);
  });

  it("logs none of them and fails closed if the transaction fails (A-dep)", async () => {
    const refused = { type: "decision.opened", payload: { kind: "x" } };
    const outcome = await run(mutatingEngine(0).engine, true, log, undefined, {
      records,
      floor: floorWith([signalled, refused]),
    });
    expect(outcome.pending).toEqual([]);
    expect(outcome.terminal).toMatchObject({ kind: "failed" });
    const { error } = outcome.terminal as { error: string };
    expect(error.startsWith(FLOOR_UNCHECKED + ": ")).toBe(true);
    const types = log.events({ runId: "run-1" }).map((e) => e.type);
    expect(types.at(-2)).toBe("message.appended");
    expect(types).not.toContain("floor.signalled");
    expectRunEnded(outcome.terminal);
  });

  it("logs nothing and rejects if records throws", async () => {
    log.append({
      ...{ eventId: "e0", graphId: "graph-0", runId: "run-0" },
      ...{ nodeId: "node-0", type: "note.test", at: new Date().toISOString() },
      payload: {},
    });
    const before = log.lastSeq();
    const done: EngineTurn = { text: "", toolCalls: [], claimsDone: true };
    const step = vi.fn(() => Promise.resolve(done));
    const throwing = () => {
      throw new Error("task.id task-1 is already recorded");
    };
    await expect(
      run({ step }, true, log, undefined, { records: throwing }),
    ).rejects.toThrow("task.id task-1 is already recorded");
    expect(log.lastSeq()).toBe(before);
    expect(log.events({ runId: "run-1" })).toEqual([]);
    expect(step).not.toHaveBeenCalled();
  });

  it("logs run.terminated with an engine error escaped (requirement a)", async () => {
    const outcome = await run(failing, true, log, undefined, { records });
    expect(outcome.terminal).toEqual(escaped);
    expectRunEnded(escaped);
  });

  it("logs run.terminated with a connect error escaped (requirement a)", async () => {
    const outcome = await run(
      failing,
      true,
      log,
      () => {
        throw new Error("a\nb\u001b");
      },
      { records },
    );
    expect(outcome.terminal).toEqual(escaped);
    expectRunEnded(escaped);
  });

  it("retries run.terminated with the append error escaped (requirement a)", async () => {
    let first = true;
    const flaky: SessionLog = {
      ...log,
      append: (event) => {
        if (event.type === "run.terminated" && first) {
          first = false;
          throw new Error("a\nb\u001b");
        }
        return log.append(event);
      },
    };
    const outcome = await run(
      mutatingEngine(0).engine,
      true,
      flaky,
      undefined,
      {
        records,
      },
    );
    expect(outcome.terminal).toEqual(escaped);
    expectRunEnded(escaped);
  });
});

describe("loadTask (D-1, B5-4)", () => {
  const load = (fields: object) => {
    const file = join(dir, "task.json");
    const task = {
      ...{ id: "task-1", title: "t", repo: "/r" },
      ...{ engine: { kind: "scripted", turns: "t.json" }, limits: LIMITS },
      ...fields,
    };
    writeFileSync(file, JSON.stringify(task));
    return loadTask(file);
  };

  it("bounds the title in code points, as the Task's text", () => {
    const face = "\u{1f600}";
    expect(load({ title: face.repeat(8192) }).title).toBe(face.repeat(8192));
    expect(() => load({ title: face.repeat(8193) })).toThrow("task.title");
    expect(load({ title: "a\tb\r\nc" }).title).toBe("a\tb\r\nc");
    for (const title of ["a\u007f", "a\u0085", "a\u2066", "a\ud800"]) {
      expect(() => load({ title })).toThrow("task.title");
    }
  });

  it("sorts and dedupes the scope, and keeps an invalid one for classify", () => {
    const scope = ["src/b.ts", "src/a.ts", "src/b.ts"];
    expect(load({ intake: { scope } }).intake.scope).toEqual([
      ...["src/a.ts", "src/b.ts"],
    ]);
    expect(load({ intake: { scope: "src" } }).intake.scope).toBe("src");
  });
});

describe("executeRun's sensor floor (B3-2)", () => {
  const oid = "a".repeat(40);
  const finding: FloorFinding = {
    ...{ rule: "suppression.added", path: "src/a.ts" },
    ...{ line: 1, detail: "marker" },
  };
  const pass = () => ({ checked: floorChecked(oid, oid, []), before: [] });
  const reject = () => ({
    checked: floorChecked(oid, oid, [finding]),
    before: [],
  });
  const types = () => log.events({ runId: "run-1" }).map((e) => e.type);

  it("logs floor.checked just before run.terminated; a pass completes", async () => {
    const outcome = await run(mutatingEngine(0).engine, true, log, undefined, {
      floor: pass,
    });
    expect(outcome.terminal).toEqual({ kind: "completed" });
    expect(types().slice(-2)).toEqual(["floor.checked", "run.terminated"]);
    expect(floorFaults(log.events({ runId: "run-1" }))).toEqual([]);
  });

  it("fails a would-be completed run on a finding (OQ-B3-2)", async () => {
    const outcome = await run(mutatingEngine(0).engine, true, log, undefined, {
      floor: reject,
    });
    expect(outcome.terminal).toEqual({ kind: "failed", error: FLOOR_REJECTED });
    expect(terminated()?.payload["terminal"]).toEqual(outcome.terminal);
    expect(types().at(-2)).toBe("floor.checked");
  });

  it("fails closed with the escaped error if the floor throws", async () => {
    const outcome = await run(mutatingEngine(0).engine, true, log, undefined, {
      floor: () => {
        throw new Error("bad \u001b[2J");
      },
    });
    expect(outcome.terminal).toEqual({
      kind: "failed",
      error: FLOOR_UNCHECKED + ": bad \\u{1b}[2J",
    });
    expect(types()).not.toContain("floor.checked");
  });

  it("keeps a failed run's own error on a finding", async () => {
    const engine: Engine = { step: () => Promise.reject(new Error("boom")) };
    const outcome = await run(engine, true, log, undefined, { floor: reject });
    expect(outcome.terminal).toMatchObject({ kind: "failed" });
    expect(outcome.terminal).not.toEqual({
      kind: "failed",
      error: FLOOR_REJECTED,
    });
    expect(types().at(-2)).toBe("floor.checked");
  });

  it("skips the floor after a sandbox cleanup failure (S6)", async () => {
    const floor = vi.fn(pass);
    const outcome = await run(
      mutatingEngine(0).engine,
      true,
      log,
      ({ halt }) =>
        () => {
          halt(SANDBOX_CLEANUP_FAILED);
          return ok();
        },
      { floor },
    );
    expect(outcome.terminal).toEqual({
      kind: "failed",
      error: SANDBOX_CLEANUP_FAILED,
    });
    expect(floor).not.toHaveBeenCalled();
    expect(types()).not.toContain("floor.checked");
  });

  it("faults a floor.checked for another base commit (S5)", async () => {
    await run(mutatingEngine(0).engine, true, log, undefined, {
      floor: () => ({
        checked: floorChecked("b".repeat(40), oid, []),
        before: [],
      }),
    });
    const events = log.events({ runId: "run-1" });
    const seq = String(events.find((e) => e.type === "floor.checked")?.seq);
    expect(floorFaults(events)).toEqual([
      "seq " + seq + ": floor.checked base commit is not run.started's",
    ]);
  });

  it("faults an unknown rules version and a writer after floor.checked (S5)", async () => {
    await run(mutatingEngine(0).engine, true, log, undefined, { floor: pass });
    const events = log.events({ runId: "run-1" });
    const at = events.findIndex((e) => e.type === "floor.checked");
    const floor = events[at];
    const tool = events.find((e) => e.type === "loop.tool.called");
    if (floor === undefined || tool === undefined) throw new Error("no event");
    const unknown = {
      ...floor,
      payload: { ...floor.payload, rules: "floor-99" },
    };
    expect(floorFaults([...events.slice(0, at), unknown])).toEqual([
      "seq " + String(floor.seq) + ": floor.checked rules version is not known",
    ]);
    for (const type of ["loop.tool.called", "message.appended"]) {
      const late = { ...tool, type, seq: floor.seq + 1 };
      expect(floorFaults([...events.slice(0, at + 1), late])).toEqual([
        "seq " + String(late.seq) + ": " + type + " after floor.checked",
      ]);
    }
  });

  it("faults a floor.checked whose payload is another floor event", async () => {
    await run(mutatingEngine(0).engine, true, log, undefined, { floor: pass });
    const events = log.events({ runId: "run-1" });
    const at = events.findIndex((e) => e.type === "floor.checked");
    const floor = events[at];
    if (floor === undefined) throw new Error("no event");
    const { baseCommit, candidateTree } = floor.payload;
    const payload = {
      kind: "floor.signalled",
      detector: "dependency-1",
      phase: "final",
      baseCommit,
      candidateTree,
      materiality: {
        rubricVersion: "materiality-rubric-2",
        threshold: "runtimeAddOrMajor",
      },
      signals: [],
    };
    expect(validateFloorEvent(payload)).toBe(true);
    const seq = "seq " + String(floor.seq) + ": floor.checked ";
    expect(
      floorFaults([...events.slice(0, at), { ...floor, payload }]),
    ).toEqual([
      seq + "that is not a valid floor event",
      seq + "rules version is not known",
    ]);
  });

  it("faults any event but run.terminated after floor.checked (F5)", async () => {
    await run(mutatingEngine(0).engine, true, log, undefined, { floor: pass });
    const events = log.events({ runId: "run-1" });
    const at = events.findIndex((e) => e.type === "floor.checked");
    const floor = events[at];
    if (floor === undefined) throw new Error("no event");
    const type = "intake.overridden";
    const late = { ...floor, type, seq: floor.seq + 1, payload: {} };
    expect(floorFaults([...events.slice(0, at + 1), late])).toEqual([
      "seq " + String(late.seq) + ": " + type + " after floor.checked",
    ]);
  });

  it("replays a floor-1 log and needs run.started's base commit (F6d)", async () => {
    await run(mutatingEngine(0).engine, true, log, undefined, { floor: pass });
    const events = log.events({ runId: "run-1" });
    const floor = events.find((e) => e.type === "floor.checked");
    if (floor === undefined) throw new Error("no event");
    const old = { ...floor, payload: { ...floor.payload, rules: "floor-1" } };
    expect(floorFaults(events.map((e) => (e === floor ? old : e)))).toEqual([]);
    expect(floorFaults(events.filter((e) => e.type !== "run.started"))).toEqual(
      [
        "seq " +
          String(floor.seq) +
          ": floor.checked base commit is not run.started's",
      ],
    );
  });

  it("faults a completed run with no passing floor.checked", async () => {
    const outcome = await run(mutatingEngine(0).engine, true);
    expect(outcome.terminal).toEqual({ kind: "completed" });
    const events = log.events({ runId: "run-1" });
    const seq = String(terminated()?.seq);
    expect(
      floorFaults(events.filter((e) => e.type !== "floor.checked")),
    ).toEqual([
      "seq " + seq + ": completed run without a passing floor.checked",
    ]);
  });

  it("returns the floor.checked it logged (N-1)", async () => {
    const outcome = await run(mutatingEngine(0).engine, true);
    const logged = log.events({ runId: "run-1" }).at(-2)?.payload;
    expect(outcome.floor).toEqual(logged);
  });

  it("fails closed with no floor (SF-2)", async () => {
    const setup = { log, graphId: "graph-1", runId: "run-1", nodeId: "node-1" };
    const outcome = await executeRun({
      ...setup,
      ...{ title: "task", limits: LIMITS, started: {} },
      engine: mutatingEngine(0).engine,
      tools: [{ name: "t", description: "test tool" }],
      connect: () => ok,
    });
    expect(outcome.terminal).toEqual({
      kind: "failed",
      error: FLOOR_UNCHECKED,
    });
    expect(outcome.floor).toBeNull();
  });

  it("fails closed if floor.checked cannot be logged (N-1)", async () => {
    const failing: SessionLog = {
      ...log,
      append: (event) => {
        if (event.type === "floor.checked") throw new Error("disk full");
        return log.append(event);
      },
    };
    const outcome = await run(mutatingEngine(0).engine, true, failing);
    expect(outcome.terminal).toEqual({
      kind: "failed",
      error: FLOOR_UNCHECKED + ": disk full",
    });
    expect(outcome.floor).toBeNull();
  });

  it.each([
    ["reports a leftover container", () => Promise.resolve(false)],
    ["cannot ask docker", () => Promise.reject(new Error("no docker"))],
  ])(
    "skips the floor and fails when cleanup %s (SF-1)",
    async (_, confirmCleanup) => {
      const floor = vi.fn(pass);
      const outcome = await run(mutatingEngine(0).engine, true, log, () => ok, {
        floor,
        confirmCleanup,
      });
      expect(outcome.terminal).toEqual({
        kind: "failed",
        error: SANDBOX_CLEANUP_FAILED,
      });
      expect(floor).not.toHaveBeenCalled();
      expect(types()).not.toContain("floor.checked");
    },
  );
});

describe("executeRun's early dependency check (A-dep-4)", () => {
  const oid = "a".repeat(40);
  const lock = (path: string): FloorChange => ({
    ...{ path, baseMode: "100644", candidateMode: "100644" },
    ...{ base: new Uint8Array([1]), candidate: new Uint8Array([2]) },
  });
  /** An early check's result, event `eventId`, with the lockfiles `paths` changed. */
  const found = (id: string, ...paths: string[]): EarlyCheck => {
    const changes = paths.map(lock);
    const [threshold, phase] = ["runtimeAddOrMajor", "early"] as const;
    const payload = floorSignalled(id, oid, oid, threshold, changes, phase);
    return { eventId: id, payload };
  };
  /** `calls` steps that each call a tool, then one that is done. */
  function calling(calls: number) {
    const steps: { tools: number }[] = [];
    const engine: Engine = {
      step(step) {
        steps.push({ tools: step.tools.length });
        const n = steps.length;
        const call = { id: "c" + String(n), name: "t", input: n };
        const more = steps.length <= calls;
        return Promise.resolve({
          text: String(steps.length),
          toolCalls: more ? [call] : [],
          claimsDone: !more,
        });
      },
    };
    return { engine, steps };
  }
  /** Runs `engine` with `early`, recording the steps taken before each check. */
  function withEarly(
    engine: { engine: Engine; steps: unknown[] },
    early: () => EarlyCheck,
    more: Partial<RunSetup> = {},
  ) {
    const at: number[] = [];
    const shown: EarlyShown[] = [];
    const outcome = run(engine.engine, true, log, () => ok, {
      early: () => {
        at.push(engine.steps.length);
        return early();
      },
      onEarly: (s) => shown.push(s),
      ...more,
    });
    return { outcome, at, shown };
  }
  const earlyEvents = () =>
    log.events({ runId: "run-1" }).filter((e) => e.type === "floor.signalled");

  it("gives the CLI's line for a skipped and a failed check (LOW-3)", () => {
    expect(earlyLine({ kind: "skipped" })).toBe(
      "early dependency check skipped: over the floor limits",
    );
    expect(earlyLine({ kind: "failed", error: "git x failed" })).toBe(
      "early dependency check failed: git x failed",
    );
  });

  it("checks once a call has settled, never at step 1", async () => {
    const done = withEarly(calling(2), () => found("e"));
    expect((await done.outcome).terminal).toEqual({ kind: "completed" });
    expect(done.at).toEqual([1, 2]);
  });

  it("never checks at a handoff step, which offers no tools", async () => {
    const engine = calling(9);
    const limits = { ...LIMITS, maxIterations: 3 };
    const halted = withEarly(engine, () => found("e"), { limits });
    expect((await halted.outcome).terminal).toMatchObject({
      kind: "incomplete",
      reason: "max_iterations",
    });
    expect(engine.steps.map((s) => s.tools)).toEqual([1, 1, 1, 0]);
    expect(halted.at).toEqual([1, 2]);
  });

  it("logs a set only when it changes, from none, and shows each logged one", async () => {
    const results = [
      ...[found("early-1"), found("early-2", "yarn.lock")],
      ...[found("early-3", "yarn.lock"), found("early-4")],
      found("early-5", "bun.lock"),
    ];
    const next = () => results.shift() ?? "limits";
    const limits = { ...LIMITS, maxIterations: 6 };
    const { outcome, shown } = withEarly(calling(5), next, { limits });
    expect((await outcome).terminal).toEqual({ kind: "completed" });
    expect(results).toEqual([]);
    const logged = earlyEvents().map((e) => e.payload);
    expect(logged.map((p) => p["signals"])).toEqual([
      [{ id: "early-2:0", type: "lockfile.only", path: "yarn.lock" }],
      [],
      [{ id: "early-5:0", type: "lockfile.only", path: "bun.lock" }],
    ]);
    expect(logged.every((p) => p["phase"] === "early")).toBe(true);
    const counts = shown.map((s) => s.kind === "signalled" && s.signals.length);
    expect(counts).toEqual([1, 0, 1]);
    // Logged with the event IDs the signal IDs name; nothing reaches the engine.
    const events = earlyEvents().map((e) => e.eventId);
    expect(events).toEqual(["early-2", "early-4", "early-5"]);
    const sent = log
      .events({ runId: "run-1" })
      .flatMap((e) => (e.type === "message.appended" ? [e.payload] : []));
    expect(JSON.stringify(sent)).not.toContain("lockfile.only");
  });

  it("only shows a failed check, once per message, and the run completes", async () => {
    let n = 0;
    const { outcome, at, shown } = withEarly(calling(4), () => {
      n += 1;
      throw new Error(n < 3 ? "git add failed (exit 1)" : "other");
    });
    expect((await outcome).terminal).toEqual({ kind: "completed" });
    expect((await outcome).floor).toMatchObject({ verdict: "pass" });
    expect(at).toEqual([1, 2, 3, 4]);
    expect(shown).toEqual([
      { kind: "failed", error: "git add failed (exit 1)" },
      { kind: "failed", error: "other" },
    ]);
    expect(earlyEvents()).toEqual([]);
  });

  it("logs nothing past the limits, shows the skip once and stops checking", async () => {
    const { outcome, at, shown } = withEarly(calling(3), () => "limits");
    expect((await outcome).terminal).toEqual({ kind: "completed" });
    // No more git work at later boundaries: the closure is called once.
    expect(at).toEqual([1]);
    expect(shown).toEqual([{ kind: "skipped" }]);
    expect(earlyEvents()).toEqual([]);
  });

  it("never fails the run when the owner's callback throws", async () => {
    let n = 0;
    const check = () => {
      n += 1;
      if (n === 2) throw new Error("git add failed (exit 1)");
      return found("early-" + String(n), n === 1 ? "yarn.lock" : "bun.lock");
    };
    const onEarly = () => {
      throw Object.assign(new Error("write EPIPE"), { code: "EPIPE" });
    };
    const { outcome, at } = withEarly(calling(3), check, { onEarly });
    expect((await outcome).terminal).toEqual({ kind: "completed" });
    expect(at).toEqual([1, 2, 3]);
    expect(earlyEvents().map((e) => e.eventId)).toEqual(["early-1", "early-3"]);
  });

  it("checks nothing once the run is cancelled", async () => {
    // This pins the loop's halt-before-step behaviour: after an abort runLoop takes no
    // further step. The step wrapper's abort guard is defence in depth, which runLoop
    // cannot reach.
    const cancel = new AbortController();
    let calls = 0;
    const connect: RunSetup["connect"] = () => () => {
      calls += 1;
      if (calls === 2) cancel.abort();
      return ok();
    };
    const check = () => found("e", "yarn.lock");
    const { outcome, at } = withEarly(calling(4), check, {
      connect,
      signal: cancel.signal,
    });
    expect((await outcome).terminal).toEqual({
      kind: "incomplete",
      reason: "cancelled",
    });
    // Checked after call 1, never after the cancel during call 2.
    expect(at).toEqual([1]);
  });

  it("checks nothing after a halt", async () => {
    const connect: RunSetup["connect"] = ({ halt }) => {
      return () => {
        halt("sandbox cleanup failed");
        return ok();
      };
    };
    const check = () => found("e", "yarn.lock");
    const { outcome, at } = withEarly(calling(2), check, { connect });
    expect((await outcome).terminal).toMatchObject({ kind: "failed" });
    expect(at).toEqual([]);
  });

  it("fails the run when the early event cannot be logged", async () => {
    const failing: SessionLog = {
      ...log,
      append: (event) => {
        if (event.type === "floor.signalled") throw new Error("disk full");
        return log.append(event);
      },
    };
    const check = () => found("e", "bun.lock");
    const { outcome, at, shown } = withEarly(calling(2), check, {
      log: failing,
    });
    expect((await outcome).terminal).toEqual({
      kind: "failed",
      error: "disk full",
    });
    expect(at).toEqual([1]);
    expect(shown).toEqual([]);
  });
});
