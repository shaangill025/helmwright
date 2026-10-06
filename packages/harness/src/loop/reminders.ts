import type { ToolCall } from "./types.ts";

const byJson = (a: unknown, b: unknown): number => {
  const [x, y] = [JSON.stringify(a), JSON.stringify(b)];
  return x < y ? -1 : x > y ? 1 : 0;
};

/** Plain JSON data with stable key order; `ancestors` detects cycles. */
function normalize(value: unknown, ancestors: WeakSet<object>): unknown {
  if (value === null || typeof value === "string") return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : `[${String(value)}]`;
  }
  if (typeof value === "bigint") return `${value.toString()}n`;
  if (typeof value !== "object") return `[${typeof value}]`;
  if (ancestors.has(value)) return "[Circular]";
  ancestors.add(value);
  try {
    const inner = (v: unknown) => normalize(v, ancestors);
    if (value instanceof Date) return value.toJSON();
    if (Array.isArray(value)) return value.map(inner);
    if (value instanceof Map) {
      const entries = [...value].map(([k, v]) => [inner(k), inner(v)]);
      return { "[Map]": entries.sort((a, b) => byJson(a[0], b[0])) };
    }
    if (value instanceof Set)
      return { "[Set]": [...value].map(inner).sort(byJson) };
    const keys = Object.keys(value).sort((a, b) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    const record = value as Record<string, unknown>;
    return Object.fromEntries(keys.map((k) => [k, inner(record[k])]));
  } finally {
    ancestors.delete(value);
  }
}

/** Stable JSON: sorted keys, tagged non-JSON values. Never throws. */
export function canonicalJson(value: unknown): string {
  try {
    return JSON.stringify(normalize(value, new WeakSet()));
  } catch {
    return '"[unserializable]"';
  }
}

/** Identity of a call: same name and same canonical input (id ignored). */
export function callKey(call: Pick<ToolCall, "name" | "input">): string {
  return `${call.name}\u0000${canonicalJson(call.input)}`;
}

/** Identical-call counters, keyed per agent. */
export interface CallCounters {
  record(agentId: string, key: string): number;
}

export function createCallCounters(): CallCounters {
  const byAgent = new Map<string, Map<string, number>>();
  return {
    record(agentId, key) {
      let counts = byAgent.get(agentId);
      if (counts === undefined) {
        counts = new Map();
        byAgent.set(agentId, counts);
      }
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return count;
    },
  };
}

export const REMINDER_COUNTS: readonly number[] = [3, 5, 8];

/** Escalating reminder at 3/5/8 identical calls. Reminders never block. */
export function reminderFor(name: string, count: number): string | undefined {
  if (!REMINDER_COUNTS.includes(count)) return undefined;
  return (
    `Reminder: this is identical call #${String(count)} to "${name}"; ` +
    "it repeats an earlier call with the same input. This reminder does not block it. " +
    "Try a different approach or report what is blocking you."
  );
}
