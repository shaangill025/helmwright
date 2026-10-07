import type { Event } from "@helmwright/schema";

/** Tiers whose ruling is followed by an ask. */
const ASK_TIERS: ReadonlySet<unknown> = new Set(["ask", "alwaysAsk"]);

/**
 * SF3: checks, after the fact, that each ask and answer in one run's events (in log
 * order) is bound as the live broker binds them: every ask follows an ask-tier
 * `permission.evaluated` of its tool call, every answer follows its one ask, an
 * approval is given by the owner at the TTY of an ask made there, an approval of an
 * ask with a full-value view has `viewed: true`, and `viewed` occurs only for such
 * an ask. A missing tool call ID counts as unmatched. Each fault is fixed text and the
 * event's `seq`, never payload text, so it is safe to show.
 */
export function permissionFaults(events: readonly Event[]): string[] {
  const faults: string[] = [];
  const evaluated = new Set<string>();
  const asked = new Map<string, Event["payload"]>();
  const answered = new Set<string>();
  for (const { seq, type, payload } of events) {
    const fault = (text: string) => faults.push(`seq ${String(seq)}: ${text}`);
    const id = payload["toolCallId"];
    const key = typeof id === "string" ? id : undefined;
    if (type === "permission.evaluated") {
      if (key !== undefined && ASK_TIERS.has(payload["tier"])) {
        evaluated.add(key);
      }
    } else if (type === "permission.asked") {
      if (key !== undefined && asked.has(key)) {
        fault("more than one permission.asked for one tool call");
        continue;
      }
      if (key === undefined || !evaluated.has(key)) {
        fault("permission.asked without an earlier ask-tier evaluation");
      }
      if (key !== undefined) asked.set(key, payload);
    } else if (type === "permission.answered") {
      const ask = key === undefined ? undefined : asked.get(key);
      if (key === undefined || ask === undefined) {
        fault("permission.answered without an earlier permission.asked");
        continue;
      }
      if (answered.has(key)) {
        fault("more than one permission.answered for one tool call");
        continue;
      }
      answered.add(key);
      const hasView = ask["viewSha256"] !== undefined;
      if (payload["answer"] === "approved") {
        if (ask["presence"] !== "tty" || payload["by"] !== "tty") {
          fault("approval not given by the owner at the TTY");
        }
        if (hasView && payload["viewed"] !== true) {
          fault("approval without the full view shown to its end");
        }
      }
      if (!hasView && payload["viewed"] !== undefined) {
        fault("viewed recorded for an ask with no full view");
      }
    }
  }
  return faults;
}
