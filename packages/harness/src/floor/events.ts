import {
  validateFloorEvent,
  type Event,
  type FloorChecked,
  type FloorFinding,
} from "@helmwright/schema";
import { FLOOR_RULES_VERSION, sortFindings } from "./rules.ts";

/** The floor could not check the candidate (fail closed); the message is fixed text. */
export class FloorError extends Error {
  override name = "FloorError";
}

/** The rule table versions this build can replay (S5): older logs keep their version. */
export const FLOOR_RULES_VERSIONS: readonly string[] = Object.freeze([
  "floor-1",
  "floor-2",
  FLOOR_RULES_VERSION,
]);

/** The most findings one floor.checked lists; past it, `truncated` is set. */
const MAX_FINDINGS = 256;

/**
 * The `floor.checked` payload: reject if and only if there is a finding (OQ-B3-2), the
 * findings sorted and cut to MAX_FINDINGS.
 * @throws FloorError with fixed text if the payload is not a valid floor event
 */
export function floorChecked(
  baseCommit: string,
  candidateTree: string,
  findings: readonly FloorFinding[],
): FloorChecked {
  const sorted = sortFindings([...findings]);
  const payload: FloorChecked = {
    kind: "floor.checked",
    rules: FLOOR_RULES_VERSION,
    baseCommit,
    candidateTree,
    verdict: sorted.length === 0 ? "pass" : "reject",
    findings: sorted.slice(0, MAX_FINDINGS),
    truncated: sorted.length > MAX_FINDINGS,
  };
  if (!validateFloorEvent({ ...payload })) {
    throw new FloorError("floor.checked cannot be logged");
  }
  return payload;
}

/**
 * B3-2 replay faults of one run's events: a `floor.checked` that is not a valid floor
 * event or not the run's only one, and a `run.terminated` that is completed without a
 * passing `floor.checked` before it (rejected, or the floor skipped). S5: also a
 * `floor.checked` whose base commit is not `run.started`'s or whose rules version this
 * build does not know, and any event after it but `run.terminated` (the floor runs only
 * once no writer is left). Each fault is fixed text and the
 * event's `seq`, like `permissionFaults`.
 */
export function floorFaults(events: readonly Event[]): string[] {
  const faults: string[] = [];
  let checked = false;
  let verdict: unknown;
  let started: unknown;
  for (const { seq, type, payload } of events) {
    const fault = (text: string) => faults.push(`seq ${String(seq)}: ${text}`);
    if (type === "run.started") started ??= payload["baseCommit"];
    if (checked && type !== "run.terminated" && type !== "floor.checked") {
      fault(type + " after floor.checked");
    }
    if (type === "floor.checked") {
      if (checked) fault("more than one floor.checked in one run");
      if (!validateFloorEvent({ ...payload })) {
        fault("floor.checked that is not a valid floor event");
      }
      if (typeof started !== "string" || payload["baseCommit"] !== started) {
        fault("floor.checked base commit is not run.started's");
      }
      const rules = payload["rules"];
      if (typeof rules !== "string" || !FLOOR_RULES_VERSIONS.includes(rules)) {
        fault("floor.checked rules version is not known");
      }
      checked = true;
      verdict = payload["verdict"];
    } else if (type === "run.terminated") {
      const terminal: unknown = payload["terminal"];
      const kind = (terminal as Record<string, unknown> | null)?.["kind"];
      if (kind === "completed" && verdict !== "pass") {
        fault("completed run without a passing floor.checked");
      }
    }
  }
  return faults;
}
