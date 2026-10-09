// Generated from schemas/objects.schema.json by scripts/generate.ts. Do not edit.
"use strict";
export const validate = validate20;
export default validate20;
const schema31 = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/shaangill025/helmwright/schemas/objects.schema.json",
  title: "ObjectRecord",
  description:
    "One record of the harness object model (10 Ontology position, Q61): the six kinds Task, Run, Artifact, Rule, Skill and Decision, where a Ruling is the Decision variant with authority harness. Event is the session-log envelope (event.schema.json). Every object carries its ring, kind-prefixed ID, typed links by ID pattern, and the seq and time of the event that created it. Link existence, uniqueness inside arrays, sorted scope and the footprint content address are relations the harness checks, not the schema.",
  type: "object",
  oneOf: [
    { $ref: "#/$defs/task" },
    { $ref: "#/$defs/run" },
    { $ref: "#/$defs/artifact" },
    { $ref: "#/$defs/rule" },
    { $ref: "#/$defs/skill" },
    { $ref: "#/$defs/decision" },
  ],
  $defs: {
    task: {
      title: "TaskRecord",
      description:
        "Declared work on one repository, written by the harness at run start; only `status` changes after creation.",
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "kind",
        "ring",
        "createdAt",
        "createdSeq",
        "repoId",
        "text",
        "scope",
        "status",
      ],
      properties: {
        id: { $ref: "#/$defs/taskId" },
        kind: { const: "task" },
        ring: {
          description:
            "The ring of the store that owns the object (05 Rings): the ledger is Ring 0.",
          const: 0,
        },
        createdAt: { $ref: "#/$defs/at" },
        createdSeq: { $ref: "#/$defs/seq" },
        repoId: {
          $ref: "#/$defs/repoId",
          description:
            "The repository the task is for: the realpath of its common git dir, as in `config.accepted.repo`.",
        },
        text: {
          $ref: "#/$defs/text",
          description:
            "The task text given to the engine (the task file's `title`), not blank, at most 8192 code points.",
        },
        scope: {
          description:
            "The declared scope, sorted and unique (checked by the writer); empty when none was declared (then the class is architectural, OQ-B10-2).",
          type: "array",
          maxItems: 256,
          items: { $ref: "#/$defs/scopeEntry" },
        },
        status: {
          title: "TaskStatus",
          description:
            "`open` at creation; `done` only from the evaluator's verdict (B15, AC7), never from a run terminal or an engine claim.",
          enum: ["open", "done"],
        },
      },
    },
    run: {
      title: "RunRecord",
      description:
        "One execution of a Task at a base commit with the intake class it started with: the rubric class after the worktree's Ring 0 link targets, equal to `intake.classified.class` (OD-B54-2; an owner override stays the `intake.overridden` event and a later upward reclassification an `intake.reclassified` event), written by the harness before `run.started`; only `terminal` changes, once, at `run.terminated`.",
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "kind",
        "ring",
        "createdAt",
        "createdSeq",
        "taskId",
        "graphId",
        "nodeId",
        "engine",
        "baseCommit",
        "class",
        "terminal",
      ],
      properties: {
        id: {
          $ref: "#/$defs/runId",
          description:
            "Kind-prefixed ID, also the `runId` of every event of this run (run→events link).",
        },
        kind: { const: "run" },
        ring: {
          description:
            "The ring of the store that owns the object (05 Rings): the log is Ring 0.",
          const: 0,
        },
        createdAt: { $ref: "#/$defs/at" },
        createdSeq: { $ref: "#/$defs/seq" },
        taskId: {
          $ref: "#/$defs/taskId",
          description: "The Task this run executes (typed link task→run).",
        },
        graphId: {
          $ref: "#/$defs/envelopeId",
          description: "The graph ID on every event of this run.",
        },
        nodeId: {
          $ref: "#/$defs/envelopeId",
          description: "The run's root node ID (M1: the single agent node).",
        },
        engine: {
          description:
            "The engine kind; only the scripted engine exists until B11 adds the native and B13 the hosted engine with their fixtures (07 rule 1).",
          const: "scripted",
        },
        baseCommit: {
          $ref: "#/$defs/oid",
          description:
            "The commit the worktree was created from (`run.started.baseCommit`).",
        },
        class: { $ref: "#/$defs/taskClass" },
        terminal: {
          description:
            "`null` while the run is open, then the typed terminal state of `run.terminated`, where `completed` means the engine stopped, never that the task is done.",
          oneOf: [{ type: "null" }, { $ref: "#/$defs/terminal" }],
        },
      },
    },
    artifact: {
      title: "ArtifactRecord",
      description:
        "A stored product of the harness: a diff, a report, a concept expansion (X6) or a footprint entry (Q47); `repoId` is required except for a concept expansion.",
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "kind",
        "ring",
        "createdAt",
        "createdSeq",
        "type",
        "ref",
        "sha256",
      ],
      properties: {
        id: { $ref: "#/$defs/artifactId" },
        kind: { const: "artifact" },
        ring: {
          description:
            "The ring of the store that owns the object (05 Rings): the log and ledger are Ring 0.",
          const: 0,
        },
        createdAt: { $ref: "#/$defs/at" },
        createdSeq: { $ref: "#/$defs/seq" },
        type: {
          title: "ArtifactType",
          description:
            "What the artifact is; the footprint types are the Q47 representation: files, exported symbols, dependency names and module IDs.",
          enum: [
            "diff",
            "report",
            "conceptExpansion",
            "footprint.file",
            "footprint.symbol",
            "footprint.dependency",
            "footprint.module",
          ],
        },
        repoId: {
          $ref: "#/$defs/repoId",
          description:
            "The repository the artifact belongs to; absent only for a concept expansion.",
        },
        ref: {
          $ref: "#/$defs/displayText",
          description:
            "Type-specific escaped locator (diff: candidate tree OID; report: path under the state dir; conceptExpansion: concept slug; footprint.*: repo-relative path, `<path>#<exported name>`, dependency name or module ID), whose grammar the first writer of each type fixes (A2, B15, C2, A1).",
        },
        sha256: {
          $ref: "#/$defs/sha256",
          description:
            "For `footprint.*` the content address, SHA-256 of the canonical JSON `[type, repoId, ref]` with ID `artifact-<sha256>` (checked on write, B5-3); otherwise the SHA-256 of the stored content.",
        },
        runId: {
          $ref: "#/$defs/runId",
          description:
            "The run that produced it, when one did; footprints and expansions may be recorded outside a run (A1, A7, C2).",
        },
      },
      if: {
        properties: {
          type: {
            enum: [
              "diff",
              "report",
              "footprint.file",
              "footprint.symbol",
              "footprint.dependency",
              "footprint.module",
            ],
          },
        },
      },
      then: {
        properties: { repoId: { $ref: "#/$defs/repoId" } },
        required: ["repoId"],
      },
    },
    rule: {
      title: "RuleRecord",
      description:
        "An owner-approved rule in the rulebook (04 Bridge to the harness loop), written only through an owner action (Q6); no M1 writer.",
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "kind",
        "ring",
        "createdAt",
        "createdSeq",
        "text",
        "authority",
        "evidenceDecisionIds",
        "assumption",
        "reviewTrigger",
        "status",
      ],
      properties: {
        id: { $ref: "#/$defs/ruleId" },
        kind: { const: "rule" },
        ring: {
          description:
            "The ring of the store that owns the object (05 Rings): the ledger and rulebook are Ring 0 (owner D-3; revisit at M3 with the evolve agent's rule proposals, T-04-14).",
          const: 0,
        },
        createdAt: { $ref: "#/$defs/at" },
        createdSeq: { $ref: "#/$defs/seq" },
        text: {
          $ref: "#/$defs/text",
          description:
            "The rule as the owner approved it, for example a pattern-we-do-not-use.",
        },
        authority: {
          description:
            "Who approved the rule: only the owner until the evolve agent proposes rules (M3, T-04-14).",
          const: "owner",
        },
        evidenceDecisionIds: {
          description:
            "The ledger entries the rule rests on, unique (checked by the writer); may be empty for a hand-authored rule.",
          type: "array",
          maxItems: 256,
          items: { $ref: "#/$defs/decisionId" },
        },
        assumption: {
          $ref: "#/$defs/assumption",
          description:
            "The assumption the rule rests on, as one line, like a rot-register entry.",
        },
        reviewTrigger: {
          $ref: "#/$defs/reviewTrigger",
          description:
            "What makes the rule due for re-audit; a model upgrade at least.",
        },
        status: {
          title: "RuleStatus",
          description:
            "`live` once approved and `retired` when the owner drops it; a harness-proposed status arrives with its M3 writer and fixture.",
          enum: ["live", "retired"],
        },
      },
    },
    skill: {
      title: "SkillRecord",
      description:
        "One version of a skill file, promoted by the evolve agent through the composite gate (05, M3); no M1 writer.",
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "kind",
        "ring",
        "createdAt",
        "createdSeq",
        "name",
        "version",
        "digest",
        "status",
      ],
      properties: {
        id: { $ref: "#/$defs/skillId" },
        kind: { const: "skill" },
        ring: {
          description:
            "The ring of the store that owns the object (05 Rings): skills are Ring 1.",
          const: 1,
        },
        createdAt: { $ref: "#/$defs/at" },
        createdSeq: { $ref: "#/$defs/seq" },
        name: {
          description: "The skill's name, a lowercase slug.",
          type: "string",
          pattern: "^[a-z][a-z0-9-]{0,63}$",
        },
        version: {
          description:
            "Revision number of this skill file; a new version is a new object (one logical change per commit).",
          type: "integer",
          minimum: 1,
          maximum: 9007199254740991,
        },
        digest: {
          $ref: "#/$defs/sha256",
          description: "SHA-256 of the skill file at this version.",
        },
        status: {
          title: "SkillStatus",
          description:
            "`candidate` while a proposal, `live` after the gate and veto window, `retired` after rollback or pruning.",
          enum: ["candidate", "live", "retired"],
        },
      },
    },
    decision: {
      title: "DecisionRecord",
      description:
        "A ledger entry (04 Decision ledger, Q61): an owned decision with its brief, or a Ruling, which is the variant with authority harness, a ruling body and no brief or owner-written field.",
      oneOf: [{ $ref: "#/$defs/ownedDecision" }, { $ref: "#/$defs/ruling" }],
    },
    ownedDecision: {
      title: "OwnedDecisionRecord",
      description:
        "A decision in an owned class, opened by the harness with its brief; owner-written fields are absent until SIG, A3, A1 and A7 add them with their writers (B5-1b owner answers OD-1).",
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "kind",
        "ring",
        "createdAt",
        "createdSeq",
        "authority",
        "taskId",
        "runId",
        "signalIds",
        "footprint",
        "outcomes",
        "class",
        "source",
        "status",
        "brief",
      ],
      properties: {
        id: { $ref: "#/$defs/decisionId" },
        kind: { const: "decision" },
        ring: {
          description:
            "The ring of the store that owns the object (05 Rings): the ledger is Ring 0.",
          const: 0,
        },
        createdAt: { $ref: "#/$defs/at" },
        createdSeq: { $ref: "#/$defs/seq" },
        authority: { description: "Who decides: the owner.", const: "owner" },
        taskId: {
          $ref: "#/$defs/taskId",
          description:
            "The task the decision belongs to (typed link task→decision).",
        },
        runId: {
          $ref: "#/$defs/runId",
          description: "The run that opened the decision.",
        },
        signalIds: { $ref: "#/$defs/signalIds" },
        footprint: { $ref: "#/$defs/footprint" },
        outcomes: { $ref: "#/$defs/outcomes" },
        class: { $ref: "#/$defs/decisionClass" },
        source: {
          description:
            "What raised the decision: the plan's `decisions[]`, a floor signal over the brief threshold, or the agent's self-flag (Q45, Q53, Q54).",
          enum: ["plan", "floor", "selfFlag"],
        },
        status: {
          description:
            "`pending` until the owner's first answer, then `resolved` once (card contract), which cannot happen before SIG.",
          enum: ["pending", "resolved"],
        },
        brief: { $ref: "#/$defs/brief" },
      },
    },
    ruling: {
      title: "RulingRecord",
      description:
        "A delegated call the harness decided and recorded as a Ruling (03 Delegated authority, Q53, Q61); it has no brief and no owner-written field.",
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "kind",
        "ring",
        "createdAt",
        "createdSeq",
        "authority",
        "taskId",
        "runId",
        "signalIds",
        "footprint",
        "outcomes",
        "class",
        "source",
        "status",
        "ruling",
      ],
      properties: {
        id: { $ref: "#/$defs/decisionId" },
        kind: { const: "decision" },
        ring: {
          description:
            "The ring of the store that owns the object (05 Rings): the ledger is Ring 0.",
          const: 0,
        },
        createdAt: { $ref: "#/$defs/at" },
        createdSeq: { $ref: "#/$defs/seq" },
        authority: {
          description: "Who decided: the harness.",
          const: "harness",
        },
        taskId: {
          $ref: "#/$defs/taskId",
          description:
            "The task the decision belongs to (typed link task→decision).",
        },
        runId: {
          $ref: "#/$defs/runId",
          description: "The run that opened the decision.",
        },
        signalIds: { $ref: "#/$defs/signalIds" },
        footprint: { $ref: "#/$defs/footprint" },
        outcomes: { $ref: "#/$defs/outcomes" },
        class: {
          description:
            "The owned class of the call, or `null` when the call is outside the owned classes, such as intake (OD-2).",
          oneOf: [{ type: "null" }, { $ref: "#/$defs/decisionClass" }],
        },
        source: {
          description:
            "What raised the call: the plan-time pass, a floor signal under the brief threshold, or intake (Q53, Q54, Q-B5-2).",
          enum: ["plan", "floor", "intake"],
        },
        status: {
          description:
            "A Ruling is resolved when it is recorded, because the harness made the call.",
          const: "resolved",
        },
        ruling: { $ref: "#/$defs/rulingBody" },
      },
    },
    brief: {
      title: "DecisionBrief",
      description:
        "The brief as presented (03 The brief, Q45), written by the harness when it opens the decision; it holds the recommendation only as a salted commitment until reveal (Q48).",
      type: "object",
      additionalProperties: false,
      required: [
        "question",
        "options",
        "recommendationSha256",
        "optionOrderSeed",
        "confidence",
        "costIfWrong",
        "reversibility",
        "uncertainty",
        "blocked",
        "concepts",
        "proposedFootprint",
      ],
      properties: {
        question: { $ref: "#/$defs/question" },
        options: {
          description:
            "The 2 to 4 options actually considered, in stored order, with unique IDs (checked by the writer).",
          type: "array",
          minItems: 2,
          maxItems: 4,
          items: { $ref: "#/$defs/option" },
        },
        recommendationSha256: {
          $ref: "#/$defs/sha256",
          description:
            "The recommendation as a salted commitment: SHA-256 of the UTF-8 bytes of `JSON.stringify([decisionId, optionId, nonce])` (no whitespace), where the nonce is 256 random bits as 64 lowercase hex digits, and the nonce and option are revealed later in `decision.recommendation.revealed` (B5-2 reserves it, A3 writes it).",
        },
        optionOrderSeed: {
          $ref: "#/$defs/seed",
          description:
            "The logged seed of the shuffled display order of the options (Q48).",
        },
        confidence: {
          title: "DecisionConfidence",
          description:
            "The harness's confidence in its recommendation, shown in the brief before reveal (Q45, Q48, OD-4).",
          enum: ["low", "medium", "high"],
        },
        costIfWrong: {
          $ref: "#/$defs/line",
          description:
            "The cost if the decision is wrong, as one line of at most 200 code points.",
        },
        reversibility: {
          description: "How hard the decision is to undo (03 The brief, OD-5).",
          enum: ["reversible", "costly", "irreversible"],
        },
        uncertainty: {
          $ref: "#/$defs/line",
          description:
            "What the harness is uncertain about, as one line of at most 200 code points.",
        },
        blocked: {
          $ref: "#/$defs/line",
          description:
            "What is blocked while the decision waits, as one line of at most 200 code points.",
        },
        concepts: {
          description:
            "The concept slugs the brief references (X6), unique (checked by the writer); may be empty.",
          type: "array",
          maxItems: 64,
          items: { $ref: "#/$defs/conceptSlug" },
        },
        proposedFootprint: {
          description:
            "The footprint the harness expects the decision to have (Q45), as content-addressed artifact IDs, unique (checked by the writer); may be empty.",
          type: "array",
          maxItems: 1024,
          items: { $ref: "#/$defs/artifactId" },
        },
      },
    },
    option: {
      title: "DecisionOption",
      description:
        "One option of a brief, whose ID stays the same under the shuffled display order (Q48).",
      type: "object",
      additionalProperties: false,
      required: ["id", "label", "tradeoffs"],
      properties: {
        id: { enum: ["a", "b", "c", "d"] },
        label: { $ref: "#/$defs/optionLabel" },
        tradeoffs: {
          $ref: "#/$defs/line",
          description:
            "The option's trade-offs, as one line of at most 200 code points (Q45).",
        },
      },
    },
    rulingBody: {
      title: "Ruling",
      description:
        "What the harness decided, why, the cost if wrong and the version of the rubric that routed the call (03 Delegated authority, Q53).",
      type: "object",
      additionalProperties: false,
      required: ["what", "why", "costIfWrong", "rubricVersion"],
      properties: {
        what: {
          $ref: "#/$defs/line",
          description:
            "What the harness decided, as one line of at most 200 code points.",
        },
        why: {
          $ref: "#/$defs/text",
          description:
            "Why the harness decided it, not blank, at most 8192 code points.",
        },
        costIfWrong: {
          $ref: "#/$defs/line",
          description:
            "The cost if the call is wrong, as one line of at most 200 code points. An intake Ruling's comes from a fixed table keyed by its rubric version.",
        },
        rubricVersion: { $ref: "#/$defs/rubricVersion" },
      },
    },
    outcomeSignal: {
      title: "DecisionOutcome",
      description:
        "An automatic outcome signal (Q47) that the harness appends when a later run's diff matches the footprint; owner confirmations, dismissals and review outcomes arrive with their writers.",
      type: "object",
      additionalProperties: false,
      required: ["kind", "signal", "runId", "artifactIds", "at", "seq"],
      properties: {
        kind: { const: "signal" },
        signal: {
          description:
            "`rework`: the diff changed a symbol of a footprint file; `dependencyChanged`: it added or removed a footprint dependency (Q47).",
          enum: ["rework", "dependencyChanged"],
        },
        runId: {
          $ref: "#/$defs/runId",
          description: "The run whose diff matched.",
        },
        artifactIds: {
          description: "The footprint entries the diff matched.",
          type: "array",
          minItems: 1,
          maxItems: 256,
          items: { $ref: "#/$defs/artifactId" },
        },
        at: {
          $ref: "#/$defs/at",
          description: "The `at` of the event that appended the signal.",
        },
        seq: {
          $ref: "#/$defs/seq",
          description: "The `seq` of the event that appended the signal.",
        },
      },
    },
    taskId: {
      description:
        "Kind-prefixed task ID, also a valid session-log ID (at most 128 characters).",
      type: "string",
      pattern: "^task-[A-Za-z0-9][A-Za-z0-9_-]{0,122}$",
    },
    runId: {
      description:
        "Kind-prefixed run ID, also a valid session-log ID (at most 128 characters).",
      type: "string",
      pattern: "^run-[A-Za-z0-9][A-Za-z0-9_-]{0,123}$",
    },
    artifactId: {
      description:
        "Kind-prefixed artifact ID, also a valid session-log ID (at most 128 characters).",
      type: "string",
      pattern: "^artifact-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$",
    },
    ruleId: {
      description:
        "Kind-prefixed rule ID, also a valid session-log ID (at most 128 characters).",
      type: "string",
      pattern: "^rule-[A-Za-z0-9][A-Za-z0-9_-]{0,122}$",
    },
    skillId: {
      description:
        "Kind-prefixed skill ID, also a valid session-log ID (at most 128 characters).",
      type: "string",
      pattern: "^skill-[A-Za-z0-9][A-Za-z0-9_-]{0,121}$",
    },
    decisionId: {
      description:
        "Kind-prefixed decision ID, also a valid session-log ID (at most 128 characters).",
      type: "string",
      pattern: "^decision-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$",
    },
    envelopeId: {
      description:
        "A session-log ID that is not an object kind, such as a graph or node ID.",
      $comment: "Copy of event.schema.json's `id`.",
      type: "string",
      pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$",
    },
    at: {
      description: "The `at` of the event that created the object.",
      $comment: "Copy of event.schema.json's `at`.",
      type: "string",
      pattern:
        "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$",
    },
    seq: {
      description:
        "The `seq` of the event that created the object, so a rebuilt row is bound to its event.",
      type: "integer",
      minimum: 0,
      maximum: 9007199254740991,
    },
    oid: {
      description: "A full lowercase hex git object ID (SHA-1 or SHA-256).",
      type: "string",
      pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$",
    },
    sha256: {
      description: "Lowercase hex SHA-256.",
      type: "string",
      pattern: "^[0-9a-f]{64}$",
    },
    repoId: {
      description:
        "Absolute realpath of a repository's common git dir: at most 4096 code points without C0 or C1 controls, format characters, line or paragraph separators or lone surrogates.",
      type: "string",
      pattern:
        "^/[^\\u0000-\\u001f\\u007f-\\u009f\\p{Cf}\\p{Zl}\\p{Zp}\\p{Cs}]{0,4095}$",
    },
    text: {
      description:
        "Text of 1 to 8192 code points, not only spaces; tabs and line breaks are kept, but no other control character, bidi control or lone surrogate.",
      type: "string",
      pattern:
        "^[^\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,8192}$",
      not: { pattern: "^\\s*$" },
    },
    displayText: {
      description:
        "Escaped display text: 1 to 8192 code points without C0 or C1 controls, format characters, line or paragraph separators or lone surrogates.",
      type: "string",
      pattern:
        "^[^\\u0000-\\u001f\\u007f-\\u009f\\p{Cf}\\p{Zl}\\p{Zp}\\p{Cs}]{1,8192}$",
    },
    scopeEntry: {
      description:
        "A scope entry: an entry without a backslash, relative (no leading `/`) and without empty, `.` or `..` segments, as the rubric requires.",
      $comment: "Copy of intake-event.schema.json's `scopeEntry`.",
      type: "string",
      pattern:
        "^[^\\\\\\u0000-\\u001f\\u007f-\\u009f\\p{Cf}\\p{Zl}\\p{Zp}\\p{Cs}]{1,1024}$",
      not: { pattern: "(^|/)\\.{0,2}(/|$)" },
    },
    taskClass: {
      title: "TaskClass",
      description:
        "Task class, in rank order: chore < bounded < architectural.",
      $comment: "Copy of intake-event.schema.json's `class`.",
      enum: ["chore", "bounded", "architectural"],
    },
    reviewTrigger: {
      description:
        "What makes the assumption due for review: a model change, an engine change or a milestone end.",
      $comment: "Copy of rot-register.schema.json's `reviewTrigger` array.",
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: { enum: ["model", "engine", "milestone"] },
    },
    assumption: {
      description:
        "One line without leading or trailing spaces, at most 1024 characters.",
      $comment: "Copy of rot-register.schema.json's `assumption`.",
      type: "string",
      pattern: "^\\S(.{0,1022}\\S)?$",
    },
    terminal: {
      title: "RunTerminal",
      description: "Typed terminal state of a run, as in loop/terminal.ts.",
      oneOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["kind"],
          properties: { kind: { const: "completed" } },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["kind", "reason"],
          properties: {
            kind: { const: "incomplete" },
            reason: {
              enum: [
                "timeout",
                "max_iterations",
                "max_tool_calls",
                "no_progress",
                "cancelled",
              ],
            },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["kind", "error"],
          properties: {
            kind: { const: "failed" },
            error: { $ref: "#/$defs/displayText" },
          },
        },
      ],
    },
    decisionClass: {
      title: "DecisionClass",
      description:
        "An owned decision class (03 Owned decision classes, X3): architecture, scope or technology.",
      enum: ["architecture", "scope", "technology"],
    },
    signalId: {
      description:
        "The ID of a signal that raised a decision, such as a floor signal ID or the event ID of an `intake.classified` event.",
      $comment:
        "Copied as the items of intake-event.schema.json's `reclassified.signalIds`.",
      type: "string",
      pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$",
    },
    signalIds: {
      description:
        "The signals that raised the decision, unique (checked by the writer); empty for a plan's `decisions[]`.",
      type: "array",
      maxItems: 256,
      items: { $ref: "#/$defs/signalId" },
    },
    footprint: {
      description:
        "Footprint artifact IDs (04 Loop 1, Q47), unique (checked by the writer); empty until the harness records the footprint when the decision closes.",
      type: "array",
      maxItems: 1024,
      items: { $ref: "#/$defs/artifactId" },
    },
    outcomes: {
      description:
        "The automatic outcome signals in append order (Q46); empty until a later run's diff matches the footprint.",
      type: "array",
      maxItems: 1024,
      items: { $ref: "#/$defs/outcomeSignal" },
    },
    seed: {
      description: "A 128-bit seed as 32 lowercase hex characters.",
      type: "string",
      pattern: "^[0-9a-f]{32}$",
    },
    conceptSlug: {
      description:
        "A concept slug (X6): 1 to 64 lowercase letters, digits and hyphens, not starting with a hyphen.",
      type: "string",
      pattern: "^[a-z0-9][a-z0-9-]{0,63}$",
    },
    rubricVersion: {
      description:
        "The version of the rubric that routed the call, such as `intake-rubric-1` or `materiality-rubric-1`.",
      $comment:
        "The intake branch is intake-event.schema.json's `rubricVersion`.",
      type: "string",
      pattern: "^(?:intake|materiality)-rubric-[1-9][0-9]{0,5}$",
    },
    question: {
      description:
        "One line of 1 to 160 code points, not only spaces, without a control character, line break, bidi control or lone surrogate.",
      type: "string",
      pattern:
        "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,160}$",
      not: { pattern: "^\\s*$" },
    },
    optionLabel: {
      description:
        "One line of 1 to 80 code points, not only spaces, without a control character, line break, bidi control or lone surrogate.",
      type: "string",
      pattern:
        "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,80}$",
      not: { pattern: "^\\s*$" },
    },
    line: {
      description:
        "One line of 1 to 200 code points, not only spaces, without a control character, line break, bidi control or lone surrogate.",
      type: "string",
      pattern:
        "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,200}$",
      not: { pattern: "^\\s*$" },
    },
  },
};
const schema32 = {
  title: "TaskRecord",
  description:
    "Declared work on one repository, written by the harness at run start; only `status` changes after creation.",
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "kind",
    "ring",
    "createdAt",
    "createdSeq",
    "repoId",
    "text",
    "scope",
    "status",
  ],
  properties: {
    id: { $ref: "#/$defs/taskId" },
    kind: { const: "task" },
    ring: {
      description:
        "The ring of the store that owns the object (05 Rings): the ledger is Ring 0.",
      const: 0,
    },
    createdAt: { $ref: "#/$defs/at" },
    createdSeq: { $ref: "#/$defs/seq" },
    repoId: {
      $ref: "#/$defs/repoId",
      description:
        "The repository the task is for: the realpath of its common git dir, as in `config.accepted.repo`.",
    },
    text: {
      $ref: "#/$defs/text",
      description:
        "The task text given to the engine (the task file's `title`), not blank, at most 8192 code points.",
    },
    scope: {
      description:
        "The declared scope, sorted and unique (checked by the writer); empty when none was declared (then the class is architectural, OQ-B10-2).",
      type: "array",
      maxItems: 256,
      items: { $ref: "#/$defs/scopeEntry" },
    },
    status: {
      title: "TaskStatus",
      description:
        "`open` at creation; `done` only from the evaluator's verdict (B15, AC7), never from a run terminal or an engine claim.",
      enum: ["open", "done"],
    },
  },
};
const schema33 = {
  description:
    "Kind-prefixed task ID, also a valid session-log ID (at most 128 characters).",
  type: "string",
  pattern: "^task-[A-Za-z0-9][A-Za-z0-9_-]{0,122}$",
};
const schema34 = {
  description: "The `at` of the event that created the object.",
  $comment: "Copy of event.schema.json's `at`.",
  type: "string",
  pattern:
    "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$",
};
const schema35 = {
  description:
    "The `seq` of the event that created the object, so a rebuilt row is bound to its event.",
  type: "integer",
  minimum: 0,
  maximum: 9007199254740991,
};
const schema36 = {
  description:
    "Absolute realpath of a repository's common git dir: at most 4096 code points without C0 or C1 controls, format characters, line or paragraph separators or lone surrogates.",
  type: "string",
  pattern:
    "^/[^\\u0000-\\u001f\\u007f-\\u009f\\p{Cf}\\p{Zl}\\p{Zp}\\p{Cs}]{0,4095}$",
};
const schema37 = {
  description:
    "Text of 1 to 8192 code points, not only spaces; tabs and line breaks are kept, but no other control character, bidi control or lone surrogate.",
  type: "string",
  pattern:
    "^[^\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,8192}$",
  not: { pattern: "^\\s*$" },
};
const schema38 = {
  description:
    "A scope entry: an entry without a backslash, relative (no leading `/`) and without empty, `.` or `..` segments, as the rubric requires.",
  $comment: "Copy of intake-event.schema.json's `scopeEntry`.",
  type: "string",
  pattern:
    "^[^\\\\\\u0000-\\u001f\\u007f-\\u009f\\p{Cf}\\p{Zl}\\p{Zp}\\p{Cs}]{1,1024}$",
  not: { pattern: "(^|/)\\.{0,2}(/|$)" },
};
const func1 = Object.prototype.hasOwnProperty;
const pattern4 = new RegExp("^task-[A-Za-z0-9][A-Za-z0-9_-]{0,122}$", "u");
const pattern5 = new RegExp(
  "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$",
  "u",
);
const pattern6 = new RegExp(
  "^/[^\\u0000-\\u001f\\u007f-\\u009f\\p{Cf}\\p{Zl}\\p{Zp}\\p{Cs}]{0,4095}$",
  "u",
);
const pattern7 = new RegExp("^\\s*$", "u");
const pattern8 = new RegExp(
  "^[^\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,8192}$",
  "u",
);
const pattern9 = new RegExp("(^|/)\\.{0,2}(/|$)", "u");
const pattern10 = new RegExp(
  "^[^\\\\\\u0000-\\u001f\\u007f-\\u009f\\p{Cf}\\p{Zl}\\p{Zp}\\p{Cs}]{1,1024}$",
  "u",
);
function validate21(
  data,
  {
    instancePath = "",
    parentData,
    parentDataProperty,
    rootData = data,
    dynamicAnchors = {},
  } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate21.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.id === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "id" },
        message: "must have required property '" + "id" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.kind === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "kind" },
        message: "must have required property '" + "kind" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.ring === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "ring" },
        message: "must have required property '" + "ring" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.createdAt === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "createdAt" },
        message: "must have required property '" + "createdAt" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.createdSeq === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "createdSeq" },
        message: "must have required property '" + "createdSeq" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.repoId === undefined) {
      const err5 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "repoId" },
        message: "must have required property '" + "repoId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.text === undefined) {
      const err6 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "text" },
        message: "must have required property '" + "text" + "'",
      };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.scope === undefined) {
      const err7 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "scope" },
        message: "must have required property '" + "scope" + "'",
      };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.status === undefined) {
      const err8 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "status" },
        message: "must have required property '" + "status" + "'",
      };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func1.call(schema32.properties, key0)) {
        const err9 = {
          instancePath,
          schemaPath: "#/additionalProperties",
          keyword: "additionalProperties",
          params: { additionalProperty: key0 },
          message: "must NOT have additional properties",
        };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.id !== undefined) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (!pattern4.test(data0)) {
          const err10 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/$defs/taskId/pattern",
            keyword: "pattern",
            params: { pattern: "^task-[A-Za-z0-9][A-Za-z0-9_-]{0,122}$" },
            message:
              'must match pattern "' +
              "^task-[A-Za-z0-9][A-Za-z0-9_-]{0,122}$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
      } else {
        const err11 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/$defs/taskId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    if (data.kind !== undefined) {
      if ("task" !== data.kind) {
        const err12 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "task" },
          message: "must be equal to constant",
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.ring !== undefined) {
      if (0 !== data.ring) {
        const err13 = {
          instancePath: instancePath + "/ring",
          schemaPath: "#/properties/ring/const",
          keyword: "const",
          params: { allowedValue: 0 },
          message: "must be equal to constant",
        };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
    if (data.createdAt !== undefined) {
      let data3 = data.createdAt;
      if (typeof data3 === "string") {
        if (!pattern5.test(data3)) {
          const err14 = {
            instancePath: instancePath + "/createdAt",
            schemaPath: "#/$defs/at/pattern",
            keyword: "pattern",
            params: {
              pattern:
                "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$",
            },
            message:
              'must match pattern "' +
              "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
      } else {
        const err15 = {
          instancePath: instancePath + "/createdAt",
          schemaPath: "#/$defs/at/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    if (data.createdSeq !== undefined) {
      let data4 = data.createdSeq;
      if (!(
        typeof data4 == "number" &&
        !(data4 % 1) &&
        !isNaN(data4) &&
        isFinite(data4)
      )) {
        const err16 = {
          instancePath: instancePath + "/createdSeq",
          schemaPath: "#/$defs/seq/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
      if (typeof data4 == "number" && isFinite(data4)) {
        if (data4 > 9007199254740991 || isNaN(data4)) {
          const err17 = {
            instancePath: instancePath + "/createdSeq",
            schemaPath: "#/$defs/seq/maximum",
            keyword: "maximum",
            params: { comparison: "<=", limit: 9007199254740991 },
            message: "must be <= 9007199254740991",
          };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        }
        if (data4 < 0 || isNaN(data4)) {
          const err18 = {
            instancePath: instancePath + "/createdSeq",
            schemaPath: "#/$defs/seq/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
      }
    }
    if (data.repoId !== undefined) {
      let data5 = data.repoId;
      if (typeof data5 === "string") {
        if (!pattern6.test(data5)) {
          const err19 = {
            instancePath: instancePath + "/repoId",
            schemaPath: "#/$defs/repoId/pattern",
            keyword: "pattern",
            params: {
              pattern:
                "^/[^\\u0000-\\u001f\\u007f-\\u009f\\p{Cf}\\p{Zl}\\p{Zp}\\p{Cs}]{0,4095}$",
            },
            message:
              'must match pattern "' +
              "^/[^\\u0000-\\u001f\\u007f-\\u009f\\p{Cf}\\p{Zl}\\p{Zp}\\p{Cs}]{0,4095}$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
      } else {
        const err20 = {
          instancePath: instancePath + "/repoId",
          schemaPath: "#/$defs/repoId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
    }
    if (data.text !== undefined) {
      let data6 = data.text;
      const _errs20 = errors;
      const _errs21 = errors;
      if (typeof data6 === "string") {
        if (!pattern7.test(data6)) {
          const err21 = {};
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
      }
      var valid6 = _errs21 === errors;
      if (valid6) {
        const err22 = {
          instancePath: instancePath + "/text",
          schemaPath: "#/$defs/text/not",
          keyword: "not",
          params: {},
          message: "must NOT be valid",
        };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      } else {
        errors = _errs20;
        if (vErrors !== null) {
          if (_errs20) {
            vErrors.length = _errs20;
          } else {
            vErrors = null;
          }
        }
      }
      if (typeof data6 === "string") {
        if (!pattern8.test(data6)) {
          const err23 = {
            instancePath: instancePath + "/text",
            schemaPath: "#/$defs/text/pattern",
            keyword: "pattern",
            params: {
              pattern:
                "^[^\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,8192}$",
            },
            message:
              'must match pattern "' +
              "^[^\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,8192}$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
      } else {
        const err24 = {
          instancePath: instancePath + "/text",
          schemaPath: "#/$defs/text/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
        }
        errors++;
      }
    }
    if (data.scope !== undefined) {
      let data7 = data.scope;
      if (Array.isArray(data7)) {
        if (data7.length > 256) {
          const err25 = {
            instancePath: instancePath + "/scope",
            schemaPath: "#/properties/scope/maxItems",
            keyword: "maxItems",
            params: { limit: 256 },
            message: "must NOT have more than 256 items",
          };
          if (vErrors === null) {
            vErrors = [err25];
          } else {
            vErrors.push(err25);
          }
          errors++;
        }
        const len0 = data7.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data8 = data7[i0];
          const _errs28 = errors;
          const _errs29 = errors;
          if (typeof data8 === "string") {
            if (!pattern9.test(data8)) {
              const err26 = {};
              if (vErrors === null) {
                vErrors = [err26];
              } else {
                vErrors.push(err26);
              }
              errors++;
            }
          }
          var valid10 = _errs29 === errors;
          if (valid10) {
            const err27 = {
              instancePath: instancePath + "/scope/" + i0,
              schemaPath: "#/$defs/scopeEntry/not",
              keyword: "not",
              params: {},
              message: "must NOT be valid",
            };
            if (vErrors === null) {
              vErrors = [err27];
            } else {
              vErrors.push(err27);
            }
            errors++;
          } else {
            errors = _errs28;
            if (vErrors !== null) {
              if (_errs28) {
                vErrors.length = _errs28;
              } else {
                vErrors = null;
              }
            }
          }
          if (typeof data8 === "string") {
            if (!pattern10.test(data8)) {
              const err28 = {
                instancePath: instancePath + "/scope/" + i0,
                schemaPath: "#/$defs/scopeEntry/pattern",
                keyword: "pattern",
                params: {
                  pattern:
                    "^[^\\\\\\u0000-\\u001f\\u007f-\\u009f\\p{Cf}\\p{Zl}\\p{Zp}\\p{Cs}]{1,1024}$",
                },
                message:
                  'must match pattern "' +
                  "^[^\\\\\\u0000-\\u001f\\u007f-\\u009f\\p{Cf}\\p{Zl}\\p{Zp}\\p{Cs}]{1,1024}$" +
                  '"',
              };
              if (vErrors === null) {
                vErrors = [err28];
              } else {
                vErrors.push(err28);
              }
              errors++;
            }
          } else {
            const err29 = {
              instancePath: instancePath + "/scope/" + i0,
              schemaPath: "#/$defs/scopeEntry/type",
              keyword: "type",
              params: { type: "string" },
              message: "must be string",
            };
            if (vErrors === null) {
              vErrors = [err29];
            } else {
              vErrors.push(err29);
            }
            errors++;
          }
        }
      } else {
        const err30 = {
          instancePath: instancePath + "/scope",
          schemaPath: "#/properties/scope/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err30];
        } else {
          vErrors.push(err30);
        }
        errors++;
      }
    }
    if (data.status !== undefined) {
      let data9 = data.status;
      if (!(data9 === "open" || data9 === "done")) {
        const err31 = {
          instancePath: instancePath + "/status",
          schemaPath: "#/properties/status/enum",
          keyword: "enum",
          params: { allowedValues: schema32.properties.status.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err31];
        } else {
          vErrors.push(err31);
        }
        errors++;
      }
    }
  } else {
    const err32 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err32];
    } else {
      vErrors.push(err32);
    }
    errors++;
  }
  validate21.errors = vErrors;
  return errors === 0;
}
validate21.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
const schema39 = {
  title: "RunRecord",
  description:
    "One execution of a Task at a base commit with the intake class it started with: the rubric class after the worktree's Ring 0 link targets, equal to `intake.classified.class` (OD-B54-2; an owner override stays the `intake.overridden` event and a later upward reclassification an `intake.reclassified` event), written by the harness before `run.started`; only `terminal` changes, once, at `run.terminated`.",
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "kind",
    "ring",
    "createdAt",
    "createdSeq",
    "taskId",
    "graphId",
    "nodeId",
    "engine",
    "baseCommit",
    "class",
    "terminal",
  ],
  properties: {
    id: {
      $ref: "#/$defs/runId",
      description:
        "Kind-prefixed ID, also the `runId` of every event of this run (run→events link).",
    },
    kind: { const: "run" },
    ring: {
      description:
        "The ring of the store that owns the object (05 Rings): the log is Ring 0.",
      const: 0,
    },
    createdAt: { $ref: "#/$defs/at" },
    createdSeq: { $ref: "#/$defs/seq" },
    taskId: {
      $ref: "#/$defs/taskId",
      description: "The Task this run executes (typed link task→run).",
    },
    graphId: {
      $ref: "#/$defs/envelopeId",
      description: "The graph ID on every event of this run.",
    },
    nodeId: {
      $ref: "#/$defs/envelopeId",
      description: "The run's root node ID (M1: the single agent node).",
    },
    engine: {
      description:
        "The engine kind; only the scripted engine exists until B11 adds the native and B13 the hosted engine with their fixtures (07 rule 1).",
      const: "scripted",
    },
    baseCommit: {
      $ref: "#/$defs/oid",
      description:
        "The commit the worktree was created from (`run.started.baseCommit`).",
    },
    class: { $ref: "#/$defs/taskClass" },
    terminal: {
      description:
        "`null` while the run is open, then the typed terminal state of `run.terminated`, where `completed` means the engine stopped, never that the task is done.",
      oneOf: [{ type: "null" }, { $ref: "#/$defs/terminal" }],
    },
  },
};
const schema40 = {
  description:
    "Kind-prefixed run ID, also a valid session-log ID (at most 128 characters).",
  type: "string",
  pattern: "^run-[A-Za-z0-9][A-Za-z0-9_-]{0,123}$",
};
const schema44 = {
  description:
    "A session-log ID that is not an object kind, such as a graph or node ID.",
  $comment: "Copy of event.schema.json's `id`.",
  type: "string",
  pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$",
};
const schema46 = {
  description: "A full lowercase hex git object ID (SHA-1 or SHA-256).",
  type: "string",
  pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$",
};
const schema47 = {
  title: "TaskClass",
  description: "Task class, in rank order: chore < bounded < architectural.",
  $comment: "Copy of intake-event.schema.json's `class`.",
  enum: ["chore", "bounded", "architectural"],
};
const pattern11 = new RegExp("^run-[A-Za-z0-9][A-Za-z0-9_-]{0,123}$", "u");
const pattern14 = new RegExp("^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$", "u");
const pattern16 = new RegExp("^(?:[0-9a-f]{40}|[0-9a-f]{64})$", "u");
const schema48 = {
  title: "RunTerminal",
  description: "Typed terminal state of a run, as in loop/terminal.ts.",
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["kind"],
      properties: { kind: { const: "completed" } },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "reason"],
      properties: {
        kind: { const: "incomplete" },
        reason: {
          enum: [
            "timeout",
            "max_iterations",
            "max_tool_calls",
            "no_progress",
            "cancelled",
          ],
        },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "error"],
      properties: {
        kind: { const: "failed" },
        error: { $ref: "#/$defs/displayText" },
      },
    },
  ],
};
const schema49 = {
  description:
    "Escaped display text: 1 to 8192 code points without C0 or C1 controls, format characters, line or paragraph separators or lone surrogates.",
  type: "string",
  pattern:
    "^[^\\u0000-\\u001f\\u007f-\\u009f\\p{Cf}\\p{Zl}\\p{Zp}\\p{Cs}]{1,8192}$",
};
const pattern17 = new RegExp(
  "^[^\\u0000-\\u001f\\u007f-\\u009f\\p{Cf}\\p{Zl}\\p{Zp}\\p{Cs}]{1,8192}$",
  "u",
);
function validate24(
  data,
  {
    instancePath = "",
    parentData,
    parentDataProperty,
    rootData = data,
    dynamicAnchors = {},
  } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate24.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.kind === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/oneOf/0/required",
        keyword: "required",
        params: { missingProperty: "kind" },
        message: "must have required property '" + "kind" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "kind")) {
        const err1 = {
          instancePath,
          schemaPath: "#/oneOf/0/additionalProperties",
          keyword: "additionalProperties",
          params: { additionalProperty: key0 },
          message: "must NOT have additional properties",
        };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    }
    if (data.kind !== undefined) {
      if ("completed" !== data.kind) {
        const err2 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/0/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "completed" },
          message: "must be equal to constant",
        };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
  } else {
    const err3 = {
      instancePath,
      schemaPath: "#/oneOf/0/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err3];
    } else {
      vErrors.push(err3);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
    var props0 = true;
  }
  const _errs5 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.kind === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/oneOf/1/required",
        keyword: "required",
        params: { missingProperty: "kind" },
        message: "must have required property '" + "kind" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.reason === undefined) {
      const err5 = {
        instancePath,
        schemaPath: "#/oneOf/1/required",
        keyword: "required",
        params: { missingProperty: "reason" },
        message: "must have required property '" + "reason" + "'",
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    for (const key1 in data) {
      if (!(key1 === "kind" || key1 === "reason")) {
        const err6 = {
          instancePath,
          schemaPath: "#/oneOf/1/additionalProperties",
          keyword: "additionalProperties",
          params: { additionalProperty: key1 },
          message: "must NOT have additional properties",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    if (data.kind !== undefined) {
      if ("incomplete" !== data.kind) {
        const err7 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/1/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "incomplete" },
          message: "must be equal to constant",
        };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.reason !== undefined) {
      let data2 = data.reason;
      if (!(
        data2 === "timeout" ||
        data2 === "max_iterations" ||
        data2 === "max_tool_calls" ||
        data2 === "no_progress" ||
        data2 === "cancelled"
      )) {
        const err8 = {
          instancePath: instancePath + "/reason",
          schemaPath: "#/oneOf/1/properties/reason/enum",
          keyword: "enum",
          params: { allowedValues: schema48.oneOf[1].properties.reason.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
  } else {
    const err9 = {
      instancePath,
      schemaPath: "#/oneOf/1/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err9];
    } else {
      vErrors.push(err9);
    }
    errors++;
  }
  var _valid0 = _errs5 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
      if (props0 !== true) {
        props0 = true;
      }
    }
    const _errs10 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      if (data.kind === undefined) {
        const err10 = {
          instancePath,
          schemaPath: "#/oneOf/2/required",
          keyword: "required",
          params: { missingProperty: "kind" },
          message: "must have required property '" + "kind" + "'",
        };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
      if (data.error === undefined) {
        const err11 = {
          instancePath,
          schemaPath: "#/oneOf/2/required",
          keyword: "required",
          params: { missingProperty: "error" },
          message: "must have required property '" + "error" + "'",
        };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
      for (const key2 in data) {
        if (!(key2 === "kind" || key2 === "error")) {
          const err12 = {
            instancePath,
            schemaPath: "#/oneOf/2/additionalProperties",
            keyword: "additionalProperties",
            params: { additionalProperty: key2 },
            message: "must NOT have additional properties",
          };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
      }
      if (data.kind !== undefined) {
        if ("failed" !== data.kind) {
          const err13 = {
            instancePath: instancePath + "/kind",
            schemaPath: "#/oneOf/2/properties/kind/const",
            keyword: "const",
            params: { allowedValue: "failed" },
            message: "must be equal to constant",
          };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
      }
      if (data.error !== undefined) {
        let data4 = data.error;
        if (typeof data4 === "string") {
          if (!pattern17.test(data4)) {
            const err14 = {
              instancePath: instancePath + "/error",
              schemaPath: "#/$defs/displayText/pattern",
              keyword: "pattern",
              params: {
                pattern:
                  "^[^\\u0000-\\u001f\\u007f-\\u009f\\p{Cf}\\p{Zl}\\p{Zp}\\p{Cs}]{1,8192}$",
              },
              message:
                'must match pattern "' +
                "^[^\\u0000-\\u001f\\u007f-\\u009f\\p{Cf}\\p{Zl}\\p{Zp}\\p{Cs}]{1,8192}$" +
                '"',
            };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        } else {
          const err15 = {
            instancePath: instancePath + "/error",
            schemaPath: "#/$defs/displayText/type",
            keyword: "type",
            params: { type: "string" },
            message: "must be string",
          };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
      }
    } else {
      const err16 = {
        instancePath,
        schemaPath: "#/oneOf/2/type",
        keyword: "type",
        params: { type: "object" },
        message: "must be object",
      };
      if (vErrors === null) {
        vErrors = [err16];
      } else {
        vErrors.push(err16);
      }
      errors++;
    }
    var _valid0 = _errs10 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
        if (props0 !== true) {
          props0 = true;
        }
      }
    }
  }
  if (!valid0) {
    const err17 = {
      instancePath,
      schemaPath: "#/oneOf",
      keyword: "oneOf",
      params: { passingSchemas: passing0 },
      message: "must match exactly one schema in oneOf",
    };
    if (vErrors === null) {
      vErrors = [err17];
    } else {
      vErrors.push(err17);
    }
    errors++;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate24.errors = vErrors;
  evaluated0.props = props0;
  return errors === 0;
}
validate24.evaluated = { dynamicProps: true, dynamicItems: false };
function validate23(
  data,
  {
    instancePath = "",
    parentData,
    parentDataProperty,
    rootData = data,
    dynamicAnchors = {},
  } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate23.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.id === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "id" },
        message: "must have required property '" + "id" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.kind === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "kind" },
        message: "must have required property '" + "kind" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.ring === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "ring" },
        message: "must have required property '" + "ring" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.createdAt === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "createdAt" },
        message: "must have required property '" + "createdAt" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.createdSeq === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "createdSeq" },
        message: "must have required property '" + "createdSeq" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.taskId === undefined) {
      const err5 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "taskId" },
        message: "must have required property '" + "taskId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.graphId === undefined) {
      const err6 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "graphId" },
        message: "must have required property '" + "graphId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.nodeId === undefined) {
      const err7 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "nodeId" },
        message: "must have required property '" + "nodeId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.engine === undefined) {
      const err8 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "engine" },
        message: "must have required property '" + "engine" + "'",
      };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    if (data.baseCommit === undefined) {
      const err9 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "baseCommit" },
        message: "must have required property '" + "baseCommit" + "'",
      };
      if (vErrors === null) {
        vErrors = [err9];
      } else {
        vErrors.push(err9);
      }
      errors++;
    }
    if (data.class === undefined) {
      const err10 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "class" },
        message: "must have required property '" + "class" + "'",
      };
      if (vErrors === null) {
        vErrors = [err10];
      } else {
        vErrors.push(err10);
      }
      errors++;
    }
    if (data.terminal === undefined) {
      const err11 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "terminal" },
        message: "must have required property '" + "terminal" + "'",
      };
      if (vErrors === null) {
        vErrors = [err11];
      } else {
        vErrors.push(err11);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func1.call(schema39.properties, key0)) {
        const err12 = {
          instancePath,
          schemaPath: "#/additionalProperties",
          keyword: "additionalProperties",
          params: { additionalProperty: key0 },
          message: "must NOT have additional properties",
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.id !== undefined) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (!pattern11.test(data0)) {
          const err13 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/$defs/runId/pattern",
            keyword: "pattern",
            params: { pattern: "^run-[A-Za-z0-9][A-Za-z0-9_-]{0,123}$" },
            message:
              'must match pattern "' +
              "^run-[A-Za-z0-9][A-Za-z0-9_-]{0,123}$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
      } else {
        const err14 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/$defs/runId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
    }
    if (data.kind !== undefined) {
      if ("run" !== data.kind) {
        const err15 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "run" },
          message: "must be equal to constant",
        };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    if (data.ring !== undefined) {
      if (0 !== data.ring) {
        const err16 = {
          instancePath: instancePath + "/ring",
          schemaPath: "#/properties/ring/const",
          keyword: "const",
          params: { allowedValue: 0 },
          message: "must be equal to constant",
        };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
    }
    if (data.createdAt !== undefined) {
      let data3 = data.createdAt;
      if (typeof data3 === "string") {
        if (!pattern5.test(data3)) {
          const err17 = {
            instancePath: instancePath + "/createdAt",
            schemaPath: "#/$defs/at/pattern",
            keyword: "pattern",
            params: {
              pattern:
                "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$",
            },
            message:
              'must match pattern "' +
              "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        }
      } else {
        const err18 = {
          instancePath: instancePath + "/createdAt",
          schemaPath: "#/$defs/at/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      }
    }
    if (data.createdSeq !== undefined) {
      let data4 = data.createdSeq;
      if (!(
        typeof data4 == "number" &&
        !(data4 % 1) &&
        !isNaN(data4) &&
        isFinite(data4)
      )) {
        const err19 = {
          instancePath: instancePath + "/createdSeq",
          schemaPath: "#/$defs/seq/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
      if (typeof data4 == "number" && isFinite(data4)) {
        if (data4 > 9007199254740991 || isNaN(data4)) {
          const err20 = {
            instancePath: instancePath + "/createdSeq",
            schemaPath: "#/$defs/seq/maximum",
            keyword: "maximum",
            params: { comparison: "<=", limit: 9007199254740991 },
            message: "must be <= 9007199254740991",
          };
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        }
        if (data4 < 0 || isNaN(data4)) {
          const err21 = {
            instancePath: instancePath + "/createdSeq",
            schemaPath: "#/$defs/seq/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
      }
    }
    if (data.taskId !== undefined) {
      let data5 = data.taskId;
      if (typeof data5 === "string") {
        if (!pattern4.test(data5)) {
          const err22 = {
            instancePath: instancePath + "/taskId",
            schemaPath: "#/$defs/taskId/pattern",
            keyword: "pattern",
            params: { pattern: "^task-[A-Za-z0-9][A-Za-z0-9_-]{0,122}$" },
            message:
              'must match pattern "' +
              "^task-[A-Za-z0-9][A-Za-z0-9_-]{0,122}$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err22];
          } else {
            vErrors.push(err22);
          }
          errors++;
        }
      } else {
        const err23 = {
          instancePath: instancePath + "/taskId",
          schemaPath: "#/$defs/taskId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err23];
        } else {
          vErrors.push(err23);
        }
        errors++;
      }
    }
    if (data.graphId !== undefined) {
      let data6 = data.graphId;
      if (typeof data6 === "string") {
        if (!pattern14.test(data6)) {
          const err24 = {
            instancePath: instancePath + "/graphId",
            schemaPath: "#/$defs/envelopeId/pattern",
            keyword: "pattern",
            params: { pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$" },
            message:
              'must match pattern "' +
              "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
      } else {
        const err25 = {
          instancePath: instancePath + "/graphId",
          schemaPath: "#/$defs/envelopeId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err25];
        } else {
          vErrors.push(err25);
        }
        errors++;
      }
    }
    if (data.nodeId !== undefined) {
      let data7 = data.nodeId;
      if (typeof data7 === "string") {
        if (!pattern14.test(data7)) {
          const err26 = {
            instancePath: instancePath + "/nodeId",
            schemaPath: "#/$defs/envelopeId/pattern",
            keyword: "pattern",
            params: { pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$" },
            message:
              'must match pattern "' +
              "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err26];
          } else {
            vErrors.push(err26);
          }
          errors++;
        }
      } else {
        const err27 = {
          instancePath: instancePath + "/nodeId",
          schemaPath: "#/$defs/envelopeId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err27];
        } else {
          vErrors.push(err27);
        }
        errors++;
      }
    }
    if (data.engine !== undefined) {
      if ("scripted" !== data.engine) {
        const err28 = {
          instancePath: instancePath + "/engine",
          schemaPath: "#/properties/engine/const",
          keyword: "const",
          params: { allowedValue: "scripted" },
          message: "must be equal to constant",
        };
        if (vErrors === null) {
          vErrors = [err28];
        } else {
          vErrors.push(err28);
        }
        errors++;
      }
    }
    if (data.baseCommit !== undefined) {
      let data9 = data.baseCommit;
      if (typeof data9 === "string") {
        if (!pattern16.test(data9)) {
          const err29 = {
            instancePath: instancePath + "/baseCommit",
            schemaPath: "#/$defs/oid/pattern",
            keyword: "pattern",
            params: { pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$" },
            message:
              'must match pattern "' + "^(?:[0-9a-f]{40}|[0-9a-f]{64})$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err29];
          } else {
            vErrors.push(err29);
          }
          errors++;
        }
      } else {
        const err30 = {
          instancePath: instancePath + "/baseCommit",
          schemaPath: "#/$defs/oid/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err30];
        } else {
          vErrors.push(err30);
        }
        errors++;
      }
    }
    if (data.class !== undefined) {
      let data10 = data.class;
      if (!(
        data10 === "chore" ||
        data10 === "bounded" ||
        data10 === "architectural"
      )) {
        const err31 = {
          instancePath: instancePath + "/class",
          schemaPath: "#/$defs/taskClass/enum",
          keyword: "enum",
          params: { allowedValues: schema47.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err31];
        } else {
          vErrors.push(err31);
        }
        errors++;
      }
    }
    if (data.terminal !== undefined) {
      let data11 = data.terminal;
      const _errs33 = errors;
      let valid9 = false;
      let passing0 = null;
      const _errs34 = errors;
      if (data11 !== null) {
        const err32 = {
          instancePath: instancePath + "/terminal",
          schemaPath: "#/properties/terminal/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err32];
        } else {
          vErrors.push(err32);
        }
        errors++;
      }
      var _valid0 = _errs34 === errors;
      if (_valid0) {
        valid9 = true;
        passing0 = 0;
      }
      const _errs36 = errors;
      if (
        !validate24(data11, {
          instancePath: instancePath + "/terminal",
          parentData: data,
          parentDataProperty: "terminal",
          rootData,
          dynamicAnchors,
        })
      ) {
        vErrors =
          vErrors === null
            ? validate24.errors
            : vErrors.concat(validate24.errors);
        errors = vErrors.length;
      }
      var _valid0 = _errs36 === errors;
      if (_valid0 && valid9) {
        valid9 = false;
        passing0 = [passing0, 1];
      } else {
        if (_valid0) {
          valid9 = true;
          passing0 = 1;
        }
      }
      if (!valid9) {
        const err33 = {
          instancePath: instancePath + "/terminal",
          schemaPath: "#/properties/terminal/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing0 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err33];
        } else {
          vErrors.push(err33);
        }
        errors++;
      } else {
        errors = _errs33;
        if (vErrors !== null) {
          if (_errs33) {
            vErrors.length = _errs33;
          } else {
            vErrors = null;
          }
        }
      }
    }
  } else {
    const err34 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err34];
    } else {
      vErrors.push(err34);
    }
    errors++;
  }
  validate23.errors = vErrors;
  return errors === 0;
}
validate23.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
const schema50 = {
  title: "ArtifactRecord",
  description:
    "A stored product of the harness: a diff, a report, a concept expansion (X6) or a footprint entry (Q47); `repoId` is required except for a concept expansion.",
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "kind",
    "ring",
    "createdAt",
    "createdSeq",
    "type",
    "ref",
    "sha256",
  ],
  properties: {
    id: { $ref: "#/$defs/artifactId" },
    kind: { const: "artifact" },
    ring: {
      description:
        "The ring of the store that owns the object (05 Rings): the log and ledger are Ring 0.",
      const: 0,
    },
    createdAt: { $ref: "#/$defs/at" },
    createdSeq: { $ref: "#/$defs/seq" },
    type: {
      title: "ArtifactType",
      description:
        "What the artifact is; the footprint types are the Q47 representation: files, exported symbols, dependency names and module IDs.",
      enum: [
        "diff",
        "report",
        "conceptExpansion",
        "footprint.file",
        "footprint.symbol",
        "footprint.dependency",
        "footprint.module",
      ],
    },
    repoId: {
      $ref: "#/$defs/repoId",
      description:
        "The repository the artifact belongs to; absent only for a concept expansion.",
    },
    ref: {
      $ref: "#/$defs/displayText",
      description:
        "Type-specific escaped locator (diff: candidate tree OID; report: path under the state dir; conceptExpansion: concept slug; footprint.*: repo-relative path, `<path>#<exported name>`, dependency name or module ID), whose grammar the first writer of each type fixes (A2, B15, C2, A1).",
    },
    sha256: {
      $ref: "#/$defs/sha256",
      description:
        "For `footprint.*` the content address, SHA-256 of the canonical JSON `[type, repoId, ref]` with ID `artifact-<sha256>` (checked on write, B5-3); otherwise the SHA-256 of the stored content.",
    },
    runId: {
      $ref: "#/$defs/runId",
      description:
        "The run that produced it, when one did; footprints and expansions may be recorded outside a run (A1, A7, C2).",
    },
  },
  if: {
    properties: {
      type: {
        enum: [
          "diff",
          "report",
          "footprint.file",
          "footprint.symbol",
          "footprint.dependency",
          "footprint.module",
        ],
      },
    },
  },
  then: {
    properties: { repoId: { $ref: "#/$defs/repoId" } },
    required: ["repoId"],
  },
};
const schema52 = {
  description:
    "Kind-prefixed artifact ID, also a valid session-log ID (at most 128 characters).",
  type: "string",
  pattern: "^artifact-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$",
};
const schema57 = {
  description: "Lowercase hex SHA-256.",
  type: "string",
  pattern: "^[0-9a-f]{64}$",
};
const pattern19 = new RegExp("^artifact-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$", "u");
const pattern23 = new RegExp("^[0-9a-f]{64}$", "u");
function validate27(
  data,
  {
    instancePath = "",
    parentData,
    parentDataProperty,
    rootData = data,
    dynamicAnchors = {},
  } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate27.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  const _errs1 = errors;
  let valid0 = true;
  const _errs2 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.type !== undefined) {
      let data0 = data.type;
      if (!(
        data0 === "diff" ||
        data0 === "report" ||
        data0 === "footprint.file" ||
        data0 === "footprint.symbol" ||
        data0 === "footprint.dependency" ||
        data0 === "footprint.module"
      )) {
        const err0 = {};
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
    }
  }
  var _valid0 = _errs2 === errors;
  errors = _errs1;
  if (vErrors !== null) {
    if (_errs1) {
      vErrors.length = _errs1;
    } else {
      vErrors = null;
    }
  }
  if (_valid0) {
    const _errs4 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      if (data.repoId === undefined) {
        const err1 = {
          instancePath,
          schemaPath: "#/then/required",
          keyword: "required",
          params: { missingProperty: "repoId" },
          message: "must have required property '" + "repoId" + "'",
        };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      if (data.repoId !== undefined) {
        let data1 = data.repoId;
        if (typeof data1 === "string") {
          if (!pattern6.test(data1)) {
            const err2 = {
              instancePath: instancePath + "/repoId",
              schemaPath: "#/$defs/repoId/pattern",
              keyword: "pattern",
              params: {
                pattern:
                  "^/[^\\u0000-\\u001f\\u007f-\\u009f\\p{Cf}\\p{Zl}\\p{Zp}\\p{Cs}]{0,4095}$",
              },
              message:
                'must match pattern "' +
                "^/[^\\u0000-\\u001f\\u007f-\\u009f\\p{Cf}\\p{Zl}\\p{Zp}\\p{Cs}]{0,4095}$" +
                '"',
            };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        } else {
          const err3 = {
            instancePath: instancePath + "/repoId",
            schemaPath: "#/$defs/repoId/type",
            keyword: "type",
            params: { type: "string" },
            message: "must be string",
          };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      }
    }
    var _valid0 = _errs4 === errors;
    valid0 = _valid0;
    if (valid0) {
      var props0 = {};
      props0.repoId = true;
      props0.type = true;
    }
  }
  if (!valid0) {
    const err4 = {
      instancePath,
      schemaPath: "#/if",
      keyword: "if",
      params: { failingKeyword: "then" },
      message: 'must match "then" schema',
    };
    if (vErrors === null) {
      vErrors = [err4];
    } else {
      vErrors.push(err4);
    }
    errors++;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.id === undefined) {
      const err5 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "id" },
        message: "must have required property '" + "id" + "'",
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.kind === undefined) {
      const err6 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "kind" },
        message: "must have required property '" + "kind" + "'",
      };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.ring === undefined) {
      const err7 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "ring" },
        message: "must have required property '" + "ring" + "'",
      };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.createdAt === undefined) {
      const err8 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "createdAt" },
        message: "must have required property '" + "createdAt" + "'",
      };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    if (data.createdSeq === undefined) {
      const err9 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "createdSeq" },
        message: "must have required property '" + "createdSeq" + "'",
      };
      if (vErrors === null) {
        vErrors = [err9];
      } else {
        vErrors.push(err9);
      }
      errors++;
    }
    if (data.type === undefined) {
      const err10 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "type" },
        message: "must have required property '" + "type" + "'",
      };
      if (vErrors === null) {
        vErrors = [err10];
      } else {
        vErrors.push(err10);
      }
      errors++;
    }
    if (data.ref === undefined) {
      const err11 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "ref" },
        message: "must have required property '" + "ref" + "'",
      };
      if (vErrors === null) {
        vErrors = [err11];
      } else {
        vErrors.push(err11);
      }
      errors++;
    }
    if (data.sha256 === undefined) {
      const err12 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "sha256" },
        message: "must have required property '" + "sha256" + "'",
      };
      if (vErrors === null) {
        vErrors = [err12];
      } else {
        vErrors.push(err12);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func1.call(schema50.properties, key0)) {
        const err13 = {
          instancePath,
          schemaPath: "#/additionalProperties",
          keyword: "additionalProperties",
          params: { additionalProperty: key0 },
          message: "must NOT have additional properties",
        };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
    if (data.id !== undefined) {
      let data2 = data.id;
      if (typeof data2 === "string") {
        if (!pattern19.test(data2)) {
          const err14 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/$defs/artifactId/pattern",
            keyword: "pattern",
            params: { pattern: "^artifact-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$" },
            message:
              'must match pattern "' +
              "^artifact-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
      } else {
        const err15 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/$defs/artifactId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    if (data.kind !== undefined) {
      if ("artifact" !== data.kind) {
        const err16 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "artifact" },
          message: "must be equal to constant",
        };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
    }
    if (data.ring !== undefined) {
      if (0 !== data.ring) {
        const err17 = {
          instancePath: instancePath + "/ring",
          schemaPath: "#/properties/ring/const",
          keyword: "const",
          params: { allowedValue: 0 },
          message: "must be equal to constant",
        };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
    }
    if (data.createdAt !== undefined) {
      let data5 = data.createdAt;
      if (typeof data5 === "string") {
        if (!pattern5.test(data5)) {
          const err18 = {
            instancePath: instancePath + "/createdAt",
            schemaPath: "#/$defs/at/pattern",
            keyword: "pattern",
            params: {
              pattern:
                "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$",
            },
            message:
              'must match pattern "' +
              "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
      } else {
        const err19 = {
          instancePath: instancePath + "/createdAt",
          schemaPath: "#/$defs/at/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
    }
    if (data.createdSeq !== undefined) {
      let data6 = data.createdSeq;
      if (!(
        typeof data6 == "number" &&
        !(data6 % 1) &&
        !isNaN(data6) &&
        isFinite(data6)
      )) {
        const err20 = {
          instancePath: instancePath + "/createdSeq",
          schemaPath: "#/$defs/seq/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
      if (typeof data6 == "number" && isFinite(data6)) {
        if (data6 > 9007199254740991 || isNaN(data6)) {
          const err21 = {
            instancePath: instancePath + "/createdSeq",
            schemaPath: "#/$defs/seq/maximum",
            keyword: "maximum",
            params: { comparison: "<=", limit: 9007199254740991 },
            message: "must be <= 9007199254740991",
          };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
        if (data6 < 0 || isNaN(data6)) {
          const err22 = {
            instancePath: instancePath + "/createdSeq",
            schemaPath: "#/$defs/seq/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err22];
          } else {
            vErrors.push(err22);
          }
          errors++;
        }
      }
    }
    if (data.type !== undefined) {
      let data7 = data.type;
      if (!(
        data7 === "diff" ||
        data7 === "report" ||
        data7 === "conceptExpansion" ||
        data7 === "footprint.file" ||
        data7 === "footprint.symbol" ||
        data7 === "footprint.dependency" ||
        data7 === "footprint.module"
      )) {
        const err23 = {
          instancePath: instancePath + "/type",
          schemaPath: "#/properties/type/enum",
          keyword: "enum",
          params: { allowedValues: schema50.properties.type.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err23];
        } else {
          vErrors.push(err23);
        }
        errors++;
      }
    }
    if (data.repoId !== undefined) {
      let data8 = data.repoId;
      if (typeof data8 === "string") {
        if (!pattern6.test(data8)) {
          const err24 = {
            instancePath: instancePath + "/repoId",
            schemaPath: "#/$defs/repoId/pattern",
            keyword: "pattern",
            params: {
              pattern:
                "^/[^\\u0000-\\u001f\\u007f-\\u009f\\p{Cf}\\p{Zl}\\p{Zp}\\p{Cs}]{0,4095}$",
            },
            message:
              'must match pattern "' +
              "^/[^\\u0000-\\u001f\\u007f-\\u009f\\p{Cf}\\p{Zl}\\p{Zp}\\p{Cs}]{0,4095}$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
      } else {
        const err25 = {
          instancePath: instancePath + "/repoId",
          schemaPath: "#/$defs/repoId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err25];
        } else {
          vErrors.push(err25);
        }
        errors++;
      }
    }
    if (data.ref !== undefined) {
      let data9 = data.ref;
      if (typeof data9 === "string") {
        if (!pattern17.test(data9)) {
          const err26 = {
            instancePath: instancePath + "/ref",
            schemaPath: "#/$defs/displayText/pattern",
            keyword: "pattern",
            params: {
              pattern:
                "^[^\\u0000-\\u001f\\u007f-\\u009f\\p{Cf}\\p{Zl}\\p{Zp}\\p{Cs}]{1,8192}$",
            },
            message:
              'must match pattern "' +
              "^[^\\u0000-\\u001f\\u007f-\\u009f\\p{Cf}\\p{Zl}\\p{Zp}\\p{Cs}]{1,8192}$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err26];
          } else {
            vErrors.push(err26);
          }
          errors++;
        }
      } else {
        const err27 = {
          instancePath: instancePath + "/ref",
          schemaPath: "#/$defs/displayText/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err27];
        } else {
          vErrors.push(err27);
        }
        errors++;
      }
    }
    if (data.sha256 !== undefined) {
      let data10 = data.sha256;
      if (typeof data10 === "string") {
        if (!pattern23.test(data10)) {
          const err28 = {
            instancePath: instancePath + "/sha256",
            schemaPath: "#/$defs/sha256/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9a-f]{64}$" },
            message: 'must match pattern "' + "^[0-9a-f]{64}$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err28];
          } else {
            vErrors.push(err28);
          }
          errors++;
        }
      } else {
        const err29 = {
          instancePath: instancePath + "/sha256",
          schemaPath: "#/$defs/sha256/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err29];
        } else {
          vErrors.push(err29);
        }
        errors++;
      }
    }
    if (data.runId !== undefined) {
      let data11 = data.runId;
      if (typeof data11 === "string") {
        if (!pattern11.test(data11)) {
          const err30 = {
            instancePath: instancePath + "/runId",
            schemaPath: "#/$defs/runId/pattern",
            keyword: "pattern",
            params: { pattern: "^run-[A-Za-z0-9][A-Za-z0-9_-]{0,123}$" },
            message:
              'must match pattern "' +
              "^run-[A-Za-z0-9][A-Za-z0-9_-]{0,123}$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err30];
          } else {
            vErrors.push(err30);
          }
          errors++;
        }
      } else {
        const err31 = {
          instancePath: instancePath + "/runId",
          schemaPath: "#/$defs/runId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err31];
        } else {
          vErrors.push(err31);
        }
        errors++;
      }
    }
  } else {
    const err32 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err32];
    } else {
      vErrors.push(err32);
    }
    errors++;
  }
  validate27.errors = vErrors;
  return errors === 0;
}
validate27.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
const schema59 = {
  title: "RuleRecord",
  description:
    "An owner-approved rule in the rulebook (04 Bridge to the harness loop), written only through an owner action (Q6); no M1 writer.",
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "kind",
    "ring",
    "createdAt",
    "createdSeq",
    "text",
    "authority",
    "evidenceDecisionIds",
    "assumption",
    "reviewTrigger",
    "status",
  ],
  properties: {
    id: { $ref: "#/$defs/ruleId" },
    kind: { const: "rule" },
    ring: {
      description:
        "The ring of the store that owns the object (05 Rings): the ledger and rulebook are Ring 0 (owner D-3; revisit at M3 with the evolve agent's rule proposals, T-04-14).",
      const: 0,
    },
    createdAt: { $ref: "#/$defs/at" },
    createdSeq: { $ref: "#/$defs/seq" },
    text: {
      $ref: "#/$defs/text",
      description:
        "The rule as the owner approved it, for example a pattern-we-do-not-use.",
    },
    authority: {
      description:
        "Who approved the rule: only the owner until the evolve agent proposes rules (M3, T-04-14).",
      const: "owner",
    },
    evidenceDecisionIds: {
      description:
        "The ledger entries the rule rests on, unique (checked by the writer); may be empty for a hand-authored rule.",
      type: "array",
      maxItems: 256,
      items: { $ref: "#/$defs/decisionId" },
    },
    assumption: {
      $ref: "#/$defs/assumption",
      description:
        "The assumption the rule rests on, as one line, like a rot-register entry.",
    },
    reviewTrigger: {
      $ref: "#/$defs/reviewTrigger",
      description:
        "What makes the rule due for re-audit; a model upgrade at least.",
    },
    status: {
      title: "RuleStatus",
      description:
        "`live` once approved and `retired` when the owner drops it; a harness-proposed status arrives with its M3 writer and fixture.",
      enum: ["live", "retired"],
    },
  },
};
const schema60 = {
  description:
    "Kind-prefixed rule ID, also a valid session-log ID (at most 128 characters).",
  type: "string",
  pattern: "^rule-[A-Za-z0-9][A-Za-z0-9_-]{0,122}$",
};
const schema64 = {
  description:
    "Kind-prefixed decision ID, also a valid session-log ID (at most 128 characters).",
  type: "string",
  pattern: "^decision-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$",
};
const schema65 = {
  description:
    "One line without leading or trailing spaces, at most 1024 characters.",
  $comment: "Copy of rot-register.schema.json's `assumption`.",
  type: "string",
  pattern: "^\\S(.{0,1022}\\S)?$",
};
const schema66 = {
  description:
    "What makes the assumption due for review: a model change, an engine change or a milestone end.",
  $comment: "Copy of rot-register.schema.json's `reviewTrigger` array.",
  type: "array",
  minItems: 1,
  maxItems: 3,
  items: { enum: ["model", "engine", "milestone"] },
};
const pattern25 = new RegExp("^rule-[A-Za-z0-9][A-Za-z0-9_-]{0,122}$", "u");
const pattern29 = new RegExp("^decision-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$", "u");
const pattern30 = new RegExp("^\\S(.{0,1022}\\S)?$", "u");
function validate29(
  data,
  {
    instancePath = "",
    parentData,
    parentDataProperty,
    rootData = data,
    dynamicAnchors = {},
  } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate29.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.id === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "id" },
        message: "must have required property '" + "id" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.kind === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "kind" },
        message: "must have required property '" + "kind" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.ring === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "ring" },
        message: "must have required property '" + "ring" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.createdAt === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "createdAt" },
        message: "must have required property '" + "createdAt" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.createdSeq === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "createdSeq" },
        message: "must have required property '" + "createdSeq" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.text === undefined) {
      const err5 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "text" },
        message: "must have required property '" + "text" + "'",
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.authority === undefined) {
      const err6 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "authority" },
        message: "must have required property '" + "authority" + "'",
      };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.evidenceDecisionIds === undefined) {
      const err7 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "evidenceDecisionIds" },
        message: "must have required property '" + "evidenceDecisionIds" + "'",
      };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.assumption === undefined) {
      const err8 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "assumption" },
        message: "must have required property '" + "assumption" + "'",
      };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    if (data.reviewTrigger === undefined) {
      const err9 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "reviewTrigger" },
        message: "must have required property '" + "reviewTrigger" + "'",
      };
      if (vErrors === null) {
        vErrors = [err9];
      } else {
        vErrors.push(err9);
      }
      errors++;
    }
    if (data.status === undefined) {
      const err10 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "status" },
        message: "must have required property '" + "status" + "'",
      };
      if (vErrors === null) {
        vErrors = [err10];
      } else {
        vErrors.push(err10);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func1.call(schema59.properties, key0)) {
        const err11 = {
          instancePath,
          schemaPath: "#/additionalProperties",
          keyword: "additionalProperties",
          params: { additionalProperty: key0 },
          message: "must NOT have additional properties",
        };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    if (data.id !== undefined) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (!pattern25.test(data0)) {
          const err12 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/$defs/ruleId/pattern",
            keyword: "pattern",
            params: { pattern: "^rule-[A-Za-z0-9][A-Za-z0-9_-]{0,122}$" },
            message:
              'must match pattern "' +
              "^rule-[A-Za-z0-9][A-Za-z0-9_-]{0,122}$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
      } else {
        const err13 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/$defs/ruleId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
    if (data.kind !== undefined) {
      if ("rule" !== data.kind) {
        const err14 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "rule" },
          message: "must be equal to constant",
        };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
    }
    if (data.ring !== undefined) {
      if (0 !== data.ring) {
        const err15 = {
          instancePath: instancePath + "/ring",
          schemaPath: "#/properties/ring/const",
          keyword: "const",
          params: { allowedValue: 0 },
          message: "must be equal to constant",
        };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    if (data.createdAt !== undefined) {
      let data3 = data.createdAt;
      if (typeof data3 === "string") {
        if (!pattern5.test(data3)) {
          const err16 = {
            instancePath: instancePath + "/createdAt",
            schemaPath: "#/$defs/at/pattern",
            keyword: "pattern",
            params: {
              pattern:
                "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$",
            },
            message:
              'must match pattern "' +
              "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
      } else {
        const err17 = {
          instancePath: instancePath + "/createdAt",
          schemaPath: "#/$defs/at/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
    }
    if (data.createdSeq !== undefined) {
      let data4 = data.createdSeq;
      if (!(
        typeof data4 == "number" &&
        !(data4 % 1) &&
        !isNaN(data4) &&
        isFinite(data4)
      )) {
        const err18 = {
          instancePath: instancePath + "/createdSeq",
          schemaPath: "#/$defs/seq/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      }
      if (typeof data4 == "number" && isFinite(data4)) {
        if (data4 > 9007199254740991 || isNaN(data4)) {
          const err19 = {
            instancePath: instancePath + "/createdSeq",
            schemaPath: "#/$defs/seq/maximum",
            keyword: "maximum",
            params: { comparison: "<=", limit: 9007199254740991 },
            message: "must be <= 9007199254740991",
          };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
        if (data4 < 0 || isNaN(data4)) {
          const err20 = {
            instancePath: instancePath + "/createdSeq",
            schemaPath: "#/$defs/seq/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        }
      }
    }
    if (data.text !== undefined) {
      let data5 = data.text;
      const _errs17 = errors;
      const _errs18 = errors;
      if (typeof data5 === "string") {
        if (!pattern7.test(data5)) {
          const err21 = {};
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
      }
      var valid5 = _errs18 === errors;
      if (valid5) {
        const err22 = {
          instancePath: instancePath + "/text",
          schemaPath: "#/$defs/text/not",
          keyword: "not",
          params: {},
          message: "must NOT be valid",
        };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      } else {
        errors = _errs17;
        if (vErrors !== null) {
          if (_errs17) {
            vErrors.length = _errs17;
          } else {
            vErrors = null;
          }
        }
      }
      if (typeof data5 === "string") {
        if (!pattern8.test(data5)) {
          const err23 = {
            instancePath: instancePath + "/text",
            schemaPath: "#/$defs/text/pattern",
            keyword: "pattern",
            params: {
              pattern:
                "^[^\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,8192}$",
            },
            message:
              'must match pattern "' +
              "^[^\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,8192}$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
      } else {
        const err24 = {
          instancePath: instancePath + "/text",
          schemaPath: "#/$defs/text/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
        }
        errors++;
      }
    }
    if (data.authority !== undefined) {
      if ("owner" !== data.authority) {
        const err25 = {
          instancePath: instancePath + "/authority",
          schemaPath: "#/properties/authority/const",
          keyword: "const",
          params: { allowedValue: "owner" },
          message: "must be equal to constant",
        };
        if (vErrors === null) {
          vErrors = [err25];
        } else {
          vErrors.push(err25);
        }
        errors++;
      }
    }
    if (data.evidenceDecisionIds !== undefined) {
      let data7 = data.evidenceDecisionIds;
      if (Array.isArray(data7)) {
        if (data7.length > 256) {
          const err26 = {
            instancePath: instancePath + "/evidenceDecisionIds",
            schemaPath: "#/properties/evidenceDecisionIds/maxItems",
            keyword: "maxItems",
            params: { limit: 256 },
            message: "must NOT have more than 256 items",
          };
          if (vErrors === null) {
            vErrors = [err26];
          } else {
            vErrors.push(err26);
          }
          errors++;
        }
        const len0 = data7.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data8 = data7[i0];
          if (typeof data8 === "string") {
            if (!pattern29.test(data8)) {
              const err27 = {
                instancePath: instancePath + "/evidenceDecisionIds/" + i0,
                schemaPath: "#/$defs/decisionId/pattern",
                keyword: "pattern",
                params: {
                  pattern: "^decision-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$",
                },
                message:
                  'must match pattern "' +
                  "^decision-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$" +
                  '"',
              };
              if (vErrors === null) {
                vErrors = [err27];
              } else {
                vErrors.push(err27);
              }
              errors++;
            }
          } else {
            const err28 = {
              instancePath: instancePath + "/evidenceDecisionIds/" + i0,
              schemaPath: "#/$defs/decisionId/type",
              keyword: "type",
              params: { type: "string" },
              message: "must be string",
            };
            if (vErrors === null) {
              vErrors = [err28];
            } else {
              vErrors.push(err28);
            }
            errors++;
          }
        }
      } else {
        const err29 = {
          instancePath: instancePath + "/evidenceDecisionIds",
          schemaPath: "#/properties/evidenceDecisionIds/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err29];
        } else {
          vErrors.push(err29);
        }
        errors++;
      }
    }
    if (data.assumption !== undefined) {
      let data9 = data.assumption;
      if (typeof data9 === "string") {
        if (!pattern30.test(data9)) {
          const err30 = {
            instancePath: instancePath + "/assumption",
            schemaPath: "#/$defs/assumption/pattern",
            keyword: "pattern",
            params: { pattern: "^\\S(.{0,1022}\\S)?$" },
            message: 'must match pattern "' + "^\\S(.{0,1022}\\S)?$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err30];
          } else {
            vErrors.push(err30);
          }
          errors++;
        }
      } else {
        const err31 = {
          instancePath: instancePath + "/assumption",
          schemaPath: "#/$defs/assumption/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err31];
        } else {
          vErrors.push(err31);
        }
        errors++;
      }
    }
    if (data.reviewTrigger !== undefined) {
      let data10 = data.reviewTrigger;
      if (Array.isArray(data10)) {
        if (data10.length > 3) {
          const err32 = {
            instancePath: instancePath + "/reviewTrigger",
            schemaPath: "#/$defs/reviewTrigger/maxItems",
            keyword: "maxItems",
            params: { limit: 3 },
            message: "must NOT have more than 3 items",
          };
          if (vErrors === null) {
            vErrors = [err32];
          } else {
            vErrors.push(err32);
          }
          errors++;
        }
        if (data10.length < 1) {
          const err33 = {
            instancePath: instancePath + "/reviewTrigger",
            schemaPath: "#/$defs/reviewTrigger/minItems",
            keyword: "minItems",
            params: { limit: 1 },
            message: "must NOT have fewer than 1 items",
          };
          if (vErrors === null) {
            vErrors = [err33];
          } else {
            vErrors.push(err33);
          }
          errors++;
        }
        const len1 = data10.length;
        for (let i1 = 0; i1 < len1; i1++) {
          let data11 = data10[i1];
          if (!(
            data11 === "model" ||
            data11 === "engine" ||
            data11 === "milestone"
          )) {
            const err34 = {
              instancePath: instancePath + "/reviewTrigger/" + i1,
              schemaPath: "#/$defs/reviewTrigger/items/enum",
              keyword: "enum",
              params: { allowedValues: schema66.items.enum },
              message: "must be equal to one of the allowed values",
            };
            if (vErrors === null) {
              vErrors = [err34];
            } else {
              vErrors.push(err34);
            }
            errors++;
          }
        }
      } else {
        const err35 = {
          instancePath: instancePath + "/reviewTrigger",
          schemaPath: "#/$defs/reviewTrigger/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err35];
        } else {
          vErrors.push(err35);
        }
        errors++;
      }
    }
    if (data.status !== undefined) {
      let data12 = data.status;
      if (!(data12 === "live" || data12 === "retired")) {
        const err36 = {
          instancePath: instancePath + "/status",
          schemaPath: "#/properties/status/enum",
          keyword: "enum",
          params: { allowedValues: schema59.properties.status.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err36];
        } else {
          vErrors.push(err36);
        }
        errors++;
      }
    }
  } else {
    const err37 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err37];
    } else {
      vErrors.push(err37);
    }
    errors++;
  }
  validate29.errors = vErrors;
  return errors === 0;
}
validate29.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
const schema67 = {
  title: "SkillRecord",
  description:
    "One version of a skill file, promoted by the evolve agent through the composite gate (05, M3); no M1 writer.",
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "kind",
    "ring",
    "createdAt",
    "createdSeq",
    "name",
    "version",
    "digest",
    "status",
  ],
  properties: {
    id: { $ref: "#/$defs/skillId" },
    kind: { const: "skill" },
    ring: {
      description:
        "The ring of the store that owns the object (05 Rings): skills are Ring 1.",
      const: 1,
    },
    createdAt: { $ref: "#/$defs/at" },
    createdSeq: { $ref: "#/$defs/seq" },
    name: {
      description: "The skill's name, a lowercase slug.",
      type: "string",
      pattern: "^[a-z][a-z0-9-]{0,63}$",
    },
    version: {
      description:
        "Revision number of this skill file; a new version is a new object (one logical change per commit).",
      type: "integer",
      minimum: 1,
      maximum: 9007199254740991,
    },
    digest: {
      $ref: "#/$defs/sha256",
      description: "SHA-256 of the skill file at this version.",
    },
    status: {
      title: "SkillStatus",
      description:
        "`candidate` while a proposal, `live` after the gate and veto window, `retired` after rollback or pruning.",
      enum: ["candidate", "live", "retired"],
    },
  },
};
const schema68 = {
  description:
    "Kind-prefixed skill ID, also a valid session-log ID (at most 128 characters).",
  type: "string",
  pattern: "^skill-[A-Za-z0-9][A-Za-z0-9_-]{0,121}$",
};
const pattern31 = new RegExp("^skill-[A-Za-z0-9][A-Za-z0-9_-]{0,121}$", "u");
const pattern33 = new RegExp("^[a-z][a-z0-9-]{0,63}$", "u");
function validate31(
  data,
  {
    instancePath = "",
    parentData,
    parentDataProperty,
    rootData = data,
    dynamicAnchors = {},
  } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate31.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.id === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "id" },
        message: "must have required property '" + "id" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.kind === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "kind" },
        message: "must have required property '" + "kind" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.ring === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "ring" },
        message: "must have required property '" + "ring" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.createdAt === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "createdAt" },
        message: "must have required property '" + "createdAt" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.createdSeq === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "createdSeq" },
        message: "must have required property '" + "createdSeq" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.name === undefined) {
      const err5 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "name" },
        message: "must have required property '" + "name" + "'",
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.version === undefined) {
      const err6 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "version" },
        message: "must have required property '" + "version" + "'",
      };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.digest === undefined) {
      const err7 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "digest" },
        message: "must have required property '" + "digest" + "'",
      };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.status === undefined) {
      const err8 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "status" },
        message: "must have required property '" + "status" + "'",
      };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func1.call(schema67.properties, key0)) {
        const err9 = {
          instancePath,
          schemaPath: "#/additionalProperties",
          keyword: "additionalProperties",
          params: { additionalProperty: key0 },
          message: "must NOT have additional properties",
        };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.id !== undefined) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (!pattern31.test(data0)) {
          const err10 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/$defs/skillId/pattern",
            keyword: "pattern",
            params: { pattern: "^skill-[A-Za-z0-9][A-Za-z0-9_-]{0,121}$" },
            message:
              'must match pattern "' +
              "^skill-[A-Za-z0-9][A-Za-z0-9_-]{0,121}$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
      } else {
        const err11 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/$defs/skillId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    if (data.kind !== undefined) {
      if ("skill" !== data.kind) {
        const err12 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "skill" },
          message: "must be equal to constant",
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.ring !== undefined) {
      if (1 !== data.ring) {
        const err13 = {
          instancePath: instancePath + "/ring",
          schemaPath: "#/properties/ring/const",
          keyword: "const",
          params: { allowedValue: 1 },
          message: "must be equal to constant",
        };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
    if (data.createdAt !== undefined) {
      let data3 = data.createdAt;
      if (typeof data3 === "string") {
        if (!pattern5.test(data3)) {
          const err14 = {
            instancePath: instancePath + "/createdAt",
            schemaPath: "#/$defs/at/pattern",
            keyword: "pattern",
            params: {
              pattern:
                "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$",
            },
            message:
              'must match pattern "' +
              "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
      } else {
        const err15 = {
          instancePath: instancePath + "/createdAt",
          schemaPath: "#/$defs/at/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    if (data.createdSeq !== undefined) {
      let data4 = data.createdSeq;
      if (!(
        typeof data4 == "number" &&
        !(data4 % 1) &&
        !isNaN(data4) &&
        isFinite(data4)
      )) {
        const err16 = {
          instancePath: instancePath + "/createdSeq",
          schemaPath: "#/$defs/seq/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
      if (typeof data4 == "number" && isFinite(data4)) {
        if (data4 > 9007199254740991 || isNaN(data4)) {
          const err17 = {
            instancePath: instancePath + "/createdSeq",
            schemaPath: "#/$defs/seq/maximum",
            keyword: "maximum",
            params: { comparison: "<=", limit: 9007199254740991 },
            message: "must be <= 9007199254740991",
          };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        }
        if (data4 < 0 || isNaN(data4)) {
          const err18 = {
            instancePath: instancePath + "/createdSeq",
            schemaPath: "#/$defs/seq/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
      }
    }
    if (data.name !== undefined) {
      let data5 = data.name;
      if (typeof data5 === "string") {
        if (!pattern33.test(data5)) {
          const err19 = {
            instancePath: instancePath + "/name",
            schemaPath: "#/properties/name/pattern",
            keyword: "pattern",
            params: { pattern: "^[a-z][a-z0-9-]{0,63}$" },
            message: 'must match pattern "' + "^[a-z][a-z0-9-]{0,63}$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
      } else {
        const err20 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/properties/name/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
    }
    if (data.version !== undefined) {
      let data6 = data.version;
      if (!(
        typeof data6 == "number" &&
        !(data6 % 1) &&
        !isNaN(data6) &&
        isFinite(data6)
      )) {
        const err21 = {
          instancePath: instancePath + "/version",
          schemaPath: "#/properties/version/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err21];
        } else {
          vErrors.push(err21);
        }
        errors++;
      }
      if (typeof data6 == "number" && isFinite(data6)) {
        if (data6 > 9007199254740991 || isNaN(data6)) {
          const err22 = {
            instancePath: instancePath + "/version",
            schemaPath: "#/properties/version/maximum",
            keyword: "maximum",
            params: { comparison: "<=", limit: 9007199254740991 },
            message: "must be <= 9007199254740991",
          };
          if (vErrors === null) {
            vErrors = [err22];
          } else {
            vErrors.push(err22);
          }
          errors++;
        }
        if (data6 < 1 || isNaN(data6)) {
          const err23 = {
            instancePath: instancePath + "/version",
            schemaPath: "#/properties/version/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 1 },
            message: "must be >= 1",
          };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
      }
    }
    if (data.digest !== undefined) {
      let data7 = data.digest;
      if (typeof data7 === "string") {
        if (!pattern23.test(data7)) {
          const err24 = {
            instancePath: instancePath + "/digest",
            schemaPath: "#/$defs/sha256/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9a-f]{64}$" },
            message: 'must match pattern "' + "^[0-9a-f]{64}$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
      } else {
        const err25 = {
          instancePath: instancePath + "/digest",
          schemaPath: "#/$defs/sha256/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err25];
        } else {
          vErrors.push(err25);
        }
        errors++;
      }
    }
    if (data.status !== undefined) {
      let data8 = data.status;
      if (!(data8 === "candidate" || data8 === "live" || data8 === "retired")) {
        const err26 = {
          instancePath: instancePath + "/status",
          schemaPath: "#/properties/status/enum",
          keyword: "enum",
          params: { allowedValues: schema67.properties.status.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err26];
        } else {
          vErrors.push(err26);
        }
        errors++;
      }
    }
  } else {
    const err27 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err27];
    } else {
      vErrors.push(err27);
    }
    errors++;
  }
  validate31.errors = vErrors;
  return errors === 0;
}
validate31.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
const schema72 = {
  title: "DecisionRecord",
  description:
    "A ledger entry (04 Decision ledger, Q61): an owned decision with its brief, or a Ruling, which is the variant with authority harness, a ruling body and no brief or owner-written field.",
  oneOf: [{ $ref: "#/$defs/ownedDecision" }, { $ref: "#/$defs/ruling" }],
};
const schema73 = {
  title: "OwnedDecisionRecord",
  description:
    "A decision in an owned class, opened by the harness with its brief; owner-written fields are absent until SIG, A3, A1 and A7 add them with their writers (B5-1b owner answers OD-1).",
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "kind",
    "ring",
    "createdAt",
    "createdSeq",
    "authority",
    "taskId",
    "runId",
    "signalIds",
    "footprint",
    "outcomes",
    "class",
    "source",
    "status",
    "brief",
  ],
  properties: {
    id: { $ref: "#/$defs/decisionId" },
    kind: { const: "decision" },
    ring: {
      description:
        "The ring of the store that owns the object (05 Rings): the ledger is Ring 0.",
      const: 0,
    },
    createdAt: { $ref: "#/$defs/at" },
    createdSeq: { $ref: "#/$defs/seq" },
    authority: { description: "Who decides: the owner.", const: "owner" },
    taskId: {
      $ref: "#/$defs/taskId",
      description:
        "The task the decision belongs to (typed link task→decision).",
    },
    runId: {
      $ref: "#/$defs/runId",
      description: "The run that opened the decision.",
    },
    signalIds: { $ref: "#/$defs/signalIds" },
    footprint: { $ref: "#/$defs/footprint" },
    outcomes: { $ref: "#/$defs/outcomes" },
    class: { $ref: "#/$defs/decisionClass" },
    source: {
      description:
        "What raised the decision: the plan's `decisions[]`, a floor signal over the brief threshold, or the agent's self-flag (Q45, Q53, Q54).",
      enum: ["plan", "floor", "selfFlag"],
    },
    status: {
      description:
        "`pending` until the owner's first answer, then `resolved` once (card contract), which cannot happen before SIG.",
      enum: ["pending", "resolved"],
    },
    brief: { $ref: "#/$defs/brief" },
  },
};
const schema89 = {
  title: "DecisionClass",
  description:
    "An owned decision class (03 Owned decision classes, X3): architecture, scope or technology.",
  enum: ["architecture", "scope", "technology"],
};
const schema79 = {
  description:
    "The signals that raised the decision, unique (checked by the writer); empty for a plan's `decisions[]`.",
  type: "array",
  maxItems: 256,
  items: { $ref: "#/$defs/signalId" },
};
const schema80 = {
  description:
    "The ID of a signal that raised a decision, such as a floor signal ID or the event ID of an `intake.classified` event.",
  $comment:
    "Copied as the items of intake-event.schema.json's `reclassified.signalIds`.",
  type: "string",
  pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$",
};
const pattern39 = new RegExp("^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$", "u");
function validate35(
  data,
  {
    instancePath = "",
    parentData,
    parentDataProperty,
    rootData = data,
    dynamicAnchors = {},
  } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate35.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (Array.isArray(data)) {
    if (data.length > 256) {
      const err0 = {
        instancePath,
        schemaPath: "#/maxItems",
        keyword: "maxItems",
        params: { limit: 256 },
        message: "must NOT have more than 256 items",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    const len0 = data.length;
    for (let i0 = 0; i0 < len0; i0++) {
      let data0 = data[i0];
      if (typeof data0 === "string") {
        if (!pattern39.test(data0)) {
          const err1 = {
            instancePath: instancePath + "/" + i0,
            schemaPath: "#/$defs/signalId/pattern",
            keyword: "pattern",
            params: { pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$" },
            message:
              'must match pattern "' +
              "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
      } else {
        const err2 = {
          instancePath: instancePath + "/" + i0,
          schemaPath: "#/$defs/signalId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
  } else {
    const err3 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "array" },
      message: "must be array",
    };
    if (vErrors === null) {
      vErrors = [err3];
    } else {
      vErrors.push(err3);
    }
    errors++;
  }
  validate35.errors = vErrors;
  return errors === 0;
}
validate35.evaluated = {
  items: true,
  dynamicProps: false,
  dynamicItems: false,
};
const schema81 = {
  description:
    "Footprint artifact IDs (04 Loop 1, Q47), unique (checked by the writer); empty until the harness records the footprint when the decision closes.",
  type: "array",
  maxItems: 1024,
  items: { $ref: "#/$defs/artifactId" },
};
function validate37(
  data,
  {
    instancePath = "",
    parentData,
    parentDataProperty,
    rootData = data,
    dynamicAnchors = {},
  } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate37.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (Array.isArray(data)) {
    if (data.length > 1024) {
      const err0 = {
        instancePath,
        schemaPath: "#/maxItems",
        keyword: "maxItems",
        params: { limit: 1024 },
        message: "must NOT have more than 1024 items",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    const len0 = data.length;
    for (let i0 = 0; i0 < len0; i0++) {
      let data0 = data[i0];
      if (typeof data0 === "string") {
        if (!pattern19.test(data0)) {
          const err1 = {
            instancePath: instancePath + "/" + i0,
            schemaPath: "#/$defs/artifactId/pattern",
            keyword: "pattern",
            params: { pattern: "^artifact-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$" },
            message:
              'must match pattern "' +
              "^artifact-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
      } else {
        const err2 = {
          instancePath: instancePath + "/" + i0,
          schemaPath: "#/$defs/artifactId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
  } else {
    const err3 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "array" },
      message: "must be array",
    };
    if (vErrors === null) {
      vErrors = [err3];
    } else {
      vErrors.push(err3);
    }
    errors++;
  }
  validate37.errors = vErrors;
  return errors === 0;
}
validate37.evaluated = {
  items: true,
  dynamicProps: false,
  dynamicItems: false,
};
const schema83 = {
  description:
    "The automatic outcome signals in append order (Q46); empty until a later run's diff matches the footprint.",
  type: "array",
  maxItems: 1024,
  items: { $ref: "#/$defs/outcomeSignal" },
};
const schema84 = {
  title: "DecisionOutcome",
  description:
    "An automatic outcome signal (Q47) that the harness appends when a later run's diff matches the footprint; owner confirmations, dismissals and review outcomes arrive with their writers.",
  type: "object",
  additionalProperties: false,
  required: ["kind", "signal", "runId", "artifactIds", "at", "seq"],
  properties: {
    kind: { const: "signal" },
    signal: {
      description:
        "`rework`: the diff changed a symbol of a footprint file; `dependencyChanged`: it added or removed a footprint dependency (Q47).",
      enum: ["rework", "dependencyChanged"],
    },
    runId: {
      $ref: "#/$defs/runId",
      description: "The run whose diff matched.",
    },
    artifactIds: {
      description: "The footprint entries the diff matched.",
      type: "array",
      minItems: 1,
      maxItems: 256,
      items: { $ref: "#/$defs/artifactId" },
    },
    at: {
      $ref: "#/$defs/at",
      description: "The `at` of the event that appended the signal.",
    },
    seq: {
      $ref: "#/$defs/seq",
      description: "The `seq` of the event that appended the signal.",
    },
  },
};
function validate40(
  data,
  {
    instancePath = "",
    parentData,
    parentDataProperty,
    rootData = data,
    dynamicAnchors = {},
  } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate40.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.kind === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "kind" },
        message: "must have required property '" + "kind" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.signal === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "signal" },
        message: "must have required property '" + "signal" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.runId === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "runId" },
        message: "must have required property '" + "runId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.artifactIds === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "artifactIds" },
        message: "must have required property '" + "artifactIds" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.at === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "at" },
        message: "must have required property '" + "at" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.seq === undefined) {
      const err5 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "seq" },
        message: "must have required property '" + "seq" + "'",
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(
        key0 === "kind" ||
        key0 === "signal" ||
        key0 === "runId" ||
        key0 === "artifactIds" ||
        key0 === "at" ||
        key0 === "seq"
      )) {
        const err6 = {
          instancePath,
          schemaPath: "#/additionalProperties",
          keyword: "additionalProperties",
          params: { additionalProperty: key0 },
          message: "must NOT have additional properties",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    if (data.kind !== undefined) {
      if ("signal" !== data.kind) {
        const err7 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "signal" },
          message: "must be equal to constant",
        };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.signal !== undefined) {
      let data1 = data.signal;
      if (!(data1 === "rework" || data1 === "dependencyChanged")) {
        const err8 = {
          instancePath: instancePath + "/signal",
          schemaPath: "#/properties/signal/enum",
          keyword: "enum",
          params: { allowedValues: schema84.properties.signal.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.runId !== undefined) {
      let data2 = data.runId;
      if (typeof data2 === "string") {
        if (!pattern11.test(data2)) {
          const err9 = {
            instancePath: instancePath + "/runId",
            schemaPath: "#/$defs/runId/pattern",
            keyword: "pattern",
            params: { pattern: "^run-[A-Za-z0-9][A-Za-z0-9_-]{0,123}$" },
            message:
              'must match pattern "' +
              "^run-[A-Za-z0-9][A-Za-z0-9_-]{0,123}$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
      } else {
        const err10 = {
          instancePath: instancePath + "/runId",
          schemaPath: "#/$defs/runId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.artifactIds !== undefined) {
      let data3 = data.artifactIds;
      if (Array.isArray(data3)) {
        if (data3.length > 256) {
          const err11 = {
            instancePath: instancePath + "/artifactIds",
            schemaPath: "#/properties/artifactIds/maxItems",
            keyword: "maxItems",
            params: { limit: 256 },
            message: "must NOT have more than 256 items",
          };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
        if (data3.length < 1) {
          const err12 = {
            instancePath: instancePath + "/artifactIds",
            schemaPath: "#/properties/artifactIds/minItems",
            keyword: "minItems",
            params: { limit: 1 },
            message: "must NOT have fewer than 1 items",
          };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
        const len0 = data3.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data4 = data3[i0];
          if (typeof data4 === "string") {
            if (!pattern19.test(data4)) {
              const err13 = {
                instancePath: instancePath + "/artifactIds/" + i0,
                schemaPath: "#/$defs/artifactId/pattern",
                keyword: "pattern",
                params: {
                  pattern: "^artifact-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$",
                },
                message:
                  'must match pattern "' +
                  "^artifact-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$" +
                  '"',
              };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          } else {
            const err14 = {
              instancePath: instancePath + "/artifactIds/" + i0,
              schemaPath: "#/$defs/artifactId/type",
              keyword: "type",
              params: { type: "string" },
              message: "must be string",
            };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
      } else {
        const err15 = {
          instancePath: instancePath + "/artifactIds",
          schemaPath: "#/properties/artifactIds/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    if (data.at !== undefined) {
      let data5 = data.at;
      if (typeof data5 === "string") {
        if (!pattern5.test(data5)) {
          const err16 = {
            instancePath: instancePath + "/at",
            schemaPath: "#/$defs/at/pattern",
            keyword: "pattern",
            params: {
              pattern:
                "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$",
            },
            message:
              'must match pattern "' +
              "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
      } else {
        const err17 = {
          instancePath: instancePath + "/at",
          schemaPath: "#/$defs/at/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
    }
    if (data.seq !== undefined) {
      let data6 = data.seq;
      if (!(
        typeof data6 == "number" &&
        !(data6 % 1) &&
        !isNaN(data6) &&
        isFinite(data6)
      )) {
        const err18 = {
          instancePath: instancePath + "/seq",
          schemaPath: "#/$defs/seq/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      }
      if (typeof data6 == "number" && isFinite(data6)) {
        if (data6 > 9007199254740991 || isNaN(data6)) {
          const err19 = {
            instancePath: instancePath + "/seq",
            schemaPath: "#/$defs/seq/maximum",
            keyword: "maximum",
            params: { comparison: "<=", limit: 9007199254740991 },
            message: "must be <= 9007199254740991",
          };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
        if (data6 < 0 || isNaN(data6)) {
          const err20 = {
            instancePath: instancePath + "/seq",
            schemaPath: "#/$defs/seq/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        }
      }
    }
  } else {
    const err21 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err21];
    } else {
      vErrors.push(err21);
    }
    errors++;
  }
  validate40.errors = vErrors;
  return errors === 0;
}
validate40.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
function validate39(
  data,
  {
    instancePath = "",
    parentData,
    parentDataProperty,
    rootData = data,
    dynamicAnchors = {},
  } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate39.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (Array.isArray(data)) {
    if (data.length > 1024) {
      const err0 = {
        instancePath,
        schemaPath: "#/maxItems",
        keyword: "maxItems",
        params: { limit: 1024 },
        message: "must NOT have more than 1024 items",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    const len0 = data.length;
    for (let i0 = 0; i0 < len0; i0++) {
      if (
        !validate40(data[i0], {
          instancePath: instancePath + "/" + i0,
          parentData: data,
          parentDataProperty: i0,
          rootData,
          dynamicAnchors,
        })
      ) {
        vErrors =
          vErrors === null
            ? validate40.errors
            : vErrors.concat(validate40.errors);
        errors = vErrors.length;
      }
    }
  } else {
    const err1 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "array" },
      message: "must be array",
    };
    if (vErrors === null) {
      vErrors = [err1];
    } else {
      vErrors.push(err1);
    }
    errors++;
  }
  validate39.errors = vErrors;
  return errors === 0;
}
validate39.evaluated = {
  items: true,
  dynamicProps: false,
  dynamicItems: false,
};
const schema90 = {
  title: "DecisionBrief",
  description:
    "The brief as presented (03 The brief, Q45), written by the harness when it opens the decision; it holds the recommendation only as a salted commitment until reveal (Q48).",
  type: "object",
  additionalProperties: false,
  required: [
    "question",
    "options",
    "recommendationSha256",
    "optionOrderSeed",
    "confidence",
    "costIfWrong",
    "reversibility",
    "uncertainty",
    "blocked",
    "concepts",
    "proposedFootprint",
  ],
  properties: {
    question: { $ref: "#/$defs/question" },
    options: {
      description:
        "The 2 to 4 options actually considered, in stored order, with unique IDs (checked by the writer).",
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: { $ref: "#/$defs/option" },
    },
    recommendationSha256: {
      $ref: "#/$defs/sha256",
      description:
        "The recommendation as a salted commitment: SHA-256 of the UTF-8 bytes of `JSON.stringify([decisionId, optionId, nonce])` (no whitespace), where the nonce is 256 random bits as 64 lowercase hex digits, and the nonce and option are revealed later in `decision.recommendation.revealed` (B5-2 reserves it, A3 writes it).",
    },
    optionOrderSeed: {
      $ref: "#/$defs/seed",
      description:
        "The logged seed of the shuffled display order of the options (Q48).",
    },
    confidence: {
      title: "DecisionConfidence",
      description:
        "The harness's confidence in its recommendation, shown in the brief before reveal (Q45, Q48, OD-4).",
      enum: ["low", "medium", "high"],
    },
    costIfWrong: {
      $ref: "#/$defs/line",
      description:
        "The cost if the decision is wrong, as one line of at most 200 code points.",
    },
    reversibility: {
      description: "How hard the decision is to undo (03 The brief, OD-5).",
      enum: ["reversible", "costly", "irreversible"],
    },
    uncertainty: {
      $ref: "#/$defs/line",
      description:
        "What the harness is uncertain about, as one line of at most 200 code points.",
    },
    blocked: {
      $ref: "#/$defs/line",
      description:
        "What is blocked while the decision waits, as one line of at most 200 code points.",
    },
    concepts: {
      description:
        "The concept slugs the brief references (X6), unique (checked by the writer); may be empty.",
      type: "array",
      maxItems: 64,
      items: { $ref: "#/$defs/conceptSlug" },
    },
    proposedFootprint: {
      description:
        "The footprint the harness expects the decision to have (Q45), as content-addressed artifact IDs, unique (checked by the writer); may be empty.",
      type: "array",
      maxItems: 1024,
      items: { $ref: "#/$defs/artifactId" },
    },
  },
};
const schema91 = {
  description:
    "One line of 1 to 160 code points, not only spaces, without a control character, line break, bidi control or lone surrogate.",
  type: "string",
  pattern:
    "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,160}$",
  not: { pattern: "^\\s*$" },
};
const schema96 = {
  description: "A 128-bit seed as 32 lowercase hex characters.",
  type: "string",
  pattern: "^[0-9a-f]{32}$",
};
const schema94 = {
  description:
    "One line of 1 to 200 code points, not only spaces, without a control character, line break, bidi control or lone surrogate.",
  type: "string",
  pattern:
    "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,200}$",
  not: { pattern: "^\\s*$" },
};
const schema100 = {
  description:
    "A concept slug (X6): 1 to 64 lowercase letters, digits and hyphens, not starting with a hyphen.",
  type: "string",
  pattern: "^[a-z0-9][a-z0-9-]{0,63}$",
};
const pattern45 = new RegExp(
  "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,160}$",
  "u",
);
const pattern51 = new RegExp("^[0-9a-f]{32}$", "u");
const pattern49 = new RegExp(
  "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,200}$",
  "u",
);
const pattern58 = new RegExp("^[a-z0-9][a-z0-9-]{0,63}$", "u");
const schema92 = {
  title: "DecisionOption",
  description:
    "One option of a brief, whose ID stays the same under the shuffled display order (Q48).",
  type: "object",
  additionalProperties: false,
  required: ["id", "label", "tradeoffs"],
  properties: {
    id: { enum: ["a", "b", "c", "d"] },
    label: { $ref: "#/$defs/optionLabel" },
    tradeoffs: {
      $ref: "#/$defs/line",
      description:
        "The option's trade-offs, as one line of at most 200 code points (Q45).",
    },
  },
};
const schema93 = {
  description:
    "One line of 1 to 80 code points, not only spaces, without a control character, line break, bidi control or lone surrogate.",
  type: "string",
  pattern:
    "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,80}$",
  not: { pattern: "^\\s*$" },
};
const pattern47 = new RegExp(
  "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,80}$",
  "u",
);
function validate44(
  data,
  {
    instancePath = "",
    parentData,
    parentDataProperty,
    rootData = data,
    dynamicAnchors = {},
  } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate44.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.id === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "id" },
        message: "must have required property '" + "id" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.label === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "label" },
        message: "must have required property '" + "label" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.tradeoffs === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "tradeoffs" },
        message: "must have required property '" + "tradeoffs" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "id" || key0 === "label" || key0 === "tradeoffs")) {
        const err3 = {
          instancePath,
          schemaPath: "#/additionalProperties",
          keyword: "additionalProperties",
          params: { additionalProperty: key0 },
          message: "must NOT have additional properties",
        };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.id !== undefined) {
      let data0 = data.id;
      if (!(data0 === "a" || data0 === "b" || data0 === "c" || data0 === "d")) {
        const err4 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/properties/id/enum",
          keyword: "enum",
          params: { allowedValues: schema92.properties.id.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
    }
    if (data.label !== undefined) {
      let data1 = data.label;
      const _errs6 = errors;
      const _errs7 = errors;
      if (typeof data1 === "string") {
        if (!pattern7.test(data1)) {
          const err5 = {};
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
      var valid2 = _errs7 === errors;
      if (valid2) {
        const err6 = {
          instancePath: instancePath + "/label",
          schemaPath: "#/$defs/optionLabel/not",
          keyword: "not",
          params: {},
          message: "must NOT be valid",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      } else {
        errors = _errs6;
        if (vErrors !== null) {
          if (_errs6) {
            vErrors.length = _errs6;
          } else {
            vErrors = null;
          }
        }
      }
      if (typeof data1 === "string") {
        if (!pattern47.test(data1)) {
          const err7 = {
            instancePath: instancePath + "/label",
            schemaPath: "#/$defs/optionLabel/pattern",
            keyword: "pattern",
            params: {
              pattern:
                "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,80}$",
            },
            message:
              'must match pattern "' +
              "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,80}$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      } else {
        const err8 = {
          instancePath: instancePath + "/label",
          schemaPath: "#/$defs/optionLabel/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.tradeoffs !== undefined) {
      let data2 = data.tradeoffs;
      const _errs11 = errors;
      const _errs12 = errors;
      if (typeof data2 === "string") {
        if (!pattern7.test(data2)) {
          const err9 = {};
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
      }
      var valid4 = _errs12 === errors;
      if (valid4) {
        const err10 = {
          instancePath: instancePath + "/tradeoffs",
          schemaPath: "#/$defs/line/not",
          keyword: "not",
          params: {},
          message: "must NOT be valid",
        };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      } else {
        errors = _errs11;
        if (vErrors !== null) {
          if (_errs11) {
            vErrors.length = _errs11;
          } else {
            vErrors = null;
          }
        }
      }
      if (typeof data2 === "string") {
        if (!pattern49.test(data2)) {
          const err11 = {
            instancePath: instancePath + "/tradeoffs",
            schemaPath: "#/$defs/line/pattern",
            keyword: "pattern",
            params: {
              pattern:
                "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,200}$",
            },
            message:
              'must match pattern "' +
              "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,200}$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
      } else {
        const err12 = {
          instancePath: instancePath + "/tradeoffs",
          schemaPath: "#/$defs/line/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
  } else {
    const err13 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err13];
    } else {
      vErrors.push(err13);
    }
    errors++;
  }
  validate44.errors = vErrors;
  return errors === 0;
}
validate44.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
function validate43(
  data,
  {
    instancePath = "",
    parentData,
    parentDataProperty,
    rootData = data,
    dynamicAnchors = {},
  } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate43.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.question === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "question" },
        message: "must have required property '" + "question" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.options === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "options" },
        message: "must have required property '" + "options" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.recommendationSha256 === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "recommendationSha256" },
        message: "must have required property '" + "recommendationSha256" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.optionOrderSeed === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "optionOrderSeed" },
        message: "must have required property '" + "optionOrderSeed" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.confidence === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "confidence" },
        message: "must have required property '" + "confidence" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.costIfWrong === undefined) {
      const err5 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "costIfWrong" },
        message: "must have required property '" + "costIfWrong" + "'",
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.reversibility === undefined) {
      const err6 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "reversibility" },
        message: "must have required property '" + "reversibility" + "'",
      };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.uncertainty === undefined) {
      const err7 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "uncertainty" },
        message: "must have required property '" + "uncertainty" + "'",
      };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.blocked === undefined) {
      const err8 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "blocked" },
        message: "must have required property '" + "blocked" + "'",
      };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    if (data.concepts === undefined) {
      const err9 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "concepts" },
        message: "must have required property '" + "concepts" + "'",
      };
      if (vErrors === null) {
        vErrors = [err9];
      } else {
        vErrors.push(err9);
      }
      errors++;
    }
    if (data.proposedFootprint === undefined) {
      const err10 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "proposedFootprint" },
        message: "must have required property '" + "proposedFootprint" + "'",
      };
      if (vErrors === null) {
        vErrors = [err10];
      } else {
        vErrors.push(err10);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func1.call(schema90.properties, key0)) {
        const err11 = {
          instancePath,
          schemaPath: "#/additionalProperties",
          keyword: "additionalProperties",
          params: { additionalProperty: key0 },
          message: "must NOT have additional properties",
        };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    if (data.question !== undefined) {
      let data0 = data.question;
      const _errs5 = errors;
      const _errs6 = errors;
      if (typeof data0 === "string") {
        if (!pattern7.test(data0)) {
          const err12 = {};
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
      }
      var valid2 = _errs6 === errors;
      if (valid2) {
        const err13 = {
          instancePath: instancePath + "/question",
          schemaPath: "#/$defs/question/not",
          keyword: "not",
          params: {},
          message: "must NOT be valid",
        };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      } else {
        errors = _errs5;
        if (vErrors !== null) {
          if (_errs5) {
            vErrors.length = _errs5;
          } else {
            vErrors = null;
          }
        }
      }
      if (typeof data0 === "string") {
        if (!pattern45.test(data0)) {
          const err14 = {
            instancePath: instancePath + "/question",
            schemaPath: "#/$defs/question/pattern",
            keyword: "pattern",
            params: {
              pattern:
                "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,160}$",
            },
            message:
              'must match pattern "' +
              "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,160}$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
      } else {
        const err15 = {
          instancePath: instancePath + "/question",
          schemaPath: "#/$defs/question/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    if (data.options !== undefined) {
      let data1 = data.options;
      if (Array.isArray(data1)) {
        if (data1.length > 4) {
          const err16 = {
            instancePath: instancePath + "/options",
            schemaPath: "#/properties/options/maxItems",
            keyword: "maxItems",
            params: { limit: 4 },
            message: "must NOT have more than 4 items",
          };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
        if (data1.length < 2) {
          const err17 = {
            instancePath: instancePath + "/options",
            schemaPath: "#/properties/options/minItems",
            keyword: "minItems",
            params: { limit: 2 },
            message: "must NOT have fewer than 2 items",
          };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        }
        const len0 = data1.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (
            !validate44(data1[i0], {
              instancePath: instancePath + "/options/" + i0,
              parentData: data1,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors =
              vErrors === null
                ? validate44.errors
                : vErrors.concat(validate44.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err18 = {
          instancePath: instancePath + "/options",
          schemaPath: "#/properties/options/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      }
    }
    if (data.recommendationSha256 !== undefined) {
      let data3 = data.recommendationSha256;
      if (typeof data3 === "string") {
        if (!pattern23.test(data3)) {
          const err19 = {
            instancePath: instancePath + "/recommendationSha256",
            schemaPath: "#/$defs/sha256/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9a-f]{64}$" },
            message: 'must match pattern "' + "^[0-9a-f]{64}$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
      } else {
        const err20 = {
          instancePath: instancePath + "/recommendationSha256",
          schemaPath: "#/$defs/sha256/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
    }
    if (data.optionOrderSeed !== undefined) {
      let data4 = data.optionOrderSeed;
      if (typeof data4 === "string") {
        if (!pattern51.test(data4)) {
          const err21 = {
            instancePath: instancePath + "/optionOrderSeed",
            schemaPath: "#/$defs/seed/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9a-f]{32}$" },
            message: 'must match pattern "' + "^[0-9a-f]{32}$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
      } else {
        const err22 = {
          instancePath: instancePath + "/optionOrderSeed",
          schemaPath: "#/$defs/seed/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      }
    }
    if (data.confidence !== undefined) {
      let data5 = data.confidence;
      if (!(data5 === "low" || data5 === "medium" || data5 === "high")) {
        const err23 = {
          instancePath: instancePath + "/confidence",
          schemaPath: "#/properties/confidence/enum",
          keyword: "enum",
          params: { allowedValues: schema90.properties.confidence.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err23];
        } else {
          vErrors.push(err23);
        }
        errors++;
      }
    }
    if (data.costIfWrong !== undefined) {
      let data6 = data.costIfWrong;
      const _errs20 = errors;
      const _errs21 = errors;
      if (typeof data6 === "string") {
        if (!pattern7.test(data6)) {
          const err24 = {};
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
      }
      var valid8 = _errs21 === errors;
      if (valid8) {
        const err25 = {
          instancePath: instancePath + "/costIfWrong",
          schemaPath: "#/$defs/line/not",
          keyword: "not",
          params: {},
          message: "must NOT be valid",
        };
        if (vErrors === null) {
          vErrors = [err25];
        } else {
          vErrors.push(err25);
        }
        errors++;
      } else {
        errors = _errs20;
        if (vErrors !== null) {
          if (_errs20) {
            vErrors.length = _errs20;
          } else {
            vErrors = null;
          }
        }
      }
      if (typeof data6 === "string") {
        if (!pattern49.test(data6)) {
          const err26 = {
            instancePath: instancePath + "/costIfWrong",
            schemaPath: "#/$defs/line/pattern",
            keyword: "pattern",
            params: {
              pattern:
                "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,200}$",
            },
            message:
              'must match pattern "' +
              "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,200}$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err26];
          } else {
            vErrors.push(err26);
          }
          errors++;
        }
      } else {
        const err27 = {
          instancePath: instancePath + "/costIfWrong",
          schemaPath: "#/$defs/line/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err27];
        } else {
          vErrors.push(err27);
        }
        errors++;
      }
    }
    if (data.reversibility !== undefined) {
      let data7 = data.reversibility;
      if (!(
        data7 === "reversible" ||
        data7 === "costly" ||
        data7 === "irreversible"
      )) {
        const err28 = {
          instancePath: instancePath + "/reversibility",
          schemaPath: "#/properties/reversibility/enum",
          keyword: "enum",
          params: { allowedValues: schema90.properties.reversibility.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err28];
        } else {
          vErrors.push(err28);
        }
        errors++;
      }
    }
    if (data.uncertainty !== undefined) {
      let data8 = data.uncertainty;
      const _errs26 = errors;
      const _errs27 = errors;
      if (typeof data8 === "string") {
        if (!pattern7.test(data8)) {
          const err29 = {};
          if (vErrors === null) {
            vErrors = [err29];
          } else {
            vErrors.push(err29);
          }
          errors++;
        }
      }
      var valid10 = _errs27 === errors;
      if (valid10) {
        const err30 = {
          instancePath: instancePath + "/uncertainty",
          schemaPath: "#/$defs/line/not",
          keyword: "not",
          params: {},
          message: "must NOT be valid",
        };
        if (vErrors === null) {
          vErrors = [err30];
        } else {
          vErrors.push(err30);
        }
        errors++;
      } else {
        errors = _errs26;
        if (vErrors !== null) {
          if (_errs26) {
            vErrors.length = _errs26;
          } else {
            vErrors = null;
          }
        }
      }
      if (typeof data8 === "string") {
        if (!pattern49.test(data8)) {
          const err31 = {
            instancePath: instancePath + "/uncertainty",
            schemaPath: "#/$defs/line/pattern",
            keyword: "pattern",
            params: {
              pattern:
                "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,200}$",
            },
            message:
              'must match pattern "' +
              "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,200}$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err31];
          } else {
            vErrors.push(err31);
          }
          errors++;
        }
      } else {
        const err32 = {
          instancePath: instancePath + "/uncertainty",
          schemaPath: "#/$defs/line/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err32];
        } else {
          vErrors.push(err32);
        }
        errors++;
      }
    }
    if (data.blocked !== undefined) {
      let data9 = data.blocked;
      const _errs31 = errors;
      const _errs32 = errors;
      if (typeof data9 === "string") {
        if (!pattern7.test(data9)) {
          const err33 = {};
          if (vErrors === null) {
            vErrors = [err33];
          } else {
            vErrors.push(err33);
          }
          errors++;
        }
      }
      var valid12 = _errs32 === errors;
      if (valid12) {
        const err34 = {
          instancePath: instancePath + "/blocked",
          schemaPath: "#/$defs/line/not",
          keyword: "not",
          params: {},
          message: "must NOT be valid",
        };
        if (vErrors === null) {
          vErrors = [err34];
        } else {
          vErrors.push(err34);
        }
        errors++;
      } else {
        errors = _errs31;
        if (vErrors !== null) {
          if (_errs31) {
            vErrors.length = _errs31;
          } else {
            vErrors = null;
          }
        }
      }
      if (typeof data9 === "string") {
        if (!pattern49.test(data9)) {
          const err35 = {
            instancePath: instancePath + "/blocked",
            schemaPath: "#/$defs/line/pattern",
            keyword: "pattern",
            params: {
              pattern:
                "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,200}$",
            },
            message:
              'must match pattern "' +
              "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,200}$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err35];
          } else {
            vErrors.push(err35);
          }
          errors++;
        }
      } else {
        const err36 = {
          instancePath: instancePath + "/blocked",
          schemaPath: "#/$defs/line/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err36];
        } else {
          vErrors.push(err36);
        }
        errors++;
      }
    }
    if (data.concepts !== undefined) {
      let data10 = data.concepts;
      if (Array.isArray(data10)) {
        if (data10.length > 64) {
          const err37 = {
            instancePath: instancePath + "/concepts",
            schemaPath: "#/properties/concepts/maxItems",
            keyword: "maxItems",
            params: { limit: 64 },
            message: "must NOT have more than 64 items",
          };
          if (vErrors === null) {
            vErrors = [err37];
          } else {
            vErrors.push(err37);
          }
          errors++;
        }
        const len1 = data10.length;
        for (let i1 = 0; i1 < len1; i1++) {
          let data11 = data10[i1];
          if (typeof data11 === "string") {
            if (!pattern58.test(data11)) {
              const err38 = {
                instancePath: instancePath + "/concepts/" + i1,
                schemaPath: "#/$defs/conceptSlug/pattern",
                keyword: "pattern",
                params: { pattern: "^[a-z0-9][a-z0-9-]{0,63}$" },
                message:
                  'must match pattern "' + "^[a-z0-9][a-z0-9-]{0,63}$" + '"',
              };
              if (vErrors === null) {
                vErrors = [err38];
              } else {
                vErrors.push(err38);
              }
              errors++;
            }
          } else {
            const err39 = {
              instancePath: instancePath + "/concepts/" + i1,
              schemaPath: "#/$defs/conceptSlug/type",
              keyword: "type",
              params: { type: "string" },
              message: "must be string",
            };
            if (vErrors === null) {
              vErrors = [err39];
            } else {
              vErrors.push(err39);
            }
            errors++;
          }
        }
      } else {
        const err40 = {
          instancePath: instancePath + "/concepts",
          schemaPath: "#/properties/concepts/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err40];
        } else {
          vErrors.push(err40);
        }
        errors++;
      }
    }
    if (data.proposedFootprint !== undefined) {
      let data12 = data.proposedFootprint;
      if (Array.isArray(data12)) {
        if (data12.length > 1024) {
          const err41 = {
            instancePath: instancePath + "/proposedFootprint",
            schemaPath: "#/properties/proposedFootprint/maxItems",
            keyword: "maxItems",
            params: { limit: 1024 },
            message: "must NOT have more than 1024 items",
          };
          if (vErrors === null) {
            vErrors = [err41];
          } else {
            vErrors.push(err41);
          }
          errors++;
        }
        const len2 = data12.length;
        for (let i2 = 0; i2 < len2; i2++) {
          let data13 = data12[i2];
          if (typeof data13 === "string") {
            if (!pattern19.test(data13)) {
              const err42 = {
                instancePath: instancePath + "/proposedFootprint/" + i2,
                schemaPath: "#/$defs/artifactId/pattern",
                keyword: "pattern",
                params: {
                  pattern: "^artifact-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$",
                },
                message:
                  'must match pattern "' +
                  "^artifact-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$" +
                  '"',
              };
              if (vErrors === null) {
                vErrors = [err42];
              } else {
                vErrors.push(err42);
              }
              errors++;
            }
          } else {
            const err43 = {
              instancePath: instancePath + "/proposedFootprint/" + i2,
              schemaPath: "#/$defs/artifactId/type",
              keyword: "type",
              params: { type: "string" },
              message: "must be string",
            };
            if (vErrors === null) {
              vErrors = [err43];
            } else {
              vErrors.push(err43);
            }
            errors++;
          }
        }
      } else {
        const err44 = {
          instancePath: instancePath + "/proposedFootprint",
          schemaPath: "#/properties/proposedFootprint/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err44];
        } else {
          vErrors.push(err44);
        }
        errors++;
      }
    }
  } else {
    const err45 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err45];
    } else {
      vErrors.push(err45);
    }
    errors++;
  }
  validate43.errors = vErrors;
  return errors === 0;
}
validate43.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
function validate34(
  data,
  {
    instancePath = "",
    parentData,
    parentDataProperty,
    rootData = data,
    dynamicAnchors = {},
  } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate34.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.id === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "id" },
        message: "must have required property '" + "id" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.kind === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "kind" },
        message: "must have required property '" + "kind" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.ring === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "ring" },
        message: "must have required property '" + "ring" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.createdAt === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "createdAt" },
        message: "must have required property '" + "createdAt" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.createdSeq === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "createdSeq" },
        message: "must have required property '" + "createdSeq" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.authority === undefined) {
      const err5 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "authority" },
        message: "must have required property '" + "authority" + "'",
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.taskId === undefined) {
      const err6 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "taskId" },
        message: "must have required property '" + "taskId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.runId === undefined) {
      const err7 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "runId" },
        message: "must have required property '" + "runId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.signalIds === undefined) {
      const err8 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "signalIds" },
        message: "must have required property '" + "signalIds" + "'",
      };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    if (data.footprint === undefined) {
      const err9 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "footprint" },
        message: "must have required property '" + "footprint" + "'",
      };
      if (vErrors === null) {
        vErrors = [err9];
      } else {
        vErrors.push(err9);
      }
      errors++;
    }
    if (data.outcomes === undefined) {
      const err10 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "outcomes" },
        message: "must have required property '" + "outcomes" + "'",
      };
      if (vErrors === null) {
        vErrors = [err10];
      } else {
        vErrors.push(err10);
      }
      errors++;
    }
    if (data.class === undefined) {
      const err11 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "class" },
        message: "must have required property '" + "class" + "'",
      };
      if (vErrors === null) {
        vErrors = [err11];
      } else {
        vErrors.push(err11);
      }
      errors++;
    }
    if (data.source === undefined) {
      const err12 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "source" },
        message: "must have required property '" + "source" + "'",
      };
      if (vErrors === null) {
        vErrors = [err12];
      } else {
        vErrors.push(err12);
      }
      errors++;
    }
    if (data.status === undefined) {
      const err13 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "status" },
        message: "must have required property '" + "status" + "'",
      };
      if (vErrors === null) {
        vErrors = [err13];
      } else {
        vErrors.push(err13);
      }
      errors++;
    }
    if (data.brief === undefined) {
      const err14 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "brief" },
        message: "must have required property '" + "brief" + "'",
      };
      if (vErrors === null) {
        vErrors = [err14];
      } else {
        vErrors.push(err14);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func1.call(schema73.properties, key0)) {
        const err15 = {
          instancePath,
          schemaPath: "#/additionalProperties",
          keyword: "additionalProperties",
          params: { additionalProperty: key0 },
          message: "must NOT have additional properties",
        };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    if (data.id !== undefined) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (!pattern29.test(data0)) {
          const err16 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/$defs/decisionId/pattern",
            keyword: "pattern",
            params: { pattern: "^decision-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$" },
            message:
              'must match pattern "' +
              "^decision-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
      } else {
        const err17 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/$defs/decisionId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
    }
    if (data.kind !== undefined) {
      if ("decision" !== data.kind) {
        const err18 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "decision" },
          message: "must be equal to constant",
        };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      }
    }
    if (data.ring !== undefined) {
      if (0 !== data.ring) {
        const err19 = {
          instancePath: instancePath + "/ring",
          schemaPath: "#/properties/ring/const",
          keyword: "const",
          params: { allowedValue: 0 },
          message: "must be equal to constant",
        };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
    }
    if (data.createdAt !== undefined) {
      let data3 = data.createdAt;
      if (typeof data3 === "string") {
        if (!pattern5.test(data3)) {
          const err20 = {
            instancePath: instancePath + "/createdAt",
            schemaPath: "#/$defs/at/pattern",
            keyword: "pattern",
            params: {
              pattern:
                "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$",
            },
            message:
              'must match pattern "' +
              "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        }
      } else {
        const err21 = {
          instancePath: instancePath + "/createdAt",
          schemaPath: "#/$defs/at/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err21];
        } else {
          vErrors.push(err21);
        }
        errors++;
      }
    }
    if (data.createdSeq !== undefined) {
      let data4 = data.createdSeq;
      if (!(
        typeof data4 == "number" &&
        !(data4 % 1) &&
        !isNaN(data4) &&
        isFinite(data4)
      )) {
        const err22 = {
          instancePath: instancePath + "/createdSeq",
          schemaPath: "#/$defs/seq/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      }
      if (typeof data4 == "number" && isFinite(data4)) {
        if (data4 > 9007199254740991 || isNaN(data4)) {
          const err23 = {
            instancePath: instancePath + "/createdSeq",
            schemaPath: "#/$defs/seq/maximum",
            keyword: "maximum",
            params: { comparison: "<=", limit: 9007199254740991 },
            message: "must be <= 9007199254740991",
          };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
        if (data4 < 0 || isNaN(data4)) {
          const err24 = {
            instancePath: instancePath + "/createdSeq",
            schemaPath: "#/$defs/seq/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
      }
    }
    if (data.authority !== undefined) {
      if ("owner" !== data.authority) {
        const err25 = {
          instancePath: instancePath + "/authority",
          schemaPath: "#/properties/authority/const",
          keyword: "const",
          params: { allowedValue: "owner" },
          message: "must be equal to constant",
        };
        if (vErrors === null) {
          vErrors = [err25];
        } else {
          vErrors.push(err25);
        }
        errors++;
      }
    }
    if (data.taskId !== undefined) {
      let data6 = data.taskId;
      if (typeof data6 === "string") {
        if (!pattern4.test(data6)) {
          const err26 = {
            instancePath: instancePath + "/taskId",
            schemaPath: "#/$defs/taskId/pattern",
            keyword: "pattern",
            params: { pattern: "^task-[A-Za-z0-9][A-Za-z0-9_-]{0,122}$" },
            message:
              'must match pattern "' +
              "^task-[A-Za-z0-9][A-Za-z0-9_-]{0,122}$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err26];
          } else {
            vErrors.push(err26);
          }
          errors++;
        }
      } else {
        const err27 = {
          instancePath: instancePath + "/taskId",
          schemaPath: "#/$defs/taskId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err27];
        } else {
          vErrors.push(err27);
        }
        errors++;
      }
    }
    if (data.runId !== undefined) {
      let data7 = data.runId;
      if (typeof data7 === "string") {
        if (!pattern11.test(data7)) {
          const err28 = {
            instancePath: instancePath + "/runId",
            schemaPath: "#/$defs/runId/pattern",
            keyword: "pattern",
            params: { pattern: "^run-[A-Za-z0-9][A-Za-z0-9_-]{0,123}$" },
            message:
              'must match pattern "' +
              "^run-[A-Za-z0-9][A-Za-z0-9_-]{0,123}$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err28];
          } else {
            vErrors.push(err28);
          }
          errors++;
        }
      } else {
        const err29 = {
          instancePath: instancePath + "/runId",
          schemaPath: "#/$defs/runId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err29];
        } else {
          vErrors.push(err29);
        }
        errors++;
      }
    }
    if (data.signalIds !== undefined) {
      if (
        !validate35(data.signalIds, {
          instancePath: instancePath + "/signalIds",
          parentData: data,
          parentDataProperty: "signalIds",
          rootData,
          dynamicAnchors,
        })
      ) {
        vErrors =
          vErrors === null
            ? validate35.errors
            : vErrors.concat(validate35.errors);
        errors = vErrors.length;
      }
    }
    if (data.footprint !== undefined) {
      if (
        !validate37(data.footprint, {
          instancePath: instancePath + "/footprint",
          parentData: data,
          parentDataProperty: "footprint",
          rootData,
          dynamicAnchors,
        })
      ) {
        vErrors =
          vErrors === null
            ? validate37.errors
            : vErrors.concat(validate37.errors);
        errors = vErrors.length;
      }
    }
    if (data.outcomes !== undefined) {
      if (
        !validate39(data.outcomes, {
          instancePath: instancePath + "/outcomes",
          parentData: data,
          parentDataProperty: "outcomes",
          rootData,
          dynamicAnchors,
        })
      ) {
        vErrors =
          vErrors === null
            ? validate39.errors
            : vErrors.concat(validate39.errors);
        errors = vErrors.length;
      }
    }
    if (data.class !== undefined) {
      let data11 = data.class;
      if (!(
        data11 === "architecture" ||
        data11 === "scope" ||
        data11 === "technology"
      )) {
        const err30 = {
          instancePath: instancePath + "/class",
          schemaPath: "#/$defs/decisionClass/enum",
          keyword: "enum",
          params: { allowedValues: schema89.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err30];
        } else {
          vErrors.push(err30);
        }
        errors++;
      }
    }
    if (data.source !== undefined) {
      let data12 = data.source;
      if (!(data12 === "plan" || data12 === "floor" || data12 === "selfFlag")) {
        const err31 = {
          instancePath: instancePath + "/source",
          schemaPath: "#/properties/source/enum",
          keyword: "enum",
          params: { allowedValues: schema73.properties.source.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err31];
        } else {
          vErrors.push(err31);
        }
        errors++;
      }
    }
    if (data.status !== undefined) {
      let data13 = data.status;
      if (!(data13 === "pending" || data13 === "resolved")) {
        const err32 = {
          instancePath: instancePath + "/status",
          schemaPath: "#/properties/status/enum",
          keyword: "enum",
          params: { allowedValues: schema73.properties.status.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err32];
        } else {
          vErrors.push(err32);
        }
        errors++;
      }
    }
    if (data.brief !== undefined) {
      if (
        !validate43(data.brief, {
          instancePath: instancePath + "/brief",
          parentData: data,
          parentDataProperty: "brief",
          rootData,
          dynamicAnchors,
        })
      ) {
        vErrors =
          vErrors === null
            ? validate43.errors
            : vErrors.concat(validate43.errors);
        errors = vErrors.length;
      }
    }
  } else {
    const err33 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err33];
    } else {
      vErrors.push(err33);
    }
    errors++;
  }
  validate34.errors = vErrors;
  return errors === 0;
}
validate34.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
const schema102 = {
  title: "RulingRecord",
  description:
    "A delegated call the harness decided and recorded as a Ruling (03 Delegated authority, Q53, Q61); it has no brief and no owner-written field.",
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "kind",
    "ring",
    "createdAt",
    "createdSeq",
    "authority",
    "taskId",
    "runId",
    "signalIds",
    "footprint",
    "outcomes",
    "class",
    "source",
    "status",
    "ruling",
  ],
  properties: {
    id: { $ref: "#/$defs/decisionId" },
    kind: { const: "decision" },
    ring: {
      description:
        "The ring of the store that owns the object (05 Rings): the ledger is Ring 0.",
      const: 0,
    },
    createdAt: { $ref: "#/$defs/at" },
    createdSeq: { $ref: "#/$defs/seq" },
    authority: { description: "Who decided: the harness.", const: "harness" },
    taskId: {
      $ref: "#/$defs/taskId",
      description:
        "The task the decision belongs to (typed link task→decision).",
    },
    runId: {
      $ref: "#/$defs/runId",
      description: "The run that opened the decision.",
    },
    signalIds: { $ref: "#/$defs/signalIds" },
    footprint: { $ref: "#/$defs/footprint" },
    outcomes: { $ref: "#/$defs/outcomes" },
    class: {
      description:
        "The owned class of the call, or `null` when the call is outside the owned classes, such as intake (OD-2).",
      oneOf: [{ type: "null" }, { $ref: "#/$defs/decisionClass" }],
    },
    source: {
      description:
        "What raised the call: the plan-time pass, a floor signal under the brief threshold, or intake (Q53, Q54, Q-B5-2).",
      enum: ["plan", "floor", "intake"],
    },
    status: {
      description:
        "A Ruling is resolved when it is recorded, because the harness made the call.",
      const: "resolved",
    },
    ruling: { $ref: "#/$defs/rulingBody" },
  },
};
const schema109 = {
  title: "Ruling",
  description:
    "What the harness decided, why, the cost if wrong and the version of the rubric that routed the call (03 Delegated authority, Q53).",
  type: "object",
  additionalProperties: false,
  required: ["what", "why", "costIfWrong", "rubricVersion"],
  properties: {
    what: {
      $ref: "#/$defs/line",
      description:
        "What the harness decided, as one line of at most 200 code points.",
    },
    why: {
      $ref: "#/$defs/text",
      description:
        "Why the harness decided it, not blank, at most 8192 code points.",
    },
    costIfWrong: {
      $ref: "#/$defs/line",
      description:
        "The cost if the call is wrong, as one line of at most 200 code points. An intake Ruling's comes from a fixed table keyed by its rubric version.",
    },
    rubricVersion: { $ref: "#/$defs/rubricVersion" },
  },
};
const schema113 = {
  description:
    "The version of the rubric that routed the call, such as `intake-rubric-1` or `materiality-rubric-1`.",
  $comment: "The intake branch is intake-event.schema.json's `rubricVersion`.",
  type: "string",
  pattern: "^(?:intake|materiality)-rubric-[1-9][0-9]{0,5}$",
};
const pattern70 = new RegExp(
  "^(?:intake|materiality)-rubric-[1-9][0-9]{0,5}$",
  "u",
);
function validate52(
  data,
  {
    instancePath = "",
    parentData,
    parentDataProperty,
    rootData = data,
    dynamicAnchors = {},
  } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate52.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.what === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "what" },
        message: "must have required property '" + "what" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.why === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "why" },
        message: "must have required property '" + "why" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.costIfWrong === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "costIfWrong" },
        message: "must have required property '" + "costIfWrong" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.rubricVersion === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "rubricVersion" },
        message: "must have required property '" + "rubricVersion" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(
        key0 === "what" ||
        key0 === "why" ||
        key0 === "costIfWrong" ||
        key0 === "rubricVersion"
      )) {
        const err4 = {
          instancePath,
          schemaPath: "#/additionalProperties",
          keyword: "additionalProperties",
          params: { additionalProperty: key0 },
          message: "must NOT have additional properties",
        };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
    }
    if (data.what !== undefined) {
      let data0 = data.what;
      const _errs5 = errors;
      const _errs6 = errors;
      if (typeof data0 === "string") {
        if (!pattern7.test(data0)) {
          const err5 = {};
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
      var valid2 = _errs6 === errors;
      if (valid2) {
        const err6 = {
          instancePath: instancePath + "/what",
          schemaPath: "#/$defs/line/not",
          keyword: "not",
          params: {},
          message: "must NOT be valid",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      } else {
        errors = _errs5;
        if (vErrors !== null) {
          if (_errs5) {
            vErrors.length = _errs5;
          } else {
            vErrors = null;
          }
        }
      }
      if (typeof data0 === "string") {
        if (!pattern49.test(data0)) {
          const err7 = {
            instancePath: instancePath + "/what",
            schemaPath: "#/$defs/line/pattern",
            keyword: "pattern",
            params: {
              pattern:
                "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,200}$",
            },
            message:
              'must match pattern "' +
              "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,200}$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      } else {
        const err8 = {
          instancePath: instancePath + "/what",
          schemaPath: "#/$defs/line/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.why !== undefined) {
      let data1 = data.why;
      const _errs10 = errors;
      const _errs11 = errors;
      if (typeof data1 === "string") {
        if (!pattern7.test(data1)) {
          const err9 = {};
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
      }
      var valid4 = _errs11 === errors;
      if (valid4) {
        const err10 = {
          instancePath: instancePath + "/why",
          schemaPath: "#/$defs/text/not",
          keyword: "not",
          params: {},
          message: "must NOT be valid",
        };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      } else {
        errors = _errs10;
        if (vErrors !== null) {
          if (_errs10) {
            vErrors.length = _errs10;
          } else {
            vErrors = null;
          }
        }
      }
      if (typeof data1 === "string") {
        if (!pattern8.test(data1)) {
          const err11 = {
            instancePath: instancePath + "/why",
            schemaPath: "#/$defs/text/pattern",
            keyword: "pattern",
            params: {
              pattern:
                "^[^\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,8192}$",
            },
            message:
              'must match pattern "' +
              "^[^\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,8192}$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
      } else {
        const err12 = {
          instancePath: instancePath + "/why",
          schemaPath: "#/$defs/text/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.costIfWrong !== undefined) {
      let data2 = data.costIfWrong;
      const _errs15 = errors;
      const _errs16 = errors;
      if (typeof data2 === "string") {
        if (!pattern7.test(data2)) {
          const err13 = {};
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
      }
      var valid6 = _errs16 === errors;
      if (valid6) {
        const err14 = {
          instancePath: instancePath + "/costIfWrong",
          schemaPath: "#/$defs/line/not",
          keyword: "not",
          params: {},
          message: "must NOT be valid",
        };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      } else {
        errors = _errs15;
        if (vErrors !== null) {
          if (_errs15) {
            vErrors.length = _errs15;
          } else {
            vErrors = null;
          }
        }
      }
      if (typeof data2 === "string") {
        if (!pattern49.test(data2)) {
          const err15 = {
            instancePath: instancePath + "/costIfWrong",
            schemaPath: "#/$defs/line/pattern",
            keyword: "pattern",
            params: {
              pattern:
                "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,200}$",
            },
            message:
              'must match pattern "' +
              "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,200}$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
      } else {
        const err16 = {
          instancePath: instancePath + "/costIfWrong",
          schemaPath: "#/$defs/line/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
    }
    if (data.rubricVersion !== undefined) {
      let data3 = data.rubricVersion;
      if (typeof data3 === "string") {
        if (!pattern70.test(data3)) {
          const err17 = {
            instancePath: instancePath + "/rubricVersion",
            schemaPath: "#/$defs/rubricVersion/pattern",
            keyword: "pattern",
            params: {
              pattern: "^(?:intake|materiality)-rubric-[1-9][0-9]{0,5}$",
            },
            message:
              'must match pattern "' +
              "^(?:intake|materiality)-rubric-[1-9][0-9]{0,5}$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        }
      } else {
        const err18 = {
          instancePath: instancePath + "/rubricVersion",
          schemaPath: "#/$defs/rubricVersion/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      }
    }
  } else {
    const err19 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err19];
    } else {
      vErrors.push(err19);
    }
    errors++;
  }
  validate52.errors = vErrors;
  return errors === 0;
}
validate52.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
function validate48(
  data,
  {
    instancePath = "",
    parentData,
    parentDataProperty,
    rootData = data,
    dynamicAnchors = {},
  } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate48.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.id === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "id" },
        message: "must have required property '" + "id" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.kind === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "kind" },
        message: "must have required property '" + "kind" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.ring === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "ring" },
        message: "must have required property '" + "ring" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.createdAt === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "createdAt" },
        message: "must have required property '" + "createdAt" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.createdSeq === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "createdSeq" },
        message: "must have required property '" + "createdSeq" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.authority === undefined) {
      const err5 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "authority" },
        message: "must have required property '" + "authority" + "'",
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.taskId === undefined) {
      const err6 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "taskId" },
        message: "must have required property '" + "taskId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.runId === undefined) {
      const err7 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "runId" },
        message: "must have required property '" + "runId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.signalIds === undefined) {
      const err8 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "signalIds" },
        message: "must have required property '" + "signalIds" + "'",
      };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    if (data.footprint === undefined) {
      const err9 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "footprint" },
        message: "must have required property '" + "footprint" + "'",
      };
      if (vErrors === null) {
        vErrors = [err9];
      } else {
        vErrors.push(err9);
      }
      errors++;
    }
    if (data.outcomes === undefined) {
      const err10 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "outcomes" },
        message: "must have required property '" + "outcomes" + "'",
      };
      if (vErrors === null) {
        vErrors = [err10];
      } else {
        vErrors.push(err10);
      }
      errors++;
    }
    if (data.class === undefined) {
      const err11 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "class" },
        message: "must have required property '" + "class" + "'",
      };
      if (vErrors === null) {
        vErrors = [err11];
      } else {
        vErrors.push(err11);
      }
      errors++;
    }
    if (data.source === undefined) {
      const err12 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "source" },
        message: "must have required property '" + "source" + "'",
      };
      if (vErrors === null) {
        vErrors = [err12];
      } else {
        vErrors.push(err12);
      }
      errors++;
    }
    if (data.status === undefined) {
      const err13 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "status" },
        message: "must have required property '" + "status" + "'",
      };
      if (vErrors === null) {
        vErrors = [err13];
      } else {
        vErrors.push(err13);
      }
      errors++;
    }
    if (data.ruling === undefined) {
      const err14 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "ruling" },
        message: "must have required property '" + "ruling" + "'",
      };
      if (vErrors === null) {
        vErrors = [err14];
      } else {
        vErrors.push(err14);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func1.call(schema102.properties, key0)) {
        const err15 = {
          instancePath,
          schemaPath: "#/additionalProperties",
          keyword: "additionalProperties",
          params: { additionalProperty: key0 },
          message: "must NOT have additional properties",
        };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    if (data.id !== undefined) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (!pattern29.test(data0)) {
          const err16 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/$defs/decisionId/pattern",
            keyword: "pattern",
            params: { pattern: "^decision-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$" },
            message:
              'must match pattern "' +
              "^decision-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
      } else {
        const err17 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/$defs/decisionId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
    }
    if (data.kind !== undefined) {
      if ("decision" !== data.kind) {
        const err18 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "decision" },
          message: "must be equal to constant",
        };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      }
    }
    if (data.ring !== undefined) {
      if (0 !== data.ring) {
        const err19 = {
          instancePath: instancePath + "/ring",
          schemaPath: "#/properties/ring/const",
          keyword: "const",
          params: { allowedValue: 0 },
          message: "must be equal to constant",
        };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
    }
    if (data.createdAt !== undefined) {
      let data3 = data.createdAt;
      if (typeof data3 === "string") {
        if (!pattern5.test(data3)) {
          const err20 = {
            instancePath: instancePath + "/createdAt",
            schemaPath: "#/$defs/at/pattern",
            keyword: "pattern",
            params: {
              pattern:
                "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$",
            },
            message:
              'must match pattern "' +
              "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        }
      } else {
        const err21 = {
          instancePath: instancePath + "/createdAt",
          schemaPath: "#/$defs/at/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err21];
        } else {
          vErrors.push(err21);
        }
        errors++;
      }
    }
    if (data.createdSeq !== undefined) {
      let data4 = data.createdSeq;
      if (!(
        typeof data4 == "number" &&
        !(data4 % 1) &&
        !isNaN(data4) &&
        isFinite(data4)
      )) {
        const err22 = {
          instancePath: instancePath + "/createdSeq",
          schemaPath: "#/$defs/seq/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      }
      if (typeof data4 == "number" && isFinite(data4)) {
        if (data4 > 9007199254740991 || isNaN(data4)) {
          const err23 = {
            instancePath: instancePath + "/createdSeq",
            schemaPath: "#/$defs/seq/maximum",
            keyword: "maximum",
            params: { comparison: "<=", limit: 9007199254740991 },
            message: "must be <= 9007199254740991",
          };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
        if (data4 < 0 || isNaN(data4)) {
          const err24 = {
            instancePath: instancePath + "/createdSeq",
            schemaPath: "#/$defs/seq/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
      }
    }
    if (data.authority !== undefined) {
      if ("harness" !== data.authority) {
        const err25 = {
          instancePath: instancePath + "/authority",
          schemaPath: "#/properties/authority/const",
          keyword: "const",
          params: { allowedValue: "harness" },
          message: "must be equal to constant",
        };
        if (vErrors === null) {
          vErrors = [err25];
        } else {
          vErrors.push(err25);
        }
        errors++;
      }
    }
    if (data.taskId !== undefined) {
      let data6 = data.taskId;
      if (typeof data6 === "string") {
        if (!pattern4.test(data6)) {
          const err26 = {
            instancePath: instancePath + "/taskId",
            schemaPath: "#/$defs/taskId/pattern",
            keyword: "pattern",
            params: { pattern: "^task-[A-Za-z0-9][A-Za-z0-9_-]{0,122}$" },
            message:
              'must match pattern "' +
              "^task-[A-Za-z0-9][A-Za-z0-9_-]{0,122}$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err26];
          } else {
            vErrors.push(err26);
          }
          errors++;
        }
      } else {
        const err27 = {
          instancePath: instancePath + "/taskId",
          schemaPath: "#/$defs/taskId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err27];
        } else {
          vErrors.push(err27);
        }
        errors++;
      }
    }
    if (data.runId !== undefined) {
      let data7 = data.runId;
      if (typeof data7 === "string") {
        if (!pattern11.test(data7)) {
          const err28 = {
            instancePath: instancePath + "/runId",
            schemaPath: "#/$defs/runId/pattern",
            keyword: "pattern",
            params: { pattern: "^run-[A-Za-z0-9][A-Za-z0-9_-]{0,123}$" },
            message:
              'must match pattern "' +
              "^run-[A-Za-z0-9][A-Za-z0-9_-]{0,123}$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err28];
          } else {
            vErrors.push(err28);
          }
          errors++;
        }
      } else {
        const err29 = {
          instancePath: instancePath + "/runId",
          schemaPath: "#/$defs/runId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err29];
        } else {
          vErrors.push(err29);
        }
        errors++;
      }
    }
    if (data.signalIds !== undefined) {
      if (
        !validate35(data.signalIds, {
          instancePath: instancePath + "/signalIds",
          parentData: data,
          parentDataProperty: "signalIds",
          rootData,
          dynamicAnchors,
        })
      ) {
        vErrors =
          vErrors === null
            ? validate35.errors
            : vErrors.concat(validate35.errors);
        errors = vErrors.length;
      }
    }
    if (data.footprint !== undefined) {
      if (
        !validate37(data.footprint, {
          instancePath: instancePath + "/footprint",
          parentData: data,
          parentDataProperty: "footprint",
          rootData,
          dynamicAnchors,
        })
      ) {
        vErrors =
          vErrors === null
            ? validate37.errors
            : vErrors.concat(validate37.errors);
        errors = vErrors.length;
      }
    }
    if (data.outcomes !== undefined) {
      if (
        !validate39(data.outcomes, {
          instancePath: instancePath + "/outcomes",
          parentData: data,
          parentDataProperty: "outcomes",
          rootData,
          dynamicAnchors,
        })
      ) {
        vErrors =
          vErrors === null
            ? validate39.errors
            : vErrors.concat(validate39.errors);
        errors = vErrors.length;
      }
    }
    if (data.class !== undefined) {
      let data11 = data.class;
      const _errs25 = errors;
      let valid6 = false;
      let passing0 = null;
      const _errs26 = errors;
      if (data11 !== null) {
        const err30 = {
          instancePath: instancePath + "/class",
          schemaPath: "#/properties/class/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err30];
        } else {
          vErrors.push(err30);
        }
        errors++;
      }
      var _valid0 = _errs26 === errors;
      if (_valid0) {
        valid6 = true;
        passing0 = 0;
      }
      const _errs28 = errors;
      if (!(
        data11 === "architecture" ||
        data11 === "scope" ||
        data11 === "technology"
      )) {
        const err31 = {
          instancePath: instancePath + "/class",
          schemaPath: "#/$defs/decisionClass/enum",
          keyword: "enum",
          params: { allowedValues: schema89.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err31];
        } else {
          vErrors.push(err31);
        }
        errors++;
      }
      var _valid0 = _errs28 === errors;
      if (_valid0 && valid6) {
        valid6 = false;
        passing0 = [passing0, 1];
      } else {
        if (_valid0) {
          valid6 = true;
          passing0 = 1;
        }
      }
      if (!valid6) {
        const err32 = {
          instancePath: instancePath + "/class",
          schemaPath: "#/properties/class/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing0 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err32];
        } else {
          vErrors.push(err32);
        }
        errors++;
      } else {
        errors = _errs25;
        if (vErrors !== null) {
          if (_errs25) {
            vErrors.length = _errs25;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.source !== undefined) {
      let data12 = data.source;
      if (!(data12 === "plan" || data12 === "floor" || data12 === "intake")) {
        const err33 = {
          instancePath: instancePath + "/source",
          schemaPath: "#/properties/source/enum",
          keyword: "enum",
          params: { allowedValues: schema102.properties.source.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err33];
        } else {
          vErrors.push(err33);
        }
        errors++;
      }
    }
    if (data.status !== undefined) {
      if ("resolved" !== data.status) {
        const err34 = {
          instancePath: instancePath + "/status",
          schemaPath: "#/properties/status/const",
          keyword: "const",
          params: { allowedValue: "resolved" },
          message: "must be equal to constant",
        };
        if (vErrors === null) {
          vErrors = [err34];
        } else {
          vErrors.push(err34);
        }
        errors++;
      }
    }
    if (data.ruling !== undefined) {
      if (
        !validate52(data.ruling, {
          instancePath: instancePath + "/ruling",
          parentData: data,
          parentDataProperty: "ruling",
          rootData,
          dynamicAnchors,
        })
      ) {
        vErrors =
          vErrors === null
            ? validate52.errors
            : vErrors.concat(validate52.errors);
        errors = vErrors.length;
      }
    }
  } else {
    const err35 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err35];
    } else {
      vErrors.push(err35);
    }
    errors++;
  }
  validate48.errors = vErrors;
  return errors === 0;
}
validate48.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
function validate33(
  data,
  {
    instancePath = "",
    parentData,
    parentDataProperty,
    rootData = data,
    dynamicAnchors = {},
  } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate33.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (
    !validate34(data, {
      instancePath,
      parentData,
      parentDataProperty,
      rootData,
      dynamicAnchors,
    })
  ) {
    vErrors =
      vErrors === null ? validate34.errors : vErrors.concat(validate34.errors);
    errors = vErrors.length;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
    var props0 = true;
  }
  const _errs2 = errors;
  if (
    !validate48(data, {
      instancePath,
      parentData,
      parentDataProperty,
      rootData,
      dynamicAnchors,
    })
  ) {
    vErrors =
      vErrors === null ? validate48.errors : vErrors.concat(validate48.errors);
    errors = vErrors.length;
  }
  var _valid0 = _errs2 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
      if (props0 !== true) {
        props0 = true;
      }
    }
  }
  if (!valid0) {
    const err0 = {
      instancePath,
      schemaPath: "#/oneOf",
      keyword: "oneOf",
      params: { passingSchemas: passing0 },
      message: "must match exactly one schema in oneOf",
    };
    if (vErrors === null) {
      vErrors = [err0];
    } else {
      vErrors.push(err0);
    }
    errors++;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate33.errors = vErrors;
  evaluated0.props = props0;
  return errors === 0;
}
validate33.evaluated = { dynamicProps: true, dynamicItems: false };
function validate20(
  data,
  {
    instancePath = "",
    parentData,
    parentDataProperty,
    rootData = data,
    dynamicAnchors = {},
  } = {},
) {
  /*# sourceURL="https://github.com/shaangill025/helmwright/schemas/objects.schema.json" */ let vErrors =
    null;
  let errors = 0;
  const evaluated0 = validate20.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (!(data && typeof data == "object" && !Array.isArray(data))) {
    const err0 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err0];
    } else {
      vErrors.push(err0);
    }
    errors++;
  }
  const _errs1 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs2 = errors;
  if (
    !validate21(data, {
      instancePath,
      parentData,
      parentDataProperty,
      rootData,
      dynamicAnchors,
    })
  ) {
    vErrors =
      vErrors === null ? validate21.errors : vErrors.concat(validate21.errors);
    errors = vErrors.length;
  }
  var _valid0 = _errs2 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
    var props0 = true;
  }
  const _errs3 = errors;
  if (
    !validate23(data, {
      instancePath,
      parentData,
      parentDataProperty,
      rootData,
      dynamicAnchors,
    })
  ) {
    vErrors =
      vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
    errors = vErrors.length;
  }
  var _valid0 = _errs3 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
      if (props0 !== true) {
        props0 = true;
      }
    }
    const _errs4 = errors;
    if (
      !validate27(data, {
        instancePath,
        parentData,
        parentDataProperty,
        rootData,
        dynamicAnchors,
      })
    ) {
      vErrors =
        vErrors === null
          ? validate27.errors
          : vErrors.concat(validate27.errors);
      errors = vErrors.length;
    }
    var _valid0 = _errs4 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
        if (props0 !== true) {
          props0 = true;
        }
      }
      const _errs5 = errors;
      if (
        !validate29(data, {
          instancePath,
          parentData,
          parentDataProperty,
          rootData,
          dynamicAnchors,
        })
      ) {
        vErrors =
          vErrors === null
            ? validate29.errors
            : vErrors.concat(validate29.errors);
        errors = vErrors.length;
      }
      var _valid0 = _errs5 === errors;
      if (_valid0 && valid0) {
        valid0 = false;
        passing0 = [passing0, 3];
      } else {
        if (_valid0) {
          valid0 = true;
          passing0 = 3;
          if (props0 !== true) {
            props0 = true;
          }
        }
        const _errs6 = errors;
        if (
          !validate31(data, {
            instancePath,
            parentData,
            parentDataProperty,
            rootData,
            dynamicAnchors,
          })
        ) {
          vErrors =
            vErrors === null
              ? validate31.errors
              : vErrors.concat(validate31.errors);
          errors = vErrors.length;
        }
        var _valid0 = _errs6 === errors;
        if (_valid0 && valid0) {
          valid0 = false;
          passing0 = [passing0, 4];
        } else {
          if (_valid0) {
            valid0 = true;
            passing0 = 4;
            if (props0 !== true) {
              props0 = true;
            }
          }
          const _errs7 = errors;
          if (
            !validate33(data, {
              instancePath,
              parentData,
              parentDataProperty,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors =
              vErrors === null
                ? validate33.errors
                : vErrors.concat(validate33.errors);
            errors = vErrors.length;
          } else {
            var props1 = validate33.evaluated.props;
          }
          var _valid0 = _errs7 === errors;
          if (_valid0 && valid0) {
            valid0 = false;
            passing0 = [passing0, 5];
          } else {
            if (_valid0) {
              valid0 = true;
              passing0 = 5;
              if (props0 !== true && props1 !== undefined) {
                if (props1 === true) {
                  props0 = true;
                } else {
                  props0 = props0 || {};
                  Object.assign(props0, props1);
                }
              }
            }
          }
        }
      }
    }
  }
  if (!valid0) {
    const err1 = {
      instancePath,
      schemaPath: "#/oneOf",
      keyword: "oneOf",
      params: { passingSchemas: passing0 },
      message: "must match exactly one schema in oneOf",
    };
    if (vErrors === null) {
      vErrors = [err1];
    } else {
      vErrors.push(err1);
    }
    errors++;
  } else {
    errors = _errs1;
    if (vErrors !== null) {
      if (_errs1) {
        vErrors.length = _errs1;
      } else {
        vErrors = null;
      }
    }
  }
  validate20.errors = vErrors;
  evaluated0.props = props0;
  return errors === 0;
}
validate20.evaluated = { dynamicProps: true, dynamicItems: false };
