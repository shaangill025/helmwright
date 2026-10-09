/** Minimal context message. B7 will derive real context from the log. */
export type Message =
  | { readonly role: "system" | "user"; readonly text: string }
  | {
      readonly role: "assistant";
      readonly text: string;
      readonly toolCalls: readonly ToolCall[];
    }
  | {
      readonly role: "tool";
      readonly toolCallId: string;
      readonly status: ToolResult["status"];
      readonly text: string;
    };

export interface ToolSpec {
  readonly name: string;
  readonly description: string;
}

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
}

/** One engine step. `claimsDone` is recorded but is never evidence of done. */
export interface EngineTurn {
  readonly text: string;
  readonly toolCalls: readonly ToolCall[];
  readonly claimsDone: boolean;
}

export interface StepInput {
  readonly messages: readonly Message[];
  readonly tools: readonly ToolSpec[];
  readonly signal: AbortSignal;
}

export interface Engine {
  step(input: StepInput): Promise<EngineTurn>;
}

export interface ToolResult {
  readonly status: "ok" | "denied" | "error";
  readonly output: string;
}

export type ExecuteTool = (
  call: ToolCall,
  signal: AbortSignal,
) => Promise<ToolResult>;

export interface Clock {
  now(): number;
}

/** Runs `fn` after `ms`; returns a function that cancels it. */
export type Schedule = (ms: number, fn: () => void) => () => void;

export type Emit = (type: string, payload: Record<string, unknown>) => void;

/**
 * Appends `entries` in one transaction: all of them, or none and it throws. An entry's
 * `eventId`, if given, is its event's ID (B5-5: an event that a later one names).
 */
export type EmitAll = (
  entries: readonly {
    readonly type: string;
    readonly payload: Record<string, unknown>;
    readonly eventId?: string;
  }[],
) => void;

export interface LoopLimits {
  readonly maxIterations: number;
  readonly maxToolCallsPerIteration: number;
  readonly timeoutMs: number;
  readonly noProgressIterations: number;
  /** Bound on the final tools-stripped handoff step. Default 30 000 ms. */
  readonly handoffTimeoutMs?: number;
}
