// Generated from schemas/object-event.schema.json by scripts/generate.ts. Do not edit.

/**
 * Payload of an object event in the session log (B5-2, Q61), validated before it is appended and when it is read. `kind` equals the event's `type`; the writer checks that relation. A payload holds only what its writer knows: each record's `createdAt` and `createdSeq` are the envelope's `at` and `seq`, and its kind, ring and creation-time constants come from objects.schema.json, so none of them is in a payload. `decision.recommendation.revealed` (A3) and every `decision.owner.*` type (SIG) are reserved: they have no variant, so this schema rejects them. Uniqueness inside arrays, sorted scope, the footprint content address and a Ruling's null class for intake are checked by the writer, not the schema.
 */
export type ObjectEvent =
  | TaskCreated
  | RunRecorded
  | ArtifactRecorded
  | DecisionOpened
  | DecisionFootprintRecorded
  | DecisionOutcomeSignalled;
/**
 * Kind-prefixed task ID, also a valid session-log ID (at most 128 characters).
 */
export type TaskId = string;
/**
 * A scope entry: an entry without a backslash, relative (no leading `/`) and without empty, `.` or `..` segments, as the rubric requires.
 */
export type ScopeEntry = string;
/**
 * Task class, in rank order: chore < bounded < architectural.
 */
export type TaskClass = "chore" | "bounded" | "architectural";
/**
 * Kind-prefixed artifact ID, also a valid session-log ID (at most 128 characters).
 */
export type ArtifactId = string;
/**
 * What the artifact is; the footprint types are the Q47 representation: files, exported symbols, dependency names and module IDs.
 */
export type ArtifactType =
  | "diff"
  | "report"
  | "conceptExpansion"
  | "footprint.file"
  | "footprint.symbol"
  | "footprint.dependency"
  | "footprint.module";
/**
 * The harness opened a ledger entry: an owned decision with its brief, or a Ruling, which is the variant with authority harness, a ruling body and no brief.
 */
export type DecisionOpened = DecisionOpenedOwned | DecisionOpenedRuling;
/**
 * Kind-prefixed decision ID, also a valid session-log ID (at most 128 characters).
 */
export type DecisionId = string;
/**
 * The ID of a signal that raised a decision, such as a floor signal ID or the event ID of an `intake.classified` event.
 */
export type SignalId = string;
/**
 * The signals that raised the decision, unique (checked by the writer); empty for a plan's `decisions[]`.
 *
 * @maxItems 256
 */
export type SignalIds = SignalId[];
/**
 * An owned decision class (03 Owned decision classes, X3): architecture, scope or technology.
 */
export type DecisionClass = "architecture" | "scope" | "technology";
/**
 * One line of 1 to 160 code points, not only spaces, without a control character, line break, bidi control or lone surrogate.
 */
export type Question = string;
/**
 * One line of 1 to 80 code points, not only spaces, without a control character, line break, bidi control or lone surrogate.
 */
export type OptionLabel = string;
/**
 * The harness's confidence in its recommendation, shown in the brief before reveal (Q45, Q48, OD-4).
 */
export type DecisionConfidence = "low" | "medium" | "high";
/**
 * A concept slug (X6): 1 to 64 lowercase letters, digits and hyphens, not starting with a hyphen.
 */
export type ConceptSlug = string;
/**
 * The version of the rubric that routed the call, such as `intake-rubric-1` or `materiality-rubric-1`.
 */
export type RubricVersion = string;

/**
 * The harness created a Task at run start (TaskRecord): `createdAt` and `createdSeq` are the envelope's `at` and `seq`, and `status` starts `open`.
 */
export interface TaskCreated {
  kind: "task.created";
  id: TaskId;
  /**
   * The repository the task is for: the realpath of its common git dir, as in `config.accepted.repo`.
   */
  repoId: string;
  /**
   * The task text given to the engine (the task file's `title`), not blank, at most 8192 code points.
   */
  text: string;
  /**
   * The declared scope, sorted and unique (checked by the writer); empty when none was declared.
   *
   * @maxItems 256
   */
  scope: ScopeEntry[];
}
/**
 * The harness recorded a Run at run start (RunRecord): the record's `id`, `graphId` and `nodeId` are the envelope's `runId`, `graphId` and `nodeId`, `createdAt` and `createdSeq` its `at` and `seq`, and `terminal` starts `null`.
 */
