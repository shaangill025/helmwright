import { describe, expect, it, vi } from "vitest";
import {
  FALLBACK_SUMMARY,
  MAX_LIMIT,
  createCallCounters,
  runLoop,
  validateLimits,
  type CallCounters,
  type Engine,
  type EngineTurn,
  type LoopLimits,
  type LoopResult,
  type Message,
  type ToolCall,
  type ToolResult,
  type ToolSpec,
} from "../../src/index.ts";

const EVENT_TYPE = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/;
const TOOLS: readonly ToolSpec[] = [
  { name: "read", description: "Read a file" },
];
const LIMITS: LoopLimits = {
  maxIterations: 10,
  maxToolCallsPerIteration: 5,
  timeoutMs: 60_000,
  noProgressIterations: 100,
};

type Step = EngineTurn | Error | ((signal: AbortSignal) => Promise<EngineTurn>);
interface SeenStep {
  messages: Message[];
  tools: ToolSpec[];
  signal: AbortSignal;
}

function turn(
  text: string,
  toolCalls: ToolCall[] = [],
  claimsDone = false,
): EngineTurn {
  return { text, toolCalls, claimsDone };
}
let nextId = 0;
const read = (path: unknown): ToolCall => {
  nextId += 1;
  return { id: `call-${String(nextId)}`, name: "read", input: { path } };
};

function scripted(steps: Step[]): { engine: Engine; seen: SeenStep[] } {
  const seen: SeenStep[] = [];
  const engine: Engine = {
    step(input) {
      seen.push({
        messages: [...input.messages],
        tools: [...input.tools],
        signal: input.signal,
      });
      const next =
        steps[seen.length - 1] ?? turn("handoff: did some, rest remains");
      if (next instanceof Error) return Promise.reject(next);
      if (typeof next === "function") return next(input.signal);
      return Promise.resolve(next);
    },
  };
  return { engine, seen };
}

function manualTimers() {
  let now = 0;
  const timers: { at: number; fn: () => void; active: boolean }[] = [];
  return {
    clock: { now: () => now },
    schedule(ms: number, fn: () => void): () => void {
      const timer = { at: now + ms, fn, active: true };
      timers.push(timer);
      return () => {
        timer.active = false;
      };
    },
    active: () => timers.filter((t) => t.active).length,
    advance(ms: number, fire = true): void {
      now += ms;
      for (const timer of timers) {
        if (fire && timer.active && timer.at <= now) {
          timer.active = false;
          timer.fn();
        }
      }
    },
  };
}

interface RunOptions {
  limits?: Partial<LoopLimits>;
  status?: ToolResult["status"];
  agentId?: string;
  counters?: CallCounters;
  signal?: AbortSignal;
  timers?: ReturnType<typeof manualTimers>;
  executeTool?: (call: ToolCall) => Promise<ToolResult>;
}

async function run(engine: Engine, opts: RunOptions = {}) {
  const events: { type: string; payload: Record<string, unknown> }[] = [];
  const timers = opts.timers ?? manualTimers();
  const executeTool = vi.fn(
    opts.executeTool ??
      ((call: ToolCall) =>
        Promise.resolve<ToolResult>({
          status: opts.status ?? "ok",
          output: `ran ${call.name}`,
        })),
  );
  const result: LoopResult = await runLoop(
    {
      agentId: opts.agentId ?? "agent-1",
      messages: [{ role: "user", text: "do the task" }],
      tools: TOOLS,
      limits: { ...LIMITS, ...opts.limits },
      ...(opts.signal ? { signal: opts.signal } : {}),
    },
    {
      engine,
      executeTool,
      clock: timers.clock,
      schedule: (ms, fn) => timers.schedule(ms, fn),
      emit: (type, payload) => events.push({ type, payload }),
      ...(opts.counters ? { counters: opts.counters } : {}),
    },
  );
  for (const event of events) {
    expect(event.type).toMatch(EVENT_TYPE);
    expect(JSON.parse(JSON.stringify(event.payload))).toEqual(event.payload);
  }
  const terminated = events.filter((e) => e.type === "run.terminated");
  expect(terminated).toHaveLength(1);
  expect(terminated[0]?.payload["terminal"]).toEqual(result.terminal);
  // The deadline (and any handoff) timer is cancelled on every exit path.
  expect(timers.active()).toBe(0);
  return { result, events, executeTool };
}

