// Generated from schemas/intake-event.schema.json by scripts/generate.ts. Do not edit.

/**
 * Payload of an intake event in the session log (B10, Q52), validated before it is appended. `kind` equals the event's `type`; the writer checks that relation. Intake is a Ring 0 step (03 Intake): each task is classified once by the deterministic rubric, an owner override is logged with its reason, and the harness may later reclassify only upward.
 */
export type IntakeEvent =
  IntakeClassified | IntakeOverridden | IntakeReclassified;
/**
 * Task class, in rank order: chore < bounded < architectural.
 */
export type IntakeClass = "chore" | "bounded" | "architectural";
/**
 * The rubric version, such as `intake-rubric-1`.
 */
export type RubricVersion = string;
/**
 * Rubric rules: no scope and the declared facts give architectural; Ring 0 paths and entries outside the docs and tests categories give bounded; docs-only and tests-only entries give chore.
 */
export type IntakeRule =
  | "noDeclaredScope"
  | "newDependencies"
  | "newModules"
  | "surfaceChanges"
  | "newProcessBoundary"
  | "ring0Path"
  | "notDocsOrTests"
  | "docsOnly"
  | "testsOnly";
/**
 * Escaped display text, at most 8192 code points.
 */
export type Text = string;
/**
 * A declared path, glob, module or dependency: 1 to 1024 characters without control characters.
 */
export type Entry = string;
/**
 * Lowercase hex SHA-256.
 */
export type Sha256 = string;
export type IntakeSurfaceChange = "schema" | "publicApi" | "storage" | "wire";
/**
 * Proof of who overrode. Until slice SIG only `none` exists.
 */
export type IntakeAttestation = IntakeAttestationNone;

/**
 * The rubric classified the task. `scopeSha256` is the SHA-256 of the canonical JSON of the sorted scope (of `[]` when the task declared none), so the class is bound to the exact scope it was computed from.
 */
export interface IntakeClassified {
  kind: "intake.classified";
  taskId: string;
  class: IntakeClass;
  rubricVersion: RubricVersion;
  /**
   * Why the rubric chose the class: one reason per rule that fired, in rule order.
   *
   * @minItems 1
   * @maxItems 64
   */
  reasons: [IntakeReason, ...IntakeReason[]];
  /**
   * The declared scope, sorted: repo-relative paths or globs (`*` within a segment, `**` for any number of segments). Empty when the task declared none.
   *
   * @maxItems 1024
   */
  scope: Entry[];
  scopeSha256: Sha256;
  declared: IntakeDeclared;
  friction: IntakeFriction;
  /**
   * The sparring default the class sets. Only opt-in exists until A5.
   */
  sparring: "optIn";
  /**
   * Escaped display text, at most 8192 code points.
   */
  costIfWrong?: string;
}
/**
 * One rule that fired and the entries it fired on, escaped for display. `noDeclaredScope` and `newProcessBoundary` have no entries.
 */
export interface IntakeReason {
  rule: IntakeRule;
  /**
   * @maxItems 1024
   */
  entries: Text[];
}
/**
 * Facts the task declares about its change. Any one of them makes the task architectural.
 */
export interface IntakeDeclared {
  /**
   * @maxItems 1024
   */
  newDependencies: Entry[];
  /**
   * @maxItems 1024
   */
  newModules: Entry[];
  /**
   * @maxItems 64
   */
  surfaceChanges: IntakeSurfaceChange[];
  newProcessBoundary: boolean;
}
/**
 * The friction the class sets: `minimal` from the chore downgrade, otherwise the configured default intensity.
 */
export interface IntakeFriction {
  intensity: "moderate" | "minimal" | "low" | "high";
  source: "default" | "choreDowngrade";
}
/**
 * The owner overrode the class from the CLI with a reason. A downward override is approved at the TTY first; the attestation is none until slice SIG.
 */
export interface IntakeOverridden {
  kind: "intake.overridden";
  from: IntakeClass;
  to: IntakeClass;
  /**
   * The owner's reason, escaped: not empty and not only spaces.
   */
  reason: string;
  by: "cli";
  attestation: IntakeAttestation;
}
export interface IntakeAttestationNone {
  kind: "none";
}
/**
 * The harness reclassified the task because of a floor signal or the plan-time pass. Upward only (Q52): `to` ranks above `from` (chore < bounded < architectural). The schema cannot express that order, so the harness's upgradeOnly guard enforces it before the event is written.
 */
export interface IntakeReclassified {
  kind: "intake.reclassified";
  from: IntakeClass;
  to: IntakeClass;
  /**
   * `floor`: a structural floor signal. `plan`: the plan-time pass.
   */
  source: "floor" | "plan";
  /**
   * The signals that caused the reclassification.
   *
   * @minItems 1
   * @maxItems 256
   */
  signalIds: [string, ...string[]];
  rubricVersion: RubricVersion;
}
