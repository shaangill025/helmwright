/**
 * The only fields the credential proxy may log. The log carries no header, no body
 * and no key: a field outside this list is dropped by `logEntry`, never written.
 */
export interface ProxyLogEntry {
  runId: string;
  model: string;
  tokens: { input: number; output: number };
  /** Cost in micro-USD. */
  cost: number;
  status: number;
  latencyMs: number;
  requestSha256: string;
}

const KEYS = [
  "runId",
  "model",
  "tokens",
  "cost",
  "status",
  "latencyMs",
  "requestSha256",
] as const;

/** Copy only the allowlisted fields of `raw` (tokens keeps only input and output). */
export function logEntry(
  raw: Readonly<Record<string, unknown>>,
): ProxyLogEntry {
  const picked: Record<string, unknown> = {};
  for (const key of KEYS) {
    if (key === "tokens") {
      const t = raw["tokens"] as
        { input?: unknown; output?: unknown } | undefined;
      picked["tokens"] = {
        input: Number(t?.input ?? 0),
        output: Number(t?.output ?? 0),
      };
    } else if (Object.hasOwn(raw, key)) {
      picked[key] = raw[key];
    }
  }
  return picked as unknown as ProxyLogEntry;
}
