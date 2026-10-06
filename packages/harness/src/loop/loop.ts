import { callKey, createCallCounters, reminderFor } from "./reminders.ts";
import type { CallCounters } from "./reminders.ts";
import { FALLBACK_SUMMARY, errorMessage, summarize } from "./terminal.ts";
import type { IncompleteReason, Terminal } from "./terminal.ts";
import type {
  Clock,
  Emit,
  Engine,
  EngineTurn,
  ExecuteTool,
  LoopLimits,
  Message,
  Schedule,
  ToolCall,
  ToolResult,
  ToolSpec,
} from "./types.ts";

export interface LoopOptions {
  readonly agentId: string;
  readonly messages: readonly Message[];
  readonly tools: readonly ToolSpec[];
  readonly limits: LoopLimits;
  /** External cancellation; aborting ends the run as incomplete("cancelled"). */
  readonly signal?: AbortSignal;
}

export interface LoopDeps {
  readonly engine: Engine;
  readonly executeTool: ExecuteTool;
  readonly clock: Clock;
  readonly emit: Emit;
  /** Timer used to abort an in-flight step. Defaults to setTimeout. */
  readonly schedule?: Schedule;
  /** Shared per-agent identical-call counters. Defaults to a fresh store. */
  readonly counters?: CallCounters;
}

export interface Transcript {
  readonly messages: readonly Message[];
  readonly turns: readonly EngineTurn[];
}

export interface LoopResult {
  readonly terminal: Terminal;
  readonly summary: string;
  readonly iterations: number;
  readonly toolCalls: number;
  readonly transcript: Transcript;
}

export const DEFAULT_HANDOFF_TIMEOUT_MS = 30_000;
export const MAX_LIMIT = 2_147_483_647;
export const SKIPPED_CALL_TEXT = "not executed: per-iteration tool-call cap";

type Interruption = "timeout" | "cancelled";
interface Ending {
  terminal: Terminal;
  text: string;
}
type Outcome<T> =
  | { kind: "value"; value: T }
  | { kind: "error"; error: unknown }
  | { kind: "aborted" };

const defaultSchedule: Schedule = (ms, fn) => {
  const timer = setTimeout(fn, ms);
  return () => {
    clearTimeout(timer);
  };
};

/** Settles with the work's outcome, or "aborted" as soon as `signal` aborts. */
function settle<T>(
  work: () => Promise<T>,
  signal: AbortSignal,
): Promise<Outcome<T>> {
  return new Promise((resolve) => {
    const onAbort = () => {
      resolve({ kind: "aborted" });
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve()
      .then(work)
      .then(
        (value) => {
          signal.removeEventListener("abort", onAbort);
          resolve({ kind: "value", value });
        },
        (error: unknown) => {
          signal.removeEventListener("abort", onAbort);
          resolve({ kind: "error", error });
        },
      );
  });
}

const REQUIRED_LIMITS = [
  "maxIterations",
  "maxToolCallsPerIteration",
  "timeoutMs",
  "noProgressIterations",
] as const;
const KNOWN_LIMITS: readonly string[] = [
  ...REQUIRED_LIMITS,
  "handoffTimeoutMs",
];

/**
 * @throws RangeError unless every required limit is present and every limit is an integer in
 * [1, MAX_LIMIT]; unknown keys are rejected too (limits may come from untyped config).
 */
export function validateLimits(limits: LoopLimits): void {
  const given = new Map<string, unknown>(Object.entries(limits));
  for (const name of given.keys()) {
    if (!KNOWN_LIMITS.includes(name)) {
      throw new RangeError(`LoopLimits.${name} is not a known limit`);
    }
  }
  if (!given.has("handoffTimeoutMs")) {
    given.set("handoffTimeoutMs", DEFAULT_HANDOFF_TIMEOUT_MS);
  }
  for (const name of KNOWN_LIMITS) {
    const value = given.get(name);
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > MAX_LIMIT
    ) {
      throw new RangeError(
        `LoopLimits.${name} must be an integer in [1, ${String(MAX_LIMIT)}], got ${String(value)}`,
      );
    }
  }
}

