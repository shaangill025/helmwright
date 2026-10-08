// Generated from schemas/objects.schema.json by scripts/generate.ts. Do not edit.

/**
 * One record of the harness object model (10 Ontology position, Q61): the five kinds Task, Run, Artifact, Rule and Skill. Event is the session-log envelope (event.schema.json); Decision with Ruling arrives in B5-1b. Every object carries its ring, kind-prefixed ID, typed links by ID pattern, and the seq and time of the event that created it. Link existence, uniqueness inside arrays, sorted scope and the footprint content address are relations the harness checks, not the schema.
 */
export type ObjectRecord =
  TaskRecord | RunRecord | ArtifactRecord | RuleRecord | SkillRecord;
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
 * One execution of a Task at a base commit with the intake class it started with (after any owner override; a later upward reclassification is an `intake.reclassified` event), written by the harness at run start; only `terminal` changes, once, at `run.terminated`.
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
