// Generated from schemas/intake-event.schema.json by scripts/generate.ts. Do not edit.

/**
 * Payload of an intake event in the session log (B10, Q52), validated before it is appended. `kind` equals the event's `type`; the writer checks that relation. Intake is a Ring 0 step (03 Intake): each task is classified once by the deterministic rubric, an owner override is logged with its reason, and the harness may later reclassify only upward.
 */
export type IntakeEvent =
  IntakeClassified | IntakeOverridden | IntakeReclassified;
/**
 * Kind-prefixed task ID, also a valid session-log ID (at most 128 characters).
 */
export type TaskId = string;
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
 * Escaped display text: 1 to 8192 code points without C0 or C1 controls, format characters, line or paragraph separators or lone surrogates.
 */
export type DisplayText = string;
/**
 * A scope entry: an entry without a backslash, relative (no leading `/`) and without empty, `.` or `..` segments, as the rubric requires.
 */
export type ScopeEntry = string;
/**
 * Lowercase hex SHA-256.
 */
export type Sha256 = string;
/**
 * A declared module or dependency: 1 to 1024 code points without C0 or C1 controls, format characters (bidi controls, zero-width), line or paragraph separators or lone surrogates (\p{Cf}, \p{Zl}, \p{Zp}, \p{Cs}).
 */
export type Entry = string;
export type IntakeSurfaceChange = "schema" | "publicApi" | "storage" | "wire";
/**
 * Proof of who overrode. Until slice SIG only `none` exists.
 */
export type IntakeAttestation = IntakeAttestationNone;
/**
 * Kind-prefixed decision ID, also a valid session-log ID (at most 128 characters).
 */
export type DecisionId = string;

/**
 * The rubric classified the task. `scopeSha256` is the SHA-256 of the canonical JSON of the sorted scope (of `[]` when the task declared none) and `ring0Sha256` that of the sorted Ring 0 paths the rubric used, so the class is bound to the exact scope and Ring 0 paths it was computed from.
 */
export interface IntakeClassified {
  kind: "intake.classified";
  taskId: TaskId;
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
   * @maxItems 256
   */
  scope: ScopeEntry[];
  scopeSha256: Sha256;
  /**
   * Lowercase hex SHA-256.
   */
  ring0Sha256: string;
  declared: IntakeDeclared;
  friction: IntakeFriction;
  /**
   * The sparring default the class sets. Only opt-in exists until A5.
   */
  sparring: "optIn";
}
/**
 * One rule that fired and the entries it fired on, escaped for display. `noDeclaredScope` and `newProcessBoundary` have no entries.
 */
export interface IntakeReason {
  rule: IntakeRule;
  /**
   * @maxItems 1024
   */
  entries: DisplayText[];
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
 * The owner overrode the class from the CLI with a reason. A downward override is approved at the TTY first; the attestation is none until slice SIG. `friction` is the effective friction of `to` by the rubric's rule under the run's friction config (`minimal` from the chore downgrade for a chore, otherwise the default intensity); the replay checks it. `decisionId` is the ID of the run's intake Ruling, which the override overrules (B5-5, Q61); the replay checks it.
 */
export interface IntakeOverridden {
  kind: "intake.overridden";
  taskId: TaskId;
  from: IntakeClass;
  to: IntakeClass;
  /**
   * Escaped display text: 1 to 8192 code points without C0 or C1 controls, format characters, line or paragraph separators or lone surrogates.
   */
  reason: string;
  by: "cli";
  attestation: IntakeAttestation;
  /**
   * Lowercase hex SHA-256.
   */
  scopeSha256: string;
  rubricVersion: RubricVersion;
  friction: IntakeFriction;
  decisionId: DecisionId;
}
export interface IntakeAttestationNone {
  kind: "none";
}
/**
 * The harness reclassified the task because of a floor signal or the plan-time pass. Strictly upward only (Q52): `from` ranks strictly below `to` (chore < bounded < architectural). The schema cannot express that order, so the harness's reclassifyUp guard enforces it in code before the event is written.
 */
export interface IntakeReclassified {
  kind: "intake.reclassified";
  taskId: TaskId;
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
   *
   * Items: The ID of a signal that raised a decision, such as a floor signal ID or the event ID of an `intake.classified` event.
   */
  signalIds: [string, ...string[]];
  rubricVersion: RubricVersion;
}
