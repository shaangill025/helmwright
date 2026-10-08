export type { Event } from "../generated/event.ts";
export { validate as validateEvent } from "../generated/event.validate.js";
export type {
  PermissionAction,
  PermissionPolicy,
  PermissionRule,
  PermissionRuleId,
  PermissionScope,
  PermissionTier,
} from "../generated/permission-policy.ts";
export { validate as validatePermissionPolicy } from "../generated/permission-policy.validate.js";
export type {
  PermissionAnswered,
  PermissionAnsweredApproved,
  PermissionAnsweredDenied,
  PermissionAsked,
  PermissionAttestation,
  PermissionAttestationNone,
  PermissionEvaluated,
  PermissionEvent,
  PermissionEventRuleId,
  PermissionEventTarget,
  PermissionRejected,
  PermissionRejectedRuleId,
} from "../generated/permission-event.ts";
export { validate as validatePermissionEvent } from "../generated/permission-event.validate.js";
export type {
  IntakeAttestation,
  IntakeAttestationNone,
  IntakeClass,
  IntakeClassified,
  IntakeDeclared,
  IntakeEvent,
  IntakeFriction,
  IntakeOverridden,
  IntakeReason,
  IntakeReclassified,
  IntakeRule,
  IntakeSurfaceChange,
} from "../generated/intake-event.ts";
export { validate as validateIntakeEvent } from "../generated/intake-event.validate.js";
export type {
  FloorChecked,
  FloorEvent,
  FloorFinding,
  FloorRule,
} from "../generated/floor-event.ts";
export { validate as validateFloorEvent } from "../generated/floor-event.validate.js";
export type {
  RotRegister,
  RotRegisterDate,
  RotRegisterEntry,
  RotReviewTrigger,
} from "../generated/rot-register.ts";
export { validate as validateRotRegister } from "../generated/rot-register.validate.js";
export type { HelmwrightConfig } from "../generated/helmwright-config.ts";
export { validate as validateHelmwrightConfig } from "../generated/helmwright-config.validate.js";

import type { HelmwrightConfig } from "../generated/helmwright-config.ts";

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

/**
 * The default of each setting in helmwright-config.schema.json: the value a missing key takes.
 * permissions.policy is absent because its default is the harness's DEFAULT_PERMISSION_POLICY.
 */
export const CONFIG_DEFAULTS = deepFreeze({
  intake: { classification: "rubric" },
  friction: { defaultIntensity: "moderate", choreDowngrade: "on" },
  decisions: {
    detection: "floorAndSelfFlag",
    pendingWork: "provisionalExceptArchitecture",
    briefFormat: "terse",
    evaluator: "freshContext",
  },
  permissions: {
    untrustedContent: { mode: "exploreSplit", hintBytes: 1024 },
  },
  ownerLoop: {
    preCommitment: "everyOwnedDecision",
    consequences: "signalsAndReviews",
    tutor: "justInTimeAndConceptMap",
  },
  topology: "sessionHarnessOneProcess",
} as const satisfies HelmwrightConfig);

/**
 * The config's Ring 0 settings (08), named as in the permission policy's ring0Settings floor,
 * where a setting also covers its children. Changing one is always-ask (Q51).
 */
export const RING0_CONFIG_KEYS = deepFreeze([
  "intake.classification",
  "permissions",
] as const);
