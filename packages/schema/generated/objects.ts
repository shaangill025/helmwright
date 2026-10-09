// Generated from schemas/objects.schema.json by scripts/generate.ts. Do not edit.

/**
 * One record of the harness object model (10 Ontology position, Q61): the six kinds Task, Run, Artifact, Rule, Skill and Decision, where a Ruling is the Decision variant with authority harness. Event is the session-log envelope (event.schema.json). Every object carries its ring, kind-prefixed ID, typed links by ID pattern, and the seq and time of the event that created it. Link existence, uniqueness inside arrays, sorted scope and the footprint content address are relations the harness checks, not the schema.
 */
export type ObjectRecord =
  | TaskRecord
  | RunRecord
  | ArtifactRecord
  | RuleRecord
  | SkillRecord
  | DecisionRecord;
/**
 * Kind-prefixed task ID, also a valid session-log ID (at most 128 characters).
 */
export type TaskId = string;
/**
 * The `at` of the event that created the object.
 */
export type At = string;
/**
 * The `seq` of the event that created the object, so a rebuilt row is bound to its event.
 */
export type Seq = number;
/**
 * A scope entry: an entry without a backslash, relative (no leading `/`) and without empty, `.` or `..` segments, as the rubric requires.
 */
export type ScopeEntry = string;
/**
 * `open` at creation; `done` only from the evaluator's verdict (B15, AC7), never from a run terminal or an engine claim.
 */
export type TaskStatus = "open" | "done";
/**
 * Task class, in rank order: chore < bounded < architectural.
 */
export type TaskClass = "chore" | "bounded" | "architectural";
/**
 * Typed terminal state of a run, as in loop/terminal.ts.
 */
export type RunTerminal =
  | {
      kind: "completed";
    }
  | {
      kind: "incomplete";
      reason:
        | "timeout"
        | "max_iterations"
        | "max_tool_calls"
        | "no_progress"
        | "cancelled";
    }
  | {
      kind: "failed";
      error: DisplayText;
    };
/**
 * Escaped display text: 1 to 8192 code points without C0 or C1 controls, format characters, line or paragraph separators or lone surrogates.
 */
export type DisplayText = string;
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
 * Kind-prefixed rule ID, also a valid session-log ID (at most 128 characters).
 */
export type RuleId = string;
/**
 * Kind-prefixed decision ID, also a valid session-log ID (at most 128 characters).
 */
export type DecisionId = string;
/**
 * What makes the rule due for re-audit; a model upgrade at least.
 *
 * @minItems 1
 * @maxItems 3
 */
export type ReviewTrigger =
  | ["model" | "engine" | "milestone"]
  | ["model" | "engine" | "milestone", "model" | "engine" | "milestone"]
  | [
      "model" | "engine" | "milestone",
      "model" | "engine" | "milestone",
      "model" | "engine" | "milestone",
    ];
/**
 * `live` once approved and `retired` when the owner drops it; a harness-proposed status arrives with its M3 writer and fixture.
 */
export type RuleStatus = "live" | "retired";
/**
 * Kind-prefixed skill ID, also a valid session-log ID (at most 128 characters).
 */
export type SkillId = string;
/**
 * `candidate` while a proposal, `live` after the gate and veto window, `retired` after rollback or pruning.
 */
export type SkillStatus = "candidate" | "live" | "retired";
/**
 * A ledger entry (04 Decision ledger, Q61): an owned decision with its brief, or a Ruling, which is the variant with authority harness, a ruling body and no brief or owner-written field.
 */
export type DecisionRecord = OwnedDecisionRecord | RulingRecord;
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
 * Footprint artifact IDs (04 Loop 1, Q47), unique (checked by the writer); empty until the harness records the footprint when the decision closes.
 *
 * @maxItems 1024
 */
export type Footprint = ArtifactId[];
/**
 * The automatic outcome signals in append order (Q46); empty until a later run's diff matches the footprint.
 *
 * @maxItems 1024
 */
export type Outcomes = DecisionOutcome[];
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
 * Declared work on one repository, written by the harness at run start; only `status` changes after creation.
 */
export interface TaskRecord {
  id: TaskId;
  kind: "task";
  /**
   * The ring of the store that owns the object (05 Rings): the ledger is Ring 0.
   */
  ring: 0;
  createdAt: At;
  createdSeq: Seq;
  /**
   * The repository the task is for: the realpath of its common git dir, as in `config.accepted.repo`.
   */
  repoId: string;
  /**
   * The task text given to the engine (the task file's `title`), not blank, at most 8192 code points.
   */
  text: string;
  /**
   * The declared scope, sorted and unique (checked by the writer); empty when none was declared (then the class is architectural, OQ-B10-2).
   *
   * @maxItems 256
   */
  scope: ScopeEntry[];
  status: TaskStatus;
}
/**
 * One execution of a Task at a base commit with the intake class it started with: the rubric class after the worktree's Ring 0 link targets, equal to `intake.classified.class` (OD-B54-2; an owner override stays the `intake.overridden` event and a later upward reclassification an `intake.reclassified` event), written by the harness before `run.started`; only `terminal` changes, once, at `run.terminated`.
 */
