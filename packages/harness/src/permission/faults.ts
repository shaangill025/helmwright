import { createHash } from "node:crypto";
import { RING0_CONFIG_KEYS, type Event } from "@helmwright/schema";
import { canonical } from "./policy.ts";
import { INTAKE_OVERRIDE_CALL_ID, RING0_CONFIG_CALL_ID } from "./events.ts";

/** Tiers whose ruling is followed by an ask. */
const ASK_TIERS: ReadonlySet<unknown> = new Set(["ask", "alwaysAsk"]);
/** N1: who may answer an ask, by the ask's presence. */
const ANSWERED_BY = new Map<unknown, ReadonlySet<unknown>>([
  ["tty", new Set(["tty", "cancelled"])],
  ["none", new Set(["noPresence"])],
]);

/** Intake classes in rank order (Q52). */
const RANK: readonly unknown[] = ["chore", "bounded", "architectural"];
/** The reserved run-start IDs that no tool call may run with. */
const RESERVED = new Map([
  [RING0_CONFIG_CALL_ID, "tool call ran with the reserved Ring 0 config ID"],
  [
    INTAKE_OVERRIDE_CALL_ID,
    "tool call ran with the reserved intake override ID",
  ],
]);
/** The ruling a run-start ask on a reserved ID must have. */
const isRunStartRuling = (payload: Event["payload"]): boolean =>
  payload["requested"] === "config.set" &&
  payload["tier"] === "alwaysAsk" &&
  payload["ruleId"] === "always-ask.ring0-setting";

/** S3: whether a Ring 0 ask's ruling is on a Ring 0 setting (the shown target). */
function onRing0Setting(target: unknown): boolean {
  if (typeof target !== "object" || target === null) return false;
  const { kind, value } = target as Record<string, unknown>;
  return kind === "setting" && RING0_CONFIG_KEYS.some((key) => key === value);
}

/** S3: the inputSha256 of the ask that may approve `override`, as the broker rules it. */
function overrideInputSha256(override: Event["payload"]): string {
  const { from, to, reason, scopeSha256 } = override;
  const value = { from, to, reason, scopeSha256 };
  const input = { setting: "intake.classification", value };
  return createHash("sha256").update(canonical(input), "utf8").digest("hex");
}

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
 *   requested (N-c); any `loop.tool.called`, denied too, uses up the grant (N-b);
 * - N4: each call has at most one `permission.evaluated`, and an exfiltration
 *   ruling always denies;
 * - OQ1: a run has at most one `config.accepted`, with its `run.started` Ring 0
 *   digest; with `how` "approved" it follows a fault-free approval of an always-ask
 *   `config.set` ruling (always-ask.ring0-setting) on the RING0_CONFIG_CALL_ID ask
 *   and uses it up (N1); no `loop.tool.called` with that ID ran;
 * - B10-2: each `intake.overridden` is `from` the run's `intake.classified` class
 *   (S3); one that is not upward follows a fault-free approval of the same ruling on
 *   the INTAKE_OVERRIDE_CALL_ID ask, whose input is this override (S3), and uses it
 *   up; no `loop.tool.called` with that ID ran; N1: one `intake.classified` per run.
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
  /** N4: the calls with a `permission.evaluated`. */
  const evaluatedIds = new Set<string>();
  /** N-c: the action each call's evaluated ruling requested. */
  const requested = new Map<string, unknown>();
  /** OQ1: the run's Ring 0 digest, its ruling on the reserved ID, a config.accepted. */
  let ring0Sha256: unknown;
  let ring0Ruled = false;
  /** B10-2: the run's intake class and its ruling on the reserved override ID. */
  let intakeClass: unknown;
  let classifiedSeen = false;
  let overrideRuled = false;
  let overrideInput: unknown;
  let acceptedSeen = false;
  for (const [i, { seq, type, payload }] of events.entries()) {
    const fault = (text: string) => faults.push(`seq ${String(seq)}: ${text}`);
    const id = payload["toolCallId"];
    const key = typeof id === "string" ? id : undefined;
    if (type === "run.started") {
      const config: unknown = payload["config"];
      ring0Sha256 = (config as Record<string, unknown> | null)?.["ring0Sha256"];
    } else if (
      type === "permission.evaluated" ||
      type === "permission.rejected"
    ) {
      if (type === "permission.evaluated") {
        if (key === RING0_CONFIG_CALL_ID)
          ring0Ruled =
            isRunStartRuling(payload) && onRing0Setting(payload["target"]);
        if (key === INTAKE_OVERRIDE_CALL_ID) {
          overrideRuled = isRunStartRuling(payload);
          overrideInput = payload["inputSha256"];
        }
        if (key !== undefined && evaluatedIds.has(key)) {
          fault("more than one permission.evaluated for one tool call");
        }
        if (key !== undefined) evaluatedIds.add(key);
        if (payload["guard"] === "exfiltration" && payload["tier"] !== "deny") {
          fault("exfiltration ruling that does not deny");
        }
      }
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
    } else if (type === "config.accepted") {
      if (acceptedSeen) fault("more than one config.accepted in one run");
      acceptedSeen = true;
      if (payload["ring0Sha256"] !== ring0Sha256) {
        fault("config.accepted for another Ring 0 digest than the run's");
      }
      if (payload["how"] !== "approved") continue;
      if (grants.get(RING0_CONFIG_CALL_ID) !== "approved" || !ring0Ruled) {
        fault("config.accepted approved without an approval of its ask");
      }
      grants.set(RING0_CONFIG_CALL_ID, "none");
    } else if (type === "intake.classified") {
      if (classifiedSeen) fault("more than one intake.classified in one run");
      classifiedSeen = true;
      intakeClass = payload["class"];
    } else if (type === "intake.overridden") {
      const { from, to } = payload;
      if (from !== intakeClass) {
        fault(
          "intake.overridden from another class than the run's intake.classified",
        );
      }
      if (RANK.indexOf(to) > RANK.indexOf(from) && RANK.includes(from))
        continue;
      if (
        grants.get(INTAKE_OVERRIDE_CALL_ID) !== "approved" ||
        !overrideRuled ||
        overrideInput !== overrideInputSha256(payload)
      ) {
        fault("downward intake.overridden without an approval of its ask");
      }
      grants.set(INTAKE_OVERRIDE_CALL_ID, "none");
    } else if (type === "loop.tool.called") {
      const reserved = key === undefined ? undefined : RESERVED.get(key);
      if (reserved !== undefined && payload["status"] !== "denied") {
        fault(reserved);
        continue;
      }
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
