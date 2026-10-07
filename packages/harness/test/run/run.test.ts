import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SANDBOX_CLEANUP_FAILED,
  errorMessage,
  executeRun,
  openSessionLog,
  replayRun,
  type Engine,
  type EngineTurn,
  type Message,
  type RunSetup,
  type SessionLog,
} from "../../src/index.ts";

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
    ...{ title: "task", limits: LIMITS, started: {}, engine },
    tools: [{ name: "t", description: "test tool" }],
    connect,
    checkDesync,
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
    expect(types).toEqual(["run.started", "run.terminated"]);
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
    const outcome = await run(
      mutatingEngine(0).engine,
      true,
      log,
      ({ emit, emitAll }) =>
        () =>
          new Promise((done) => {
            setTimeout(() => {
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
            }, 200);
          }),
      { limits: { ...LIMITS, timeoutMs: 100 }, settleMs: 50 },
    );
    const begunAtEnd = exec.mock.calls.length;
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
});