export interface RunRecord {
  /**
   * Kind-prefixed ID, also the `runId` of every event of this run (run→events link).
   */
  id: string;
  kind: "run";
  /**
   * The ring of the store that owns the object (05 Rings): the log is Ring 0.
   */
  ring: 0;
  createdAt: At;
  createdSeq: Seq;
  /**
   * Kind-prefixed task ID, also a valid session-log ID (at most 128 characters).
   */
  taskId: string;
  /**
   * The graph ID on every event of this run.
   */
  graphId: string;
  /**
   * The run's root node ID (M1: the single agent node).
   */
  nodeId: string;
  /**
   * The engine kind; only the scripted engine exists until B11 adds the native and B13 the hosted engine with their fixtures (07 rule 1).
   */
  engine: "scripted";
  /**
   * The commit the worktree was created from (`run.started.baseCommit`).
   */
  baseCommit: string;
  class: TaskClass;
  /**
   * `null` while the run is open, then the typed terminal state of `run.terminated`, where `completed` means the engine stopped, never that the task is done.
   */
  terminal: null | RunTerminal;
}
/**
 * A stored product of the harness: a diff, a report, a concept expansion (X6) or a footprint entry (Q47); `repoId` is required except for a concept expansion.
 */
export interface ArtifactRecord {
  id: ArtifactId;
  kind: "artifact";
  /**
   * The ring of the store that owns the object (05 Rings): the log and ledger are Ring 0.
   */
  ring: 0;
  createdAt: At;
  createdSeq: Seq;
  type: ArtifactType;
  /**
   * The repository the artifact belongs to; absent only for a concept expansion.
   */
  repoId?: string;
  /**
   * Escaped display text: 1 to 8192 code points without C0 or C1 controls, format characters, line or paragraph separators or lone surrogates.
   */
  ref: string;
  /**
   * For `footprint.*` the content address, SHA-256 of the canonical JSON `[type, repoId, ref]` with ID `artifact-<sha256>` (checked on write, B5-3); otherwise the SHA-256 of the stored content.
   */
  sha256: string;
  /**
   * The run that produced it, when one did; footprints and expansions may be recorded outside a run (A1, A7, C2).
   */
  runId?: string;
}
/**
 * An owner-approved rule in the rulebook (04 Bridge to the harness loop), written only through an owner action (Q6); no M1 writer.
 */
export interface RuleRecord {
  id: RuleId;
  kind: "rule";
  /**
   * The ring of the store that owns the object (05 Rings): the ledger and rulebook are Ring 0 (owner D-3; revisit at M3 with the evolve agent's rule proposals, T-04-14).
   */
  ring: 0;
  createdAt: At;
  createdSeq: Seq;
  /**
   * The rule as the owner approved it, for example a pattern-we-do-not-use.
   */
  text: string;
  /**
   * Who approved the rule: only the owner until the evolve agent proposes rules (M3, T-04-14).
   */
  authority: "owner";
  /**
   * The ledger entries the rule rests on, unique (checked by the writer); may be empty for a hand-authored rule.
   *
   * @maxItems 256
   */
  evidenceDecisionIds: DecisionId[];
  /**
   * The assumption the rule rests on, as one line, like a rot-register entry.
   */
  assumption: string;
  reviewTrigger: ReviewTrigger;
  status: RuleStatus;
}
/**
 * One version of a skill file, promoted by the evolve agent through the composite gate (05, M3); no M1 writer.
 */
export interface SkillRecord {
  id: SkillId;
  kind: "skill";
  /**
   * The ring of the store that owns the object (05 Rings): skills are Ring 1.
   */
  ring: 1;
  createdAt: At;
  createdSeq: Seq;
  /**
   * The skill's name, a lowercase slug.
   */
  name: string;
  /**
   * Revision number of this skill file; a new version is a new object (one logical change per commit).
   */
  version: number;
  /**
   * SHA-256 of the skill file at this version.
   */
  digest: string;
  status: SkillStatus;
}
/**
 * A decision in an owned class, opened by the harness with its brief; owner-written fields are absent until SIG, A3, A1 and A7 add them with their writers (B5-1b owner answers OD-1).
 */
export interface OwnedDecisionRecord {
  id: DecisionId;
  kind: "decision";
  /**
   * The ring of the store that owns the object (05 Rings): the ledger is Ring 0.
   */
  ring: 0;
  createdAt: At;
  createdSeq: Seq;
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
  footprint: Footprint;
  outcomes: Outcomes;
  class: DecisionClass;
  /**
   * What raised the decision: the plan's `decisions[]`, a floor signal over the brief threshold, or the agent's self-flag (Q45, Q53, Q54).
   */
  source: "plan" | "floor" | "selfFlag";
  /**
   * `pending` until the owner's first answer, then `resolved` once (card contract), which cannot happen before SIG.
   */
  status: "pending" | "resolved";
  brief: DecisionBrief;
}
/**
 * An automatic outcome signal (Q47) that the harness appends when a later run's diff matches the footprint; owner confirmations, dismissals and review outcomes arrive with their writers.
 */
export interface DecisionOutcome {
  kind: "signal";
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
  /**
   * The `at` of the event that created the object.
   */
  at: string;
  /**
   * The `seq` of the event that created the object, so a rebuilt row is bound to its event.
   */
  seq: number;
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
 * A delegated call the harness decided and recorded as a Ruling (03 Delegated authority, Q53, Q61); it has no brief and no owner-written field.
 */
export interface RulingRecord {
  id: DecisionId;
  kind: "decision";
  /**
   * The ring of the store that owns the object (05 Rings): the ledger is Ring 0.
   */
  ring: 0;
  createdAt: At;
  createdSeq: Seq;
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
  footprint: Footprint;
  outcomes: Outcomes;
  /**
   * The owned class of the call, or `null` when the call is outside the owned classes, such as intake (OD-2).
   */
  class: null | DecisionClass;
  /**
   * What raised the call: the plan-time pass, a floor signal under the brief threshold, or intake (Q53, Q54, Q-B5-2).
   */
  source: "plan" | "floor" | "intake";
  /**
   * A Ruling is resolved when it is recorded, because the harness made the call.
   */
  status: "resolved";
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