export interface RunRecorded {
  kind: "run.recorded";
  /**
   * Kind-prefixed task ID, also a valid session-log ID (at most 128 characters).
   */
  taskId: string;
  /**
   * The engine kind; only the scripted engine exists until B11 adds the native and B13 the hosted engine with their fixtures (07 rule 1).
   */
  engine: "scripted";
  /**
   * The commit the worktree was created from (`run.started.baseCommit`).
   */
  baseCommit: string;
  class: TaskClass;
}
/**
 * The harness recorded an Artifact (ArtifactRecord): `createdAt` and `createdSeq` are the envelope's `at` and `seq`. For `footprint.*` the writer checks the content address: `sha256` is the SHA-256 of the UTF-8 bytes of `JSON.stringify([type, repoId, ref])` and `id` is `artifact-<sha256>`.
 */
export interface ArtifactRecorded {
  kind: "artifact.recorded";
  id: ArtifactId;
  type: ArtifactType;
  /**
   * The repository the artifact belongs to; absent only for a concept expansion.
   */
  repoId?: string;
  /**
   * Type-specific escaped locator (diff: candidate tree OID; report: path under the state dir; conceptExpansion: concept slug; footprint.*: repo-relative path, `<path>#<exported name>`, dependency name or module ID), whose grammar the first writer of each type fixes (A2, B15, C2, A1).
   */
  ref: string;
  /**
   * For `footprint.*` the content address above; otherwise the SHA-256 of the stored content.
   */
  sha256: string;
  /**
   * The run that produced it, when one did; footprints and expansions may be recorded outside a run (A1, A7, C2).
   */
  runId?: string;
}
/**
 * The harness opened a decision in an owned class with its brief (OwnedDecisionRecord): `createdAt` and `createdSeq` are the envelope's `at` and `seq`, `footprint` and `outcomes` start empty and `status` starts `pending`. Owner-written fields arrive with SIG, A3, A1 and A7.
 */
export interface DecisionOpenedOwned {
  kind: "decision.opened";
  id: DecisionId;
  /**
   * Who decides: the owner.
   */
  authority: "owner";
  /**
   * Kind-prefixed task ID, also a valid session-log ID (at most 128 characters).
   */
  taskId: string;
  /**
   * The run that opened the decision.
   */
  runId: string;
  signalIds: SignalIds;
  class: DecisionClass;
  /**
   * What raised the decision: the plan's `decisions[]`, a floor signal over the brief threshold, or the agent's self-flag (Q45, Q53, Q54).
   */
  source: "plan" | "floor" | "selfFlag";
  brief: DecisionBrief;
}
/**
 * The brief as presented (03 The brief, Q45), written by the harness when it opens the decision; it holds the recommendation only as a salted commitment until reveal (Q48).
 */