const toolMessage = (
  call: ToolCall,
  status: ToolResult["status"],
  text: string,
): Message => ({ role: "tool", toolCallId: call.id, status, text });

function handoffRequest(reason: IncompleteReason): string {
  return (
    `The run has been halted (${reason}). Tools are no longer available. ` +
    "Write a handoff: what was done, what remains, and any blockers."
  );
}

/**
 * Runs one agent's loop to a typed terminal state. Never rejects: anything
 * thrown inside becomes `failed`, and `run.terminated` is emitted exactly once
 * (unless `emit` itself threw, after which nothing further is emitted).
 *
 * Total wall time can reach `timeoutMs + handoffTimeoutMs`: a cap or watchdog
 * halt makes one tools-stripped handoff step after the run budget check.
 * "Progress" means an iteration contains a call key (name + canonical input)
 * not yet seen in this run, regardless of the call's result. That definition
 * is an open design question for the owner.
 *
 * @throws RangeError synchronously, before the run starts, for invalid limits
 * (a programming error, not a run outcome).
 */
export function runLoop(
  options: LoopOptions,
  deps: LoopDeps,
): Promise<LoopResult> {
  validateLimits(options.limits);
  return run(options, deps);
}

async function run(options: LoopOptions, deps: LoopDeps): Promise<LoopResult> {
  const { agentId, limits } = options;
  const { engine, clock } = deps;
  const schedule = deps.schedule ?? defaultSchedule;
  const counters = deps.counters ?? createCallCounters();
  const messages: Message[] = [...options.messages];
  const turns: EngineTurn[] = [];
  const seenKeys = new Set<string>();
  let iterations = 0;
  let toolCalls = 0;
  let noProgress = 0;
  let lastText = "";

  let emitBroken = false;
  const emit: Emit = (type, payload) => {
    if (emitBroken) return;
    try {
      deps.emit(type, payload);
    } catch (error) {
      emitBroken = true;
      throw new Error(`emit failed: ${errorMessage(error)}`, { cause: error });
    }
  };

  let deadline = 0;
  let interruption: Interruption | undefined;
  const controller = new AbortController();
  const interrupt = (reason: Interruption) => {
    interruption ??= reason;
    controller.abort();
  };
  const stopReason = (): Interruption | undefined => {
    if (interruption === undefined && clock.now() >= deadline) {
      interrupt("timeout");
    }
    return interruption;
  };
  const onCancel = () => {
    interrupt("cancelled");
  };
  let cancelTimer: (() => void) | undefined;
  const cleanup = () => {
    options.signal?.removeEventListener("abort", onCancel);
    try {
      cancelTimer?.();
    } catch {
      // An injected scheduler that fails to cancel must not escape the run.
    }
  };

  const handoff = async (reason: IncompleteReason): Promise<string> => {
    messages.push({ role: "system", text: handoffRequest(reason) });
    const bound = new AbortController();
    const signal = options.signal
      ? AbortSignal.any([bound.signal, options.signal])
      : bound.signal;
    const cancelBound = schedule(
      limits.handoffTimeoutMs ?? DEFAULT_HANDOFF_TIMEOUT_MS,
      () => {
        bound.abort();
      },
    );
    const outcome = await settle(
      () => engine.step({ messages: [...messages], tools: [], signal }),
      signal,
    );
    cancelBound();
    if (outcome.kind !== "value") {
      const cause =
        outcome.kind === "error"
          ? errorMessage(outcome.error)
          : bound.signal.aborted
            ? "timeout"
            : "cancelled";
      emit("loop.handoff.failed", { agentId, reason, cause });
      return FALLBACK_SUMMARY;
    }
    turns.push(outcome.value);
    messages.push({
      role: "assistant",
      text: outcome.value.text,
      toolCalls: [],
    });
    return outcome.value.text;
  };

  const halt = async (reason: IncompleteReason): Promise<Ending> => {
    cleanup();
    emit("loop.halted", { agentId, reason, iterations, toolCalls });
    const terminal: Terminal = { kind: "incomplete", reason };
    // A timeout or cancellation has spent the budget: no further engine call.
    if (reason === "timeout" || reason === "cancelled") {
      return { terminal, text: lastText };
    }
    return { terminal, text: await handoff(reason) };
  };

  const loop = async (): Promise<Ending> => {
    deadline = clock.now() + limits.timeoutMs;
    cancelTimer = schedule(limits.timeoutMs, () => {
      interrupt("timeout");
    });
    options.signal?.addEventListener("abort", onCancel, { once: true });
    if (options.signal?.aborted === true) onCancel();
    const cap = limits.maxToolCallsPerIteration;

    for (;;) {
      const stop = stopReason();
      if (stop !== undefined) return halt(stop);
      if (iterations >= limits.maxIterations) return halt("max_iterations");

      iterations += 1;
      const iteration = iterations;
      emit("loop.iteration.started", { agentId, iteration });
      const ids = (call: ToolCall) => ({
        agentId,
        iteration,
        toolCallId: call.id,
        name: call.name,
      });
      const stepped = await settle(
        () =>
          engine.step({
            messages: [...messages],
            tools: options.tools,
            signal: controller.signal,
          }),
        controller.signal,
      );
      if (stepped.kind === "aborted") return halt(stopReason() ?? "cancelled");
      if (stepped.kind === "error") {
        const error = errorMessage(stepped.error);
        return { terminal: { kind: "failed", error }, text: lastText };
      }
      const turn = stepped.value;
      turns.push(turn);
      lastText = turn.text;
      messages.push({
        role: "assistant",
        text: turn.text,
        toolCalls: turn.toolCalls,
      });
      const late = stopReason();
      if (late !== undefined) return halt(late);
      if (turn.toolCalls.length === 0) {
        return { terminal: { kind: "completed" }, text: turn.text };
      }

      let progressed = false;
      for (const call of turn.toolCalls.slice(0, cap)) {
        const key = callKey(call);
        const count = counters.record(agentId, key);
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          progressed = true;
        }
        emit("loop.tool.started", ids(call));
        const executed = await settle(
          () => deps.executeTool(call, controller.signal),
          controller.signal,
        );
        if (executed.kind === "aborted") {
          return halt(stopReason() ?? "cancelled");
        }
        const result: ToolResult =
          executed.kind === "value"
            ? executed.value
            : { status: "error", output: errorMessage(executed.error) };
        toolCalls += 1;
        emit("loop.tool.called", {
          ...ids(call),
          status: result.status,
          count,
        });
        messages.push(toolMessage(call, result.status, result.output));
        const reminder = reminderFor(call.name, count);
        if (reminder !== undefined) {
          messages.push({ role: "system", text: reminder });
          emit("loop.reminder.sent", { agentId, name: call.name, count });
        }
        const timedOut = stopReason();
        if (timedOut !== undefined) return halt(timedOut);
      }
      const skipped = turn.toolCalls.slice(cap);
      for (const call of skipped) {
        messages.push(toolMessage(call, "denied", SKIPPED_CALL_TEXT));
        emit("loop.tool.skipped", ids(call));
      }
      if (skipped.length > 0) return halt("max_tool_calls");
      noProgress = progressed ? 0 : noProgress + 1;
      if (noProgress >= limits.noProgressIterations) return halt("no_progress");
    }
  };

  let ending: Ending;
  try {
    ending = await loop();
  } catch (error) {
    ending = {
      terminal: { kind: "failed", error: errorMessage(error) },
      text: lastText,
    };
  } finally {
    cleanup();
  }
  const { terminal } = ending;
  try {
    emit("run.terminated", { agentId, terminal, iterations, toolCalls });
  } catch {
    // emit is broken; the typed result is still returned below.
  }
  return {
    terminal,
    summary: summarize(terminal, ending.text),
    iterations,
    toolCalls,
    transcript: { messages, turns },
  };
}