const incomplete = (reason: string) => ({ kind: "incomplete", reason });
const reminders = (messages: Message[]) =>
  messages.filter(
    (m) => m.role === "system" && m.text.includes("repeats an earlier"),
  );

describe("runLoop", () => {
  it("completes when the engine ends its turn without tool calls", async () => {
    const { engine, seen } = scripted([
      turn("reading", [read("a")]),
      turn("finished", [], true),
    ]);
    const { result, executeTool } = await run(engine);
    expect(result.terminal).toEqual({ kind: "completed" });
    expect(result.summary).toBe("finished");
    expect(result.iterations).toBe(2);
    expect(result.toolCalls).toBe(1);
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(seen[1]?.messages.some((m) => m.text.includes("ran read"))).toBe(
      true,
    );
    expect(result.transcript.turns).toHaveLength(2);
  });

  it("halts at max_iterations with a tools-stripped handoff step", async () => {
    const { engine, seen } = scripted([
      turn("one", [read("a")], true),
      turn("two", [read("b")], true),
      turn("I am done", [], true),
    ]);
    const { result } = await run(engine, { limits: { maxIterations: 2 } });
    expect(result.terminal).toEqual(incomplete("max_iterations"));
    expect(seen).toHaveLength(3);
    expect(seen[2]?.tools).toEqual([]);
    expect(seen[2]?.messages.at(-1)?.role).toBe("system");
    expect(seen[2]?.messages.at(-1)?.text).toMatch(/handoff/i);
    expect(result.summary).toBe("INCOMPLETE (max_iterations): I am done");
  });

  it.each([
    ["fails", () => Promise.reject(new Error("handoff broke")), true],
    ["hangs past its bound", "hang", true],
    ["is cancelled", "cancel", true],
    ["returns empty text", () => Promise.resolve(turn("")), false],
  ] as const)("falls back when the handoff step %s", async (_, how, failed) => {
    const timers = manualTimers();
    const controller = new AbortController();
    const { engine } = scripted([
      turn("one", [read("a")]),
      typeof how === "function"
        ? how
        : () => {
            if (how === "hang") timers.advance(LIMITS.timeoutMs);
            else controller.abort();
            return new Promise<EngineTurn>(() => undefined);
          },
    ]);
    const { result, events } = await run(engine, {
      limits: { maxIterations: 1 },
      signal: controller.signal,
      timers,
    });
    expect(result.terminal).toEqual(incomplete("max_iterations"));
    expect(result.summary).toBe(
      `INCOMPLETE (max_iterations): ${FALLBACK_SUMMARY}`,
    );
    const types = events.map((e) => e.type);
    expect(types.includes("loop.handoff.failed")).toBe(failed);
  });

  it("times out before a step once the clock passes the deadline", async () => {
    const timers = manualTimers();
    const { engine, seen } = scripted([turn("first", [read("a")]), turn("x")]);
    const { result } = await run(engine, {
      timers,
      executeTool: () => {
        timers.advance(LIMITS.timeoutMs + 1, false);
        return Promise.resolve({ status: "ok", output: "" });
      },
    });
    expect(seen).toHaveLength(1);
    expect(result.terminal).toEqual(incomplete("timeout"));
  });

  it("halts at max_tool_calls without executing the excess calls", async () => {
    const { engine, seen } = scripted([
      turn("many", [read("a"), read("b"), read("c")]),
    ]);
    const { result, executeTool, events } = await run(engine, {
      limits: { maxToolCallsPerIteration: 2 },
    });
    const results = (seen[1]?.messages ?? []).filter((m) => m.role === "tool");
    expect(results.map((m) => m.toolCallId)).toEqual(
      result.transcript.turns[0]?.toolCalls.map((c) => c.id),
    );
    expect(results[2]).toMatchObject({
      status: "denied",
      text: "not executed: per-iteration tool-call cap",
    });
    expect(events.filter((e) => e.type === "loop.tool.skipped")).toHaveLength(
      1,
    );
    expect(executeTool).toHaveBeenCalledTimes(2);
    expect(result.toolCalls).toBe(2);
    expect(result.terminal).toEqual(incomplete("max_tool_calls"));
    expect(seen[1]?.tools).toEqual([]);
    expect(result.summary.startsWith("INCOMPLETE (max_tool_calls): ")).toBe(
      true,
    );
  });

  it("sends reminders at exactly 3, 5 and 8 identical calls, counting denied calls", async () => {
    const steps: Step[] = Array.from({ length: 9 }, (_, i) =>
      turn(`try ${String(i)}`, [read("x")]),
    );
    const { engine, seen } = scripted([...steps, turn("stop")]);
    const { result, events, executeTool } = await run(engine, {
      status: "denied",
    });
    expect(result.terminal).toEqual({ kind: "completed" });
    expect(executeTool).toHaveBeenCalledTimes(9);
    const sent = events
      .filter((e) => e.type === "loop.reminder.sent")
      .map((e) => e.payload["count"]);
    expect(sent).toEqual([3, 5, 8]);
    // Reminder after call n reaches step n + 1 (index n); none at 4, 6, 7.
    const counts = seen.map((s) => reminders(s.messages).length);
    expect(counts).toEqual([0, 0, 0, 1, 1, 2, 2, 2, 3, 3]);
    expect(reminders(seen[3]?.messages ?? [])[0]?.text).toMatch(/\b3\b/);
  });

  it("keeps identical-call counters per agent", async () => {
    const counters = createCallCounters();
    const twice = () =>
      scripted([turn("", [read("x")]), turn("", [read("x")]), turn("end")]);
    const a1 = await run(twice().engine, { agentId: "a", counters });
    const b1 = await run(twice().engine, { agentId: "b", counters });
    expect(
      [...a1.events, ...b1.events].some((e) => e.type === "loop.reminder.sent"),
    ).toBe(false);
    const a2 = await run(
      scripted([turn("", [read("x")]), turn("end")]).engine,
      {
        agentId: "a",
        counters,
      },
    );
    const sent = a2.events.filter((e) => e.type === "loop.reminder.sent");
    expect(sent.map((e) => e.payload["count"])).toEqual([3]);
  });

  it("halts on the no-progress watchdog after N repeat-only iterations", async () => {
    const { engine, seen } = scripted([
      turn("1", [read("a")]),
      turn("2", [read("a")]),
      turn("3", [read("a"), read("b")]),
      turn("4", [read("b")]),
      turn("5", [read("a")]),
      turn("6", [read("x")]),
    ]);
    const { result } = await run(engine, {
      limits: { noProgressIterations: 2 },
    });
    expect(result.terminal).toEqual(incomplete("no_progress"));
    expect(result.iterations).toBe(5);
    expect(seen[5]?.tools).toEqual([]);
    expect(result.summary.startsWith("INCOMPLETE (no_progress): ")).toBe(true);
  });

  it("aborts a step on timeout, does not call the engine again, and rewrites done", async () => {
    const timers = manualTimers();
    const { engine, seen } = scripted([
      turn("All done!", [read("a")], true),
      () => {
        timers.advance(LIMITS.timeoutMs);
        return new Promise<EngineTurn>(() => undefined);
      },
    ]);
    const { result, events } = await run(engine, { timers });
    expect(seen).toHaveLength(2);
    expect(seen[1]?.signal.aborted).toBe(true);
    expect(result.terminal).toEqual(incomplete("timeout"));
    expect(result.summary).toBe("INCOMPLETE (timeout): All done!");
    const halted = events.filter((e) => e.type === "loop.halted");
    expect(halted.map((e) => e.payload["reason"])).toEqual(["timeout"]);
  });

  it("reports failed when the engine throws", async () => {
    const { engine } = scripted([
      turn("start", [read("a")]),
      new Error("boom"),
    ]);
    const { result } = await run(engine);
    expect(result.terminal).toEqual({ kind: "failed", error: "boom" });
  });

  it("reports incomplete(cancelled) on external cancellation without another engine call", async () => {
    const controller = new AbortController();
    const { engine, seen } = scripted([
      turn("start", [read("a")], true),
      () => {
        controller.abort();
        return new Promise<EngineTurn>(() => undefined);
      },
    ]);
    const { result } = await run(engine, { signal: controller.signal });
    expect(seen).toHaveLength(2);
    expect(result.terminal).toEqual(incomplete("cancelled"));
    expect(result.summary).toBe("INCOMPLETE (cancelled): start");
  });

  it("emits the documented event types", async () => {
    const { engine } = scripted([
      turn("", [read("a")]),
      turn("", [read("a")]),
      turn("", [read("a")]),
    ]);
    const { events } = await run(engine, { limits: { maxIterations: 3 } });
    const types = new Set(events.map((e) => e.type));
    for (const type of [
      "loop.iteration.started",
      "loop.tool.started",
      "loop.tool.called",
      "loop.reminder.sent",
      "loop.halted",
      "run.terminated",
    ]) {
      expect(types.has(type)).toBe(true);
    }
    expect(
      events.find((e) => e.type === "loop.tool.called")?.payload["status"],
    ).toBe("ok");
  });

  it("records a throwing executeTool as an error result that still counts", async () => {
    const { engine, seen } = scripted([turn("", [read("a")]), turn("end")]);
    const { result, events } = await run(engine, {
      executeTool: () => Promise.reject(new Error("tool blew up")),
    });
    expect(result.terminal).toEqual({ kind: "completed" });
    expect(result.toolCalls).toBe(1);
    expect(seen[1]?.messages.at(-1)).toMatchObject({
      role: "tool",
      status: "error",
      text: "tool blew up",
    });
    const started = events.find((e) => e.type === "loop.tool.started");
    expect(started?.payload["toolCallId"]).toBe(
      result.transcript.turns[0]?.toolCalls[0]?.id,
    );
  });

  it("times out during executeTool without a handoff step", async () => {
    const timers = manualTimers();
    const { engine, seen } = scripted([turn("working", [read("a")])]);
    const { result } = await run(engine, {
      timers,
      executeTool: () => {
        timers.advance(LIMITS.timeoutMs);
        return new Promise<ToolResult>(() => undefined);
      },
    });
    expect(seen).toHaveLength(1);
    expect(result.terminal).toEqual(incomplete("timeout"));
    expect(result.summary).toBe("INCOMPLETE (timeout): working");
  });

  it("times out when the deadline passes while a step's value arrives", async () => {
    const timers = manualTimers();
    const { engine, seen } = scripted([
      turn("start", [read("a")]),
      () => {
        timers.advance(LIMITS.timeoutMs, false);
        return Promise.resolve(turn("done", [], true));
      },
    ]);
    const { result } = await run(engine, { timers });
    expect(seen).toHaveLength(2);
    expect(result.terminal).toEqual(incomplete("timeout"));
    expect(result.summary).toBe("INCOMPLETE (timeout): done");
  });

  it("terminates normally on a cyclic tool input", async () => {
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;
    const { engine } = scripted([turn("", [read(cyclic)]), turn("end")]);
    const { result } = await run(engine);
    expect(result.terminal).toEqual({ kind: "completed" });
  });

  it("turns an unexpected throw into failed with one run.terminated", async () => {
    const { engine } = scripted([turn("", [read("a")])]);
    const counters: CallCounters = {
      record: () => {
        throw new Error("counter broke");
      },
    };
    const { result } = await run(engine, { counters });
    expect(result.terminal).toEqual({ kind: "failed", error: "counter broke" });
  });

  it("escapes control characters in a failed terminal's error, once (B5-4)", async () => {
    const thrown = scripted([new Error("engine\nbroke\u001b\\")]).engine;
    const engineFailed = (await run(thrown)).result;
    expect(engineFailed.terminal).toEqual({
      kind: "failed",
      error: "engine\\u{a}broke\\u{1b}\\\\",
    });
    expect(engineFailed.summary).toBe("FAILED: engine\\u{a}broke\\u{1b}\\\\");
    const counters: CallCounters = {
      record: () => {
        throw new Error("counter\u0007broke");
      },
    };
    const { engine } = scripted([turn("", [read("a")])]);
    const { result } = await run(engine, { counters });
    expect(result.terminal).toEqual({
      kind: "failed",
      error: "counter\\u{7}broke",
    });
  });

  it("returns a typed result and records nothing further when emit throws", async () => {
    const timers = manualTimers();
    const types: string[] = [];
    const result = await runLoop(
      { agentId: "a", messages: [], tools: TOOLS, limits: LIMITS },
      {
        engine: scripted([turn("", [read("a")]), turn("end")]).engine,
        executeTool: () => Promise.resolve({ status: "ok", output: "" }),
        clock: timers.clock,
        schedule: (ms, fn) => timers.schedule(ms, fn),
        emit: (type) => {
          types.push(type);
          if (type === "loop.tool.called") throw new Error("log down");
        },
      },
    );
    expect(result.terminal.kind).toBe("failed");
    expect(types.at(-1)).toBe("loop.tool.called");
    expect(timers.active()).toBe(0);
  });

  it("rejects invalid limits synchronously with a RangeError", () => {
    const timers = manualTimers();
    const deps = {
      engine: scripted([]).engine,
      executeTool: () =>
        Promise.resolve<ToolResult>({ status: "ok", output: "" }),
      clock: timers.clock,
      emit: () => undefined,
    };
    const keys = [
      "maxIterations",
      "maxToolCallsPerIteration",
      "timeoutMs",
      "noProgressIterations",
      "handoffTimeoutMs",
    ] as const;
    for (const key of keys) {
      for (const bad of [0, -1, 1.5, NaN, Infinity, 2 ** 31]) {
        const limits = { ...LIMITS, [key]: bad };
        expect(() =>
          runLoop({ agentId: "a", messages: [], tools: TOOLS, limits }, deps),
        ).toThrow(RangeError);
      }
    }
    for (const required of keys.slice(0, 4)) {
      const limits = Object.fromEntries(
        Object.entries(LIMITS).filter(([name]) => name !== required),
      );
      expect(() =>
        runLoop(
          { agentId: "a", messages: [], tools: TOOLS, limits: limits as never },
          deps,
        ),
      ).toThrow(RangeError);
    }
    expect(() =>
      runLoop(
        {
          agentId: "a",
          messages: [],
          tools: TOOLS,
          limits: { ...LIMITS, maxIteration: 5 } as never,
        },
        deps,
      ),
    ).toThrow(RangeError);
  });

  it("accepts the boundary limits 1 and MAX_LIMIT", () => {
    for (const value of [1, MAX_LIMIT]) {
      expect(() => {
        validateLimits({
          maxIterations: value,
          maxToolCallsPerIteration: value,
          timeoutMs: value,
          noProgressIterations: value,
          handoffTimeoutMs: value,
        });
      }).not.toThrow();
    }
  });
});