export interface DecisionBrief {
  question: Question;
  /**
   * The 2 to 4 options actually considered, in stored order, with unique IDs (checked by the writer).
   *
   * @minItems 2
   * @maxItems 4
   */
  options:
    | [DecisionOption, DecisionOption]
    | [DecisionOption, DecisionOption, DecisionOption]
    | [DecisionOption, DecisionOption, DecisionOption, DecisionOption];
  /**
   * The recommendation as a salted commitment: SHA-256 of the UTF-8 bytes of `JSON.stringify([decisionId, optionId, nonce])` (no whitespace), where the nonce is 256 random bits as 64 lowercase hex digits, and the nonce and option are revealed later in `decision.recommendation.revealed` (B5-2 reserves it, A3 writes it).
   */
  recommendationSha256: string;
  /**
   * The logged seed of the shuffled display order of the options (Q48).
   */
  optionOrderSeed: string;
  confidence: DecisionConfidence;
  /**
   * The cost if the decision is wrong, as one line of at most 200 code points.
   */
  costIfWrong: string;
  /**
   * How hard the decision is to undo (03 The brief, OD-5).
   */
  reversibility: "reversible" | "costly" | "irreversible";
  /**
   * What the harness is uncertain about, as one line of at most 200 code points.
   */
  uncertainty: string;
  /**
   * What is blocked while the decision waits, as one line of at most 200 code points.
   */
  blocked: string;
  /**
   * The concept slugs the brief references (X6), unique (checked by the writer); may be empty.
   *
   * @maxItems 64
   */
  concepts: ConceptSlug[];
  /**
   * The footprint the harness expects the decision to have (Q45), as content-addressed artifact IDs, unique (checked by the writer); may be empty.
   *
   * @maxItems 1024
   */
  proposedFootprint: ArtifactId[];
}
/**
 * One option of a brief, whose ID stays the same under the shuffled display order (Q48).
 */
export interface DecisionOption {
  id: "a" | "b" | "c" | "d";
  label: OptionLabel;
  /**
   * The option's trade-offs, as one line of at most 200 code points (Q45).
   */
  tradeoffs: string;
}
/**
 * The harness recorded a Ruling (RulingRecord): `createdAt` and `createdSeq` are the envelope's `at` and `seq`, `footprint` and `outcomes` start empty and `status` is `resolved`. A Ruling has no brief and no owner-written field; with source `intake` its class is `null` (checked by the writer).
 */
export interface DecisionOpenedRuling {
  kind: "decision.opened";
  id: DecisionId;
  /**
   * Who decided: the harness.
   */
  authority: "harness";
  /**
   * Kind-prefixed task ID, also a valid session-log ID (at most 128 characters).
   */
  taskId: string;
  /**
   * The run that opened the decision.
   */
  runId: string;
  signalIds: SignalIds;
  /**
   * The owned class of the call, or `null` when the call is outside the owned classes, such as intake (OD-2).
   */
  class: null | DecisionClass;
  /**
   * What raised the call: the plan-time pass, a floor signal under the brief threshold, or intake (Q53, Q54, Q-B5-2).
   */
  source: "plan" | "floor" | "intake";
  ruling: Ruling;
}
/**
 * What the harness decided, why, the cost if wrong and the version of the rubric that routed the call (03 Delegated authority, Q53).
 */
export interface Ruling {
  /**
   * What the harness decided, as one line of at most 200 code points.
   */
  what: string;
  /**
   * Why the harness decided it, not blank, at most 8192 code points.
   */
  why: string;
  /**
   * The cost if the call is wrong, as one line of at most 200 code points. An intake Ruling's comes from a fixed table keyed by its rubric version.
   */
  costIfWrong: string;
  rubricVersion: RubricVersion;
}
/**
 * The harness recorded the footprint of a decision when it closed (Q47); it sets the record's `footprint` once (checked by the writer).
 */
export interface DecisionFootprintRecorded {
  kind: "decision.footprint.recorded";
  decisionId: DecisionId;
  /**
   * The footprint artifact IDs, unique (checked by the writer).
   *
   * @minItems 1
   * @maxItems 1024
   */
  artifactIds: [ArtifactId, ...ArtifactId[]];
}
/**
 * The harness found that a later run's diff matched a decision's footprint (Q47); it appends `{kind: "signal", signal, runId, artifactIds, at, seq}` to the record's `outcomes`, with the envelope's `at` and `seq`.
 */
export interface DecisionOutcomeSignalled {
  kind: "decision.outcome.signalled";
  decisionId: DecisionId;
  /**
   * `rework`: the diff changed a symbol of a footprint file; `dependencyChanged`: it added or removed a footprint dependency (Q47).
   */
  signal: "rework" | "dependencyChanged";
  /**
   * The run whose diff matched.
   */
  runId: string;
  /**
   * The footprint entries the diff matched.
   *
   * @minItems 1
   * @maxItems 256
   */
  artifactIds: [ArtifactId, ...ArtifactId[]];
}
