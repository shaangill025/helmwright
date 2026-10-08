import {
  validateFloorEvent,
  type FloorChecked,
  type FloorFinding,
} from "@helmwright/schema";
import { FLOOR_RULES_VERSION, sortFindings } from "./rules.ts";

/** The floor could not check the candidate (fail closed); the message is fixed text. */
export class FloorError extends Error {
  override name = "FloorError";
}

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
