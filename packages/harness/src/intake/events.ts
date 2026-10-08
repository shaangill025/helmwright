import {
  validateIntakeEvent,
  type HelmwrightConfig,
  type IntakeClass,
  type IntakeClassified,
  type IntakeDeclared,
  type IntakeFriction,
  type IntakeOverridden,
} from "@helmwright/schema";
import { IntakeError, type IntakeResult } from "./rubric.ts";

/** OQ-B10-1: the fixed reason a run fails when a downward override is not approved. */
export const INTAKE_OVERRIDE_NOT_APPROVED =
  "downward intake override was not approved";

/** The owner's CLI override: the class asked for and why. */
export interface IntakeOverride {
  readonly to: IntakeClass;
  readonly reason: string;
}

/**
 * S2: the friction `cls` sets under `config`, by the rubric's rule: minimal for a chore
 * when the chore downgrade is on, else the default intensity.
 */
export function effectiveFriction(
  cls: IntakeClass,
  config: Required<NonNullable<HelmwrightConfig["friction"]>>,
): IntakeFriction {
  return cls === "chore" && config.choreDowngrade === "on"
    ? { intensity: "minimal", source: "choreDowngrade" }
    : { intensity: config.defaultIntensity, source: "default" };
}

/** `payload` if it is a valid intake event of its kind. @throws IntakeError with fixed text */
function checked<P extends IntakeClassified | IntakeOverridden>(payload: P): P {
  // A copy, so the guard does not narrow `payload` itself.
  if (!validateIntakeEvent({ ...payload })) {
    throw new IntakeError(payload.kind + " cannot be logged");
  }
  return payload;
}

/** B10-2: the `intake.classified` payload of `result`, for the sorted unique scope. */
export function intakeClassified(
  taskId: string,
  scope: readonly string[],
  declared: IntakeDeclared,
  result: IntakeResult,
): IntakeClassified {
  return checked({
    kind: "intake.classified",
    taskId,
    class: result.class,
    rubricVersion: result.rubricVersion,
    // classify always gives at least one reason; the schema checks it again.
    reasons: result.reasons.map((r) => ({
      ...r,
      entries: [...r.entries],
    })) as IntakeClassified["reasons"],
    scope: [...new Set(scope)].sort(),
    scopeSha256: result.scopeSha256,
    ring0Sha256: result.ring0Sha256,
    declared: {
      newDependencies: [...declared.newDependencies],
      newModules: [...declared.newModules],
      surfaceChanges: [...declared.surfaceChanges],
      newProcessBoundary: declared.newProcessBoundary,
    },
    friction: { ...result.friction },
    sparring: result.sparring,
  });
}

/** S3: `from` is always the class this run just classified, never the caller's. */
export function intakeOverridden(
  taskId: string,
  result: IntakeResult,
  override: IntakeOverride,
): IntakeOverridden {
  return checked({
    kind: "intake.overridden",
    taskId,
    from: result.class,
    to: override.to,
    reason: override.reason,
    by: "cli",
    attestation: { kind: "none" },
    scopeSha256: result.scopeSha256,
    rubricVersion: result.rubricVersion,
  });
}
