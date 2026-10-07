import type { Event } from "@helmwright/schema";

/** Tiers whose ruling is followed by an ask. */
const ASK_TIERS: ReadonlySet<unknown> = new Set(["ask", "alwaysAsk"]);
/** N1: who may answer an ask, by the ask's presence. */
const ANSWERED_BY = new Map<unknown, ReadonlySet<unknown>>([
  ["tty", new Set(["tty", "cancelled"])],
  ["none", new Set(["noPresence"])],
]);

/** What, if anything, lets a tool call's handler run now. */
type Grant = "allow" | "approved" | "none";

const isAskRuling = (e: Event | undefined, id: string): boolean =>
  e?.type === "permission.evaluated" &&
  e.payload["toolCallId"] === id &&
  ASK_TIERS.has(e.payload["tier"]);

/**
 * SF3: checks, after the fact, that each ask, answer and run in one run's events (in
 * log order) is bound as the live broker binds them:
 * - S1: each ask is the event directly after its call's ask-tier `permission.evaluated`
 *   (the broker appends both in one transaction); there is one ask and one answer
 *   per call, and every answer follows its ask;
 * - an approval is given by the owner at the TTY of an ask made there; an approval of
 *   an ask with a full-value view has `viewed: true`; `viewed` occurs only for such an
 *   ask; N1: every answer's `by` fits its ask's presence;
 * - S3: each `loop.tool.called` that is not denied follows, for its call, an `allow`
 *   ruling or an approval with no fault, and no later ruling (N-a: a ruling after an
 *   ask unbinds it, so its approval grants nothing); it names the action its ruling
 *   requested (N-c); any `loop.tool.called`, denied too, uses up the grant (N-b).
 * A missing tool call ID counts as unmatched. Each fault is fixed text and the event's
 * `seq`, never payload text, so it is safe to show. IDs are only Map and Set keys.
 */
export function permissionFaults(events: readonly Event[]): string[] {
  const faults: string[] = [];
  const asked = new Map<string, Event["payload"]>();
  /** Asks directly after their ask-tier ruling; only their approvals grant. */
  const bound = new Set<string>();
  const answered = new Set<string>();
  const grants = new Map<string, Grant>();
  /** N-c: the action each call's evaluated ruling requested. */
  const requested = new Map<string, unknown>();
  for (const [i, { seq, type, payload }] of events.entries()) {
    const fault = (text: string) => faults.push(`seq ${String(seq)}: ${text}`);
    const id = payload["toolCallId"];
    const key = typeof id === "string" ? id : undefined;
    if (type === "permission.evaluated" || type === "permission.rejected") {
      const allow =
        type === "permission.evaluated" && payload["tier"] === "allow";
      if (key !== undefined) {
        grants.set(key, allow ? "allow" : "none");
        // N-a: a later ruling unbinds an earlier ask; only the first ruling names the action.
        bound.delete(key);
        if (!requested.has(key)) requested.set(key, payload["requested"]);
      }
    } else if (type === "permission.asked") {
      if (key !== undefined && asked.has(key)) {
        fault("more than one permission.asked for one tool call");
        continue;
      }
      if (key !== undefined && isAskRuling(events[i - 1], key)) {
        bound.add(key);
      } else {
        fault("permission.asked not directly after its ask-tier ruling");
      }
      if (key !== undefined) asked.set(key, payload);
    } else if (type === "permission.answered") {
      if (key === undefined || !asked.has(key)) {
        fault("permission.answered without an earlier permission.asked");
        continue;
      }
      if (answered.has(key)) {
        fault("more than one permission.answered for one tool call");
        continue;
      }
      answered.add(key);
      const ask = asked.get(key);
      const before = faults.length;
      const hasView = ask?.["viewSha256"] !== undefined;
      const approved = payload["answer"] === "approved";
      if (approved) {
        if (ask?.["presence"] !== "tty" || payload["by"] !== "tty") {
          fault("approval not given by the owner at the TTY");
        }
        if (hasView && payload["viewed"] !== true) {
          fault("approval without the full view shown to its end");
        }
      }
      if (!hasView && payload["viewed"] !== undefined) {
        fault("viewed recorded for an ask with no full view");
      }
      if (ANSWERED_BY.get(ask?.["presence"])?.has(payload["by"]) !== true) {
        fault("answer not given by the presence its ask had");
      }
      const granted = approved && bound.has(key) && faults.length === before;
      grants.set(key, granted ? "approved" : "none");
    } else if (type === "loop.tool.called") {
      const grant = key === undefined ? undefined : grants.get(key);
      // N-b: a denied call uses up its grant too, but is not a fault.
      if (key !== undefined) grants.set(key, "none");
      if (payload["status"] === "denied") continue;
      const name = payload["name"];
      if (key === undefined || grant === undefined) {
        // N-d: e.g. the broker threw before it could log a ruling.
        fault("tool call ended without denial and without any ruling");
      } else if (grant === "none") {
        fault("tool call ran without an allow ruling or an approval");
      } else if (typeof name !== "string" || requested.get(key) !== name) {
        fault("tool call ran as another action than its ruling requested");
      }
    }
  }
  return faults;
}
