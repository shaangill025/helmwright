import { canonicalJson } from "./reminders.ts";

export type IncompleteReason =
  "timeout" | "max_iterations" | "max_tool_calls" | "no_progress" | "cancelled";

/**
 * Typed terminal state of a run. "completed" means the engine ended its turn
 * without tool calls; it is NOT task done. Only the evaluator decides done.
 */
export type Terminal =
  | { readonly kind: "completed" }
  | { readonly kind: "incomplete"; readonly reason: IncompleteReason }
  | { readonly kind: "failed"; readonly error: string };

/** A non-empty description of anything thrown. Never throws. */
export function errorMessage(error: unknown): string {
  try {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : canonicalJson(error);
    return message.trim() === "" ? "unknown error" : message;
  } catch {
    return "unknown error";
  }
}

export const FALLBACK_SUMMARY =
  "No handoff summary was produced; inspect the run log for what was done.";

/** Incomplete runs are always labelled, whatever the engine claimed. */
export function summarize(terminal: Terminal, text: string): string {
  switch (terminal.kind) {
    case "completed":
      return text;
    case "incomplete":
      return `INCOMPLETE (${terminal.reason}): ${text.trim() === "" ? FALLBACK_SUMMARY : text}`;
    case "failed":
      return `FAILED: ${terminal.error}`;
  }
}
