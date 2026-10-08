// Generated from schemas/object-event.schema.json by scripts/generate.ts. Do not edit.
"use strict";
export const validate = validate20;
export default validate20;
const schema31 = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/shaangill025/helmwright/schemas/object-event.schema.json",
  title: "ObjectEvent",
  description:
    "Payload of an object event in the session log (B5-2, Q61), validated before it is appended and when it is read. `kind` equals the event's `type`; the writer checks that relation. A payload holds only what its writer knows: each record's `createdAt` and `createdSeq` are the envelope's `at` and `seq`, and its kind, ring and creation-time constants come from objects.schema.json, so none of them is in a payload. `decision.recommendation.revealed` (A3) and every `decision.owner.*` type (SIG) are reserved: they have no variant, so this schema rejects them. Uniqueness inside arrays, sorted scope, the footprint content address and a Ruling's null class for intake are checked by the writer, not the schema.",
  type: "object",
  oneOf: [
    { $ref: "#/$defs/taskCreated" },
    { $ref: "#/$defs/runRecorded" },
    { $ref: "#/$defs/artifactRecorded" },
    { $ref: "#/$defs/decisionOpened" },
    { $ref: "#/$defs/decisionFootprintRecorded" },
    { $ref: "#/$defs/decisionOutcomeSignalled" },
  ],
  $defs: {
    taskCreated: {
      title: "TaskCreated",
      description:
        "The harness created a Task at run start (TaskRecord): `createdAt` and `createdSeq` are the envelope's `at` and `seq`, and `status` starts `open`.",
      type: "object",
      additionalProperties: false,
      required: ["kind", "id", "repoId", "text", "scope"],
      properties: {
        kind: { const: "task.created" },
        id: { $ref: "#/$defs/taskId" },
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
            "The declared scope, sorted and unique (checked by the writer); empty when none was declared.",
          type: "array",
          maxItems: 256,
          items: { $ref: "#/$defs/scopeEntry" },
        },
      },
    },
    runRecorded: {
      title: "RunRecorded",
      description:
        "The harness recorded a Run at run start (RunRecord): the record's `id`, `graphId` and `nodeId` are the envelope's `runId`, `graphId` and `nodeId`, `createdAt` and `createdSeq` its `at` and `seq`, and `terminal` starts `null`.",
      type: "object",
      additionalProperties: false,
      required: ["kind", "taskId", "engine", "baseCommit", "class"],
      properties: {
        kind: { const: "run.recorded" },
        taskId: {
          $ref: "#/$defs/taskId",
          description: "The Task this run executes (typed link task→run).",
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
      },
    },
    artifactRecorded: {
      title: "ArtifactRecorded",
      description:
        "The harness recorded an Artifact (ArtifactRecord): `createdAt` and `createdSeq` are the envelope's `at` and `seq`. For `footprint.*` the writer checks the content address: `sha256` is the SHA-256 of the UTF-8 bytes of `JSON.stringify([type, repoId, ref])` and `id` is `artifact-<sha256>`.",
      type: "object",
      additionalProperties: false,
      required: ["kind", "id", "type", "ref", "sha256"],
      properties: {
        kind: { const: "artifact.recorded" },
        id: { $ref: "#/$defs/artifactId" },
        type: { $ref: "#/$defs/artifactType" },
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
            "For `footprint.*` the content address above; otherwise the SHA-256 of the stored content.",
        },
        runId: {
          $ref: "#/$defs/runId",
          description:
            "The run that produced it, when one did; footprints and expansions may be recorded outside a run (A1, A7, C2).",
        },
      },
      $comment:
        "`if` and `then` are copies of objects.schema.json's `artifact` `if` and `then`.",
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
    decisionOpened: {
      title: "DecisionOpened",
      description:
        "The harness opened a ledger entry: an owned decision with its brief, or a Ruling, which is the variant with authority harness, a ruling body and no brief.",
      oneOf: [
        { $ref: "#/$defs/decisionOpenedOwned" },
        { $ref: "#/$defs/decisionOpenedRuling" },
      ],
    },
    decisionOpenedOwned: {
      title: "DecisionOpenedOwned",
      description:
        "The harness opened a decision in an owned class with its brief (OwnedDecisionRecord): `createdAt` and `createdSeq` are the envelope's `at` and `seq`, `footprint` and `outcomes` start empty and `status` starts `pending`. Owner-written fields arrive with SIG, A3, A1 and A7.",
      type: "object",
      additionalProperties: false,
      required: [
        "kind",
        "id",
        "authority",
        "taskId",
        "runId",
        "signalIds",
        "class",
        "source",
        "brief",
      ],
      properties: {
        kind: { const: "decision.opened" },
        id: { $ref: "#/$defs/decisionId" },
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
        class: { $ref: "#/$defs/decisionClass" },
        source: {
          description:
            "What raised the decision: the plan's `decisions[]`, a floor signal over the brief threshold, or the agent's self-flag (Q45, Q53, Q54).",
          enum: ["plan", "floor", "selfFlag"],
        },
        brief: { $ref: "#/$defs/brief" },
      },
    },
    decisionOpenedRuling: {
      title: "DecisionOpenedRuling",
      description:
        "The harness recorded a Ruling (RulingRecord): `createdAt` and `createdSeq` are the envelope's `at` and `seq`, `footprint` and `outcomes` start empty and `status` is `resolved`. A Ruling has no brief and no owner-written field; with source `intake` its class is `null` (checked by the writer).",
      type: "object",
      additionalProperties: false,
      required: [
        "kind",
        "id",
        "authority",
        "taskId",
        "runId",
        "signalIds",
        "class",
        "source",
        "ruling",
      ],
      properties: {
        kind: { const: "decision.opened" },
        id: { $ref: "#/$defs/decisionId" },
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
        ruling: { $ref: "#/$defs/rulingBody" },
      },
    },
    decisionFootprintRecorded: {
      title: "DecisionFootprintRecorded",
      description:
        "The harness recorded the footprint of a decision when it closed (Q47); it sets the record's `footprint` once (checked by the writer).",
      type: "object",
      additionalProperties: false,
      required: ["kind", "decisionId", "artifactIds"],
      properties: {
        kind: { const: "decision.footprint.recorded" },
        decisionId: { $ref: "#/$defs/decisionId" },
        artifactIds: {
          description:
            "The footprint artifact IDs, unique (checked by the writer).",
          type: "array",
          minItems: 1,
          maxItems: 1024,
          items: { $ref: "#/$defs/artifactId" },
        },
      },
    },
    decisionOutcomeSignalled: {
      title: "DecisionOutcomeSignalled",
      description:
        "The harness found that a later run's diff matched a decision's footprint (Q47); it appends `{kind: \"signal\", signal, runId, artifactIds, at, seq}` to the record's `outcomes`, with the envelope's `at` and `seq`.",
      type: "object",
      additionalProperties: false,
      required: ["kind", "decisionId", "signal", "runId", "artifactIds"],
      properties: {
        kind: { const: "decision.outcome.signalled" },
        decisionId: { $ref: "#/$defs/decisionId" },
        signal: {
          description:
            "`rework`: the diff changed a symbol of a footprint file; `dependencyChanged`: it added or removed a footprint dependency (Q47).",
          $comment:
            "Copy of objects.schema.json's `outcomeSignal.properties.signal`.",
          enum: ["rework", "dependencyChanged"],
        },
        runId: {
          $ref: "#/$defs/runId",
          description: "The run whose diff matched.",
        },
        artifactIds: {
          description: "The footprint entries the diff matched.",
          $comment:
            "Copy of objects.schema.json's `outcomeSignal.properties.artifactIds`.",
          type: "array",
          minItems: 1,
          maxItems: 256,
          items: { $ref: "#/$defs/artifactId" },
        },
      },
    },
    artifactType: {
      title: "ArtifactType",
      description:
        "What the artifact is; the footprint types are the Q47 representation: files, exported symbols, dependency names and module IDs.",
      $comment: "Copy of objects.schema.json's `artifact.properties.type`.",
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
    taskId: {
      description:
        "Kind-prefixed task ID, also a valid session-log ID (at most 128 characters).",
      $comment: "Copy of objects.schema.json's `taskId`.",
      type: "string",
      pattern: "^task-[A-Za-z0-9][A-Za-z0-9_-]{0,122}$",
    },
    runId: {
      description:
        "Kind-prefixed run ID, also a valid session-log ID (at most 128 characters).",
      $comment: "Copy of objects.schema.json's `runId`.",
      type: "string",
      pattern: "^run-[A-Za-z0-9][A-Za-z0-9_-]{0,123}$",
    },
    artifactId: {
      description:
        "Kind-prefixed artifact ID, also a valid session-log ID (at most 128 characters).",
      $comment: "Copy of objects.schema.json's `artifactId`.",
      type: "string",
      pattern: "^artifact-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$",
    },
    decisionId: {
      description:
        "Kind-prefixed decision ID, also a valid session-log ID (at most 128 characters).",
      $comment: "Copy of objects.schema.json's `decisionId`.",
      type: "string",
      pattern: "^decision-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$",
    },
    repoId: {
      description:
        "Absolute realpath of a repository's common git dir: at most 4096 code points without C0 or C1 controls, format characters, line or paragraph separators or lone surrogates.",
      $comment: "Copy of objects.schema.json's `repoId`.",
      type: "string",
      pattern:
        "^/[^\\u0000-\\u001f\\u007f-\\u009f\\p{Cf}\\p{Zl}\\p{Zp}\\p{Cs}]{0,4095}$",
    },
    text: {
      description:
        "Text of 1 to 8192 code points, not only spaces; tabs and line breaks are kept, but no other control character, bidi control or lone surrogate.",
      $comment: "Copy of objects.schema.json's `text`.",
      type: "string",
      pattern:
        "^[^\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,8192}$",
      not: { pattern: "^\\s*$" },
    },
    displayText: {
      description:
        "Escaped display text: 1 to 8192 code points without C0 or C1 controls, format characters, line or paragraph separators or lone surrogates.",
      $comment: "Copy of objects.schema.json's `displayText`.",
      type: "string",
      pattern:
        "^[^\\u0000-\\u001f\\u007f-\\u009f\\p{Cf}\\p{Zl}\\p{Zp}\\p{Cs}]{1,8192}$",
    },
    scopeEntry: {
      description:
        "A scope entry: an entry without a backslash, relative (no leading `/`) and without empty, `.` or `..` segments, as the rubric requires.",
      $comment: "Copy of objects.schema.json's `scopeEntry`.",
      type: "string",
      pattern:
        "^[^\\\\\\u0000-\\u001f\\u007f-\\u009f\\p{Cf}\\p{Zl}\\p{Zp}\\p{Cs}]{1,1024}$",
      not: { pattern: "(^|/)\\.{0,2}(/|$)" },
    },
    taskClass: {
      title: "TaskClass",
      description:
        "Task class, in rank order: chore < bounded < architectural.",
      $comment: "Copy of objects.schema.json's `taskClass`.",
      enum: ["chore", "bounded", "architectural"],
    },
    sha256: {
      description: "Lowercase hex SHA-256.",
      $comment: "Copy of objects.schema.json's `sha256`.",
      type: "string",
      pattern: "^[0-9a-f]{64}$",
    },
    oid: {
      description: "A full lowercase hex git object ID (SHA-1 or SHA-256).",
      $comment: "Copy of objects.schema.json's `oid`.",
      type: "string",
      pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$",
    },
    decisionClass: {
      title: "DecisionClass",
      description:
        "An owned decision class (03 Owned decision classes, X3): architecture, scope or technology.",
      $comment: "Copy of objects.schema.json's `decisionClass`.",
      enum: ["architecture", "scope", "technology"],
    },
    signalId: {
      description:
        "The ID of a signal that raised a decision, such as a floor signal ID or the event ID of an `intake.classified` event.",
      $comment: "Copy of objects.schema.json's `signalId`.",
      type: "string",
      pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$",
    },
    signalIds: {
      description:
        "The signals that raised the decision, unique (checked by the writer); empty for a plan's `decisions[]`.",
      $comment: "Copy of objects.schema.json's `signalIds`.",
      type: "array",
      maxItems: 256,
      items: { $ref: "#/$defs/signalId" },
    },
    brief: {
      title: "DecisionBrief",
      description:
        "The brief as presented (03 The brief, Q45), written by the harness when it opens the decision; it holds the recommendation only as a salted commitment until reveal (Q48).",
      $comment: "Copy of objects.schema.json's `brief`.",
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
      $comment: "Copy of objects.schema.json's `option`.",
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
      $comment: "Copy of objects.schema.json's `rulingBody`.",
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
            "The cost if the call is wrong, as one line of at most 200 code points; B5-5 maps the intake event's longer, multi-line `costIfWrong` into this form, or the Ruling write fails.",
        },
        rubricVersion: { $ref: "#/$defs/rubricVersion" },
      },
    },
    seed: {
      description: "A 128-bit seed as 32 lowercase hex characters.",
      $comment: "Copy of objects.schema.json's `seed`.",
      type: "string",
      pattern: "^[0-9a-f]{32}$",
    },
    conceptSlug: {
      description:
        "A concept slug (X6): 1 to 64 lowercase letters, digits and hyphens, not starting with a hyphen.",
      $comment: "Copy of objects.schema.json's `conceptSlug`.",
      type: "string",
      pattern: "^[a-z0-9][a-z0-9-]{0,63}$",
    },
    rubricVersion: {
      description:
        "The version of the rubric that routed the call, such as `intake-rubric-1` or `materiality-rubric-1`.",
      $comment: "Copy of objects.schema.json's `rubricVersion`.",
      type: "string",
      pattern: "^(?:intake|materiality)-rubric-[1-9][0-9]{0,5}$",
    },
    question: {
      description:
        "One line of 1 to 160 code points, not only spaces, without a control character, line break, bidi control or lone surrogate.",
      $comment: "Copy of objects.schema.json's `question`.",
      type: "string",
      pattern:
        "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,160}$",
      not: { pattern: "^\\s*$" },
    },
    optionLabel: {
      description:
        "One line of 1 to 80 code points, not only spaces, without a control character, line break, bidi control or lone surrogate.",
      $comment: "Copy of objects.schema.json's `optionLabel`.",
      type: "string",
      pattern:
        "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,80}$",
      not: { pattern: "^\\s*$" },
    },
    line: {
      description:
        "One line of 1 to 200 code points, not only spaces, without a control character, line break, bidi control or lone surrogate.",
      $comment: "Copy of objects.schema.json's `line`.",
      type: "string",
      pattern:
        "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,200}$",
      not: { pattern: "^\\s*$" },
    },
  },
};
const schema32 = {
  title: "TaskCreated",
  description:
    "The harness created a Task at run start (TaskRecord): `createdAt` and `createdSeq` are the envelope's `at` and `seq`, and `status` starts `open`.",
  type: "object",
  additionalProperties: false,
  required: ["kind", "id", "repoId", "text", "scope"],
  properties: {
    kind: { const: "task.created" },
    id: { $ref: "#/$defs/taskId" },
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
        "The declared scope, sorted and unique (checked by the writer); empty when none was declared.",
      type: "array",
      maxItems: 256,
      items: { $ref: "#/$defs/scopeEntry" },
    },
  },
};
const schema33 = {
  description:
    "Kind-prefixed task ID, also a valid session-log ID (at most 128 characters).",
  $comment: "Copy of objects.schema.json's `taskId`.",
  type: "string",
  pattern: "^task-[A-Za-z0-9][A-Za-z0-9_-]{0,122}$",
};
const schema34 = {
  description:
    "Absolute realpath of a repository's common git dir: at most 4096 code points without C0 or C1 controls, format characters, line or paragraph separators or lone surrogates.",
  $comment: "Copy of objects.schema.json's `repoId`.",
  type: "string",
  pattern:
    "^/[^\\u0000-\\u001f\\u007f-\\u009f\\p{Cf}\\p{Zl}\\p{Zp}\\p{Cs}]{0,4095}$",
};
const schema35 = {
  description:
    "Text of 1 to 8192 code points, not only spaces; tabs and line breaks are kept, but no other control character, bidi control or lone surrogate.",
  $comment: "Copy of objects.schema.json's `text`.",
  type: "string",
  pattern:
    "^[^\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,8192}$",
  not: { pattern: "^\\s*$" },
};
const schema36 = {
  description:
    "A scope entry: an entry without a backslash, relative (no leading `/`) and without empty, `.` or `..` segments, as the rubric requires.",
  $comment: "Copy of objects.schema.json's `scopeEntry`.",
  type: "string",
  pattern:
    "^[^\\\\\\u0000-\\u001f\\u007f-\\u009f\\p{Cf}\\p{Zl}\\p{Zp}\\p{Cs}]{1,1024}$",
  not: { pattern: "(^|/)\\.{0,2}(/|$)" },
};
const pattern4 = new RegExp("^task-[A-Za-z0-9][A-Za-z0-9_-]{0,122}$", "u");
const pattern5 = new RegExp(
  "^/[^\\u0000-\\u001f\\u007f-\\u009f\\p{Cf}\\p{Zl}\\p{Zp}\\p{Cs}]{0,4095}$",
  "u",
);
const pattern6 = new RegExp("^\\s*$", "u");
const pattern7 = new RegExp(
  "^[^\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,8192}$",
  "u",
);
const pattern8 = new RegExp("(^|/)\\.{0,2}(/|$)", "u");
const pattern9 = new RegExp(
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
    if (data.id === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "id" },
        message: "must have required property '" + "id" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.repoId === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "repoId" },
        message: "must have required property '" + "repoId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.text === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "text" },
        message: "must have required property '" + "text" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.scope === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "scope" },
        message: "must have required property '" + "scope" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(
        key0 === "kind" ||
        key0 === "id" ||
        key0 === "repoId" ||
        key0 === "text" ||
        key0 === "scope"
      )) {
        const err5 = {
          instancePath,
          schemaPath: "#/additionalProperties",
          keyword: "additionalProperties",
          params: { additionalProperty: key0 },
          message: "must NOT have additional properties",
        };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.kind !== undefined) {
      if ("task.created" !== data.kind) {
        const err6 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "task.created" },
          message: "must be equal to constant",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    if (data.id !== undefined) {
      let data1 = data.id;
      if (typeof data1 === "string") {
        if (!pattern4.test(data1)) {
          const err7 = {
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
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      } else {
        const err8 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/$defs/taskId/type",
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
    if (data.repoId !== undefined) {
      let data2 = data.repoId;
      if (typeof data2 === "string") {
        if (!pattern5.test(data2)) {
          const err9 = {
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
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
      } else {
        const err10 = {
          instancePath: instancePath + "/repoId",
          schemaPath: "#/$defs/repoId/type",
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
    if (data.text !== undefined) {
      let data3 = data.text;
      const _errs15 = errors;
      const _errs16 = errors;
      if (typeof data3 === "string") {
        if (!pattern6.test(data3)) {
          const err11 = {};
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
      }
      var valid4 = _errs16 === errors;
      if (valid4) {
        const err12 = {
          instancePath: instancePath + "/text",
          schemaPath: "#/$defs/text/not",
          keyword: "not",
          params: {},
          message: "must NOT be valid",
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
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
      if (typeof data3 === "string") {
        if (!pattern7.test(data3)) {
          const err13 = {
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
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
      } else {
        const err14 = {
          instancePath: instancePath + "/text",
          schemaPath: "#/$defs/text/type",
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
    if (data.scope !== undefined) {
      let data4 = data.scope;
      if (Array.isArray(data4)) {
        if (data4.length > 256) {
          const err15 = {
            instancePath: instancePath + "/scope",
            schemaPath: "#/properties/scope/maxItems",
            keyword: "maxItems",
            params: { limit: 256 },
            message: "must NOT have more than 256 items",
          };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
        const len0 = data4.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data5 = data4[i0];
          const _errs23 = errors;
          const _errs24 = errors;
          if (typeof data5 === "string") {
            if (!pattern8.test(data5)) {
              const err16 = {};
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
          }
          var valid8 = _errs24 === errors;
          if (valid8) {
            const err17 = {
              instancePath: instancePath + "/scope/" + i0,
              schemaPath: "#/$defs/scopeEntry/not",
              keyword: "not",
              params: {},
              message: "must NOT be valid",
            };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          } else {
            errors = _errs23;
            if (vErrors !== null) {
              if (_errs23) {
                vErrors.length = _errs23;
              } else {
                vErrors = null;
              }
            }
          }
          if (typeof data5 === "string") {
            if (!pattern9.test(data5)) {
              const err18 = {
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
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
          } else {
            const err19 = {
              instancePath: instancePath + "/scope/" + i0,
              schemaPath: "#/$defs/scopeEntry/type",
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
      } else {
        const err20 = {
          instancePath: instancePath + "/scope",
          schemaPath: "#/properties/scope/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
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
  validate21.errors = vErrors;
  return errors === 0;
}
validate21.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
const schema37 = {
  title: "RunRecorded",
  description:
    "The harness recorded a Run at run start (RunRecord): the record's `id`, `graphId` and `nodeId` are the envelope's `runId`, `graphId` and `nodeId`, `createdAt` and `createdSeq` its `at` and `seq`, and `terminal` starts `null`.",
  type: "object",
  additionalProperties: false,
  required: ["kind", "taskId", "engine", "baseCommit", "class"],
  properties: {
    kind: { const: "run.recorded" },
    taskId: {
      $ref: "#/$defs/taskId",
      description: "The Task this run executes (typed link task→run).",
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
  },
};
const schema39 = {
  description: "A full lowercase hex git object ID (SHA-1 or SHA-256).",
  $comment: "Copy of objects.schema.json's `oid`.",
  type: "string",
  pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$",
};
const schema40 = {
  title: "TaskClass",
  description: "Task class, in rank order: chore < bounded < architectural.",
  $comment: "Copy of objects.schema.json's `taskClass`.",
  enum: ["chore", "bounded", "architectural"],
};
const pattern11 = new RegExp("^(?:[0-9a-f]{40}|[0-9a-f]{64})$", "u");
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
    if (data.taskId === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "taskId" },
        message: "must have required property '" + "taskId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.engine === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "engine" },
        message: "must have required property '" + "engine" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.baseCommit === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "baseCommit" },
        message: "must have required property '" + "baseCommit" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.class === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "class" },
        message: "must have required property '" + "class" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(
        key0 === "kind" ||
        key0 === "taskId" ||
        key0 === "engine" ||
        key0 === "baseCommit" ||
        key0 === "class"
      )) {
        const err5 = {
          instancePath,
          schemaPath: "#/additionalProperties",
          keyword: "additionalProperties",
          params: { additionalProperty: key0 },
          message: "must NOT have additional properties",
        };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.kind !== undefined) {
      if ("run.recorded" !== data.kind) {
        const err6 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "run.recorded" },
          message: "must be equal to constant",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    if (data.taskId !== undefined) {
      let data1 = data.taskId;
      if (typeof data1 === "string") {
        if (!pattern4.test(data1)) {
          const err7 = {
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
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      } else {
        const err8 = {
          instancePath: instancePath + "/taskId",
          schemaPath: "#/$defs/taskId/type",
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
    if (data.engine !== undefined) {
      if ("scripted" !== data.engine) {
        const err9 = {
          instancePath: instancePath + "/engine",
          schemaPath: "#/properties/engine/const",
          keyword: "const",
          params: { allowedValue: "scripted" },
          message: "must be equal to constant",
        };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.baseCommit !== undefined) {
      let data3 = data.baseCommit;
      if (typeof data3 === "string") {
        if (!pattern11.test(data3)) {
          const err10 = {
            instancePath: instancePath + "/baseCommit",
            schemaPath: "#/$defs/oid/pattern",
            keyword: "pattern",
            params: { pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$" },
            message:
              'must match pattern "' + "^(?:[0-9a-f]{40}|[0-9a-f]{64})$" + '"',
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
          instancePath: instancePath + "/baseCommit",
          schemaPath: "#/$defs/oid/type",
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
    if (data.class !== undefined) {
      let data4 = data.class;
      if (!(
        data4 === "chore" ||
        data4 === "bounded" ||
        data4 === "architectural"
      )) {
        const err12 = {
          instancePath: instancePath + "/class",
          schemaPath: "#/$defs/taskClass/enum",
          keyword: "enum",
          params: { allowedValues: schema40.enum },
          message: "must be equal to one of the allowed values",
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
  validate23.errors = vErrors;
  return errors === 0;
}
validate23.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
const schema41 = {
  title: "ArtifactRecorded",
  description:
    "The harness recorded an Artifact (ArtifactRecord): `createdAt` and `createdSeq` are the envelope's `at` and `seq`. For `footprint.*` the writer checks the content address: `sha256` is the SHA-256 of the UTF-8 bytes of `JSON.stringify([type, repoId, ref])` and `id` is `artifact-<sha256>`.",
  type: "object",
  additionalProperties: false,
  required: ["kind", "id", "type", "ref", "sha256"],
  properties: {
    kind: { const: "artifact.recorded" },
    id: { $ref: "#/$defs/artifactId" },
    type: { $ref: "#/$defs/artifactType" },
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
        "For `footprint.*` the content address above; otherwise the SHA-256 of the stored content.",
    },
    runId: {
      $ref: "#/$defs/runId",
      description:
        "The run that produced it, when one did; footprints and expansions may be recorded outside a run (A1, A7, C2).",
    },
  },
  $comment:
    "`if` and `then` are copies of objects.schema.json's `artifact` `if` and `then`.",
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
const schema43 = {
  description:
    "Kind-prefixed artifact ID, also a valid session-log ID (at most 128 characters).",
  $comment: "Copy of objects.schema.json's `artifactId`.",
  type: "string",
  pattern: "^artifact-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$",
};
const schema44 = {
  title: "ArtifactType",
  description:
    "What the artifact is; the footprint types are the Q47 representation: files, exported symbols, dependency names and module IDs.",
  $comment: "Copy of objects.schema.json's `artifact.properties.type`.",
  enum: [
    "diff",
    "report",
    "conceptExpansion",
    "footprint.file",
    "footprint.symbol",
    "footprint.dependency",
    "footprint.module",
  ],
};
const schema46 = {
  description:
    "Escaped display text: 1 to 8192 code points without C0 or C1 controls, format characters, line or paragraph separators or lone surrogates.",
  $comment: "Copy of objects.schema.json's `displayText`.",
  type: "string",
  pattern:
    "^[^\\u0000-\\u001f\\u007f-\\u009f\\p{Cf}\\p{Zl}\\p{Zp}\\p{Cs}]{1,8192}$",
};
const schema47 = {
  description: "Lowercase hex SHA-256.",
  $comment: "Copy of objects.schema.json's `sha256`.",
  type: "string",
  pattern: "^[0-9a-f]{64}$",
};
const schema48 = {
  description:
    "Kind-prefixed run ID, also a valid session-log ID (at most 128 characters).",
  $comment: "Copy of objects.schema.json's `runId`.",
  type: "string",
  pattern: "^run-[A-Za-z0-9][A-Za-z0-9_-]{0,123}$",
};
const pattern13 = new RegExp("^artifact-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$", "u");
const pattern15 = new RegExp(
  "^[^\\u0000-\\u001f\\u007f-\\u009f\\p{Cf}\\p{Zl}\\p{Zp}\\p{Cs}]{1,8192}$",
  "u",
);
const pattern16 = new RegExp("^[0-9a-f]{64}$", "u");
const pattern17 = new RegExp("^run-[A-Za-z0-9][A-Za-z0-9_-]{0,123}$", "u");
function validate25(
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
  const evaluated0 = validate25.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  const _errs2 = errors;
  let valid0 = true;
  const _errs3 = errors;
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
  var _valid0 = _errs3 === errors;
  errors = _errs2;
  if (vErrors !== null) {
    if (_errs2) {
      vErrors.length = _errs2;
    } else {
      vErrors = null;
    }
  }
  if (_valid0) {
    const _errs5 = errors;
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
          if (!pattern5.test(data1)) {
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
    var _valid0 = _errs5 === errors;
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
    if (data.kind === undefined) {
      const err5 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "kind" },
        message: "must have required property '" + "kind" + "'",
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.id === undefined) {
      const err6 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "id" },
        message: "must have required property '" + "id" + "'",
      };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.type === undefined) {
      const err7 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "type" },
        message: "must have required property '" + "type" + "'",
      };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.ref === undefined) {
      const err8 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "ref" },
        message: "must have required property '" + "ref" + "'",
      };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    if (data.sha256 === undefined) {
      const err9 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "sha256" },
        message: "must have required property '" + "sha256" + "'",
      };
      if (vErrors === null) {
        vErrors = [err9];
      } else {
        vErrors.push(err9);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(
        key0 === "kind" ||
        key0 === "id" ||
        key0 === "type" ||
        key0 === "repoId" ||
        key0 === "ref" ||
        key0 === "sha256" ||
        key0 === "runId"
      )) {
        const err10 = {
          instancePath,
          schemaPath: "#/additionalProperties",
          keyword: "additionalProperties",
          params: { additionalProperty: key0 },
          message: "must NOT have additional properties",
        };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.kind !== undefined) {
      if ("artifact.recorded" !== data.kind) {
        const err11 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "artifact.recorded" },
          message: "must be equal to constant",
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
      let data3 = data.id;
      if (typeof data3 === "string") {
        if (!pattern13.test(data3)) {
          const err12 = {
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
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
      } else {
        const err13 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/$defs/artifactId/type",
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
    if (data.type !== undefined) {
      let data4 = data.type;
      if (!(
        data4 === "diff" ||
        data4 === "report" ||
        data4 === "conceptExpansion" ||
        data4 === "footprint.file" ||
        data4 === "footprint.symbol" ||
        data4 === "footprint.dependency" ||
        data4 === "footprint.module"
      )) {
        const err14 = {
          instancePath: instancePath + "/type",
          schemaPath: "#/$defs/artifactType/enum",
          keyword: "enum",
          params: { allowedValues: schema44.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
    }
    if (data.repoId !== undefined) {
      let data5 = data.repoId;
      if (typeof data5 === "string") {
        if (!pattern5.test(data5)) {
          const err15 = {
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
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
      } else {
        const err16 = {
          instancePath: instancePath + "/repoId",
          schemaPath: "#/$defs/repoId/type",
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
    if (data.ref !== undefined) {
      let data6 = data.ref;
      if (typeof data6 === "string") {
        if (!pattern15.test(data6)) {
          const err17 = {
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
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        }
      } else {
        const err18 = {
          instancePath: instancePath + "/ref",
          schemaPath: "#/$defs/displayText/type",
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
    if (data.sha256 !== undefined) {
      let data7 = data.sha256;
      if (typeof data7 === "string") {
        if (!pattern16.test(data7)) {
          const err19 = {
            instancePath: instancePath + "/sha256",
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
          instancePath: instancePath + "/sha256",
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
    if (data.runId !== undefined) {
      let data8 = data.runId;
      if (typeof data8 === "string") {
        if (!pattern17.test(data8)) {
          const err21 = {
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
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
      } else {
        const err22 = {
          instancePath: instancePath + "/runId",
          schemaPath: "#/$defs/runId/type",
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
  } else {
    const err23 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err23];
    } else {
      vErrors.push(err23);
    }
    errors++;
  }
  validate25.errors = vErrors;
  return errors === 0;
}
validate25.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
const schema49 = {
  title: "DecisionOpened",
  description:
    "The harness opened a ledger entry: an owned decision with its brief, or a Ruling, which is the variant with authority harness, a ruling body and no brief.",
  oneOf: [
    { $ref: "#/$defs/decisionOpenedOwned" },
    { $ref: "#/$defs/decisionOpenedRuling" },
  ],
};
const schema50 = {
  title: "DecisionOpenedOwned",
  description:
    "The harness opened a decision in an owned class with its brief (OwnedDecisionRecord): `createdAt` and `createdSeq` are the envelope's `at` and `seq`, `footprint` and `outcomes` start empty and `status` starts `pending`. Owner-written fields arrive with SIG, A3, A1 and A7.",
  type: "object",
  additionalProperties: false,
  required: [
    "kind",
    "id",
    "authority",
    "taskId",
    "runId",
    "signalIds",
    "class",
    "source",
    "brief",
  ],
  properties: {
    kind: { const: "decision.opened" },
    id: { $ref: "#/$defs/decisionId" },
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
    class: { $ref: "#/$defs/decisionClass" },
    source: {
      description:
        "What raised the decision: the plan's `decisions[]`, a floor signal over the brief threshold, or the agent's self-flag (Q45, Q53, Q54).",
      enum: ["plan", "floor", "selfFlag"],
    },
    brief: { $ref: "#/$defs/brief" },
  },
};
const schema51 = {
  description:
    "Kind-prefixed decision ID, also a valid session-log ID (at most 128 characters).",
  $comment: "Copy of objects.schema.json's `decisionId`.",
  type: "string",
  pattern: "^decision-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$",
};
const schema56 = {
  title: "DecisionClass",
  description:
    "An owned decision class (03 Owned decision classes, X3): architecture, scope or technology.",
  $comment: "Copy of objects.schema.json's `decisionClass`.",
  enum: ["architecture", "scope", "technology"],
};
const func1 = Object.prototype.hasOwnProperty;
const pattern18 = new RegExp("^decision-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$", "u");
const schema54 = {
  description:
    "The signals that raised the decision, unique (checked by the writer); empty for a plan's `decisions[]`.",
  $comment: "Copy of objects.schema.json's `signalIds`.",
  type: "array",
  maxItems: 256,
  items: { $ref: "#/$defs/signalId" },
};
const schema55 = {
  description:
    "The ID of a signal that raised a decision, such as a floor signal ID or the event ID of an `intake.classified` event.",
  $comment: "Copy of objects.schema.json's `signalId`.",
  type: "string",
  pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$",
};
const pattern21 = new RegExp("^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$", "u");
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
        if (!pattern21.test(data0)) {
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
  validate29.errors = vErrors;
  return errors === 0;
}
validate29.evaluated = {
  items: true,
  dynamicProps: false,
  dynamicItems: false,
};
const schema57 = {
  title: "DecisionBrief",
  description:
    "The brief as presented (03 The brief, Q45), written by the harness when it opens the decision; it holds the recommendation only as a salted commitment until reveal (Q48).",
  $comment: "Copy of objects.schema.json's `brief`.",
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
const schema58 = {
  description:
    "One line of 1 to 160 code points, not only spaces, without a control character, line break, bidi control or lone surrogate.",
  $comment: "Copy of objects.schema.json's `question`.",
  type: "string",
  pattern:
    "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,160}$",
  not: { pattern: "^\\s*$" },
};
const schema63 = {
  description: "A 128-bit seed as 32 lowercase hex characters.",
  $comment: "Copy of objects.schema.json's `seed`.",
  type: "string",
  pattern: "^[0-9a-f]{32}$",
};
const schema61 = {
  description:
    "One line of 1 to 200 code points, not only spaces, without a control character, line break, bidi control or lone surrogate.",
  $comment: "Copy of objects.schema.json's `line`.",
  type: "string",
  pattern:
    "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,200}$",
  not: { pattern: "^\\s*$" },
};
const schema67 = {
  description:
    "A concept slug (X6): 1 to 64 lowercase letters, digits and hyphens, not starting with a hyphen.",
  $comment: "Copy of objects.schema.json's `conceptSlug`.",
  type: "string",
  pattern: "^[a-z0-9][a-z0-9-]{0,63}$",
};
const pattern23 = new RegExp(
  "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,160}$",
  "u",
);
const pattern29 = new RegExp("^[0-9a-f]{32}$", "u");
const pattern27 = new RegExp(
  "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,200}$",
  "u",
);
const pattern36 = new RegExp("^[a-z0-9][a-z0-9-]{0,63}$", "u");
const schema59 = {
  title: "DecisionOption",
  description:
    "One option of a brief, whose ID stays the same under the shuffled display order (Q48).",
  $comment: "Copy of objects.schema.json's `option`.",
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
const schema60 = {
  description:
    "One line of 1 to 80 code points, not only spaces, without a control character, line break, bidi control or lone surrogate.",
  $comment: "Copy of objects.schema.json's `optionLabel`.",
  type: "string",
  pattern:
    "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,80}$",
  not: { pattern: "^\\s*$" },
};
const pattern25 = new RegExp(
  "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,80}$",
  "u",
);
function validate32(
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
  const evaluated0 = validate32.evaluated;
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
          params: { allowedValues: schema59.properties.id.enum },
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
      const _errs8 = errors;
      const _errs9 = errors;
      if (typeof data1 === "string") {
        if (!pattern6.test(data1)) {
          const err5 = {};
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
      var valid2 = _errs9 === errors;
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
        errors = _errs8;
        if (vErrors !== null) {
          if (_errs8) {
            vErrors.length = _errs8;
          } else {
            vErrors = null;
          }
        }
      }
      if (typeof data1 === "string") {
        if (!pattern25.test(data1)) {
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
      const _errs14 = errors;
      const _errs15 = errors;
      if (typeof data2 === "string") {
        if (!pattern6.test(data2)) {
          const err9 = {};
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
      }
      var valid4 = _errs15 === errors;
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
        errors = _errs14;
        if (vErrors !== null) {
          if (_errs14) {
            vErrors.length = _errs14;
          } else {
            vErrors = null;
          }
        }
      }
      if (typeof data2 === "string") {
        if (!pattern27.test(data2)) {
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
  validate32.errors = vErrors;
  return errors === 0;
}
validate32.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
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
      if (!func1.call(schema57.properties, key0)) {
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
      const _errs7 = errors;
      const _errs8 = errors;
      if (typeof data0 === "string") {
        if (!pattern6.test(data0)) {
          const err12 = {};
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
      }
      var valid2 = _errs8 === errors;
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
        errors = _errs7;
        if (vErrors !== null) {
          if (_errs7) {
            vErrors.length = _errs7;
          } else {
            vErrors = null;
          }
        }
      }
      if (typeof data0 === "string") {
        if (!pattern23.test(data0)) {
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
            !validate32(data1[i0], {
              instancePath: instancePath + "/options/" + i0,
              parentData: data1,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors =
              vErrors === null
                ? validate32.errors
                : vErrors.concat(validate32.errors);
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
        if (!pattern16.test(data3)) {
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
        if (!pattern29.test(data4)) {
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
          params: { allowedValues: schema57.properties.confidence.enum },
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
      const _errs25 = errors;
      const _errs26 = errors;
      if (typeof data6 === "string") {
        if (!pattern6.test(data6)) {
          const err24 = {};
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
      }
      var valid8 = _errs26 === errors;
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
        errors = _errs25;
        if (vErrors !== null) {
          if (_errs25) {
            vErrors.length = _errs25;
          } else {
            vErrors = null;
          }
        }
      }
      if (typeof data6 === "string") {
        if (!pattern27.test(data6)) {
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
          params: { allowedValues: schema57.properties.reversibility.enum },
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
      const _errs32 = errors;
      const _errs33 = errors;
      if (typeof data8 === "string") {
        if (!pattern6.test(data8)) {
          const err29 = {};
          if (vErrors === null) {
            vErrors = [err29];
          } else {
            vErrors.push(err29);
          }
          errors++;
        }
      }
      var valid10 = _errs33 === errors;
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
        errors = _errs32;
        if (vErrors !== null) {
          if (_errs32) {
            vErrors.length = _errs32;
          } else {
            vErrors = null;
          }
        }
      }
      if (typeof data8 === "string") {
        if (!pattern27.test(data8)) {
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
      const _errs38 = errors;
      const _errs39 = errors;
      if (typeof data9 === "string") {
        if (!pattern6.test(data9)) {
          const err33 = {};
          if (vErrors === null) {
            vErrors = [err33];
          } else {
            vErrors.push(err33);
          }
          errors++;
        }
      }
      var valid12 = _errs39 === errors;
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
        errors = _errs38;
        if (vErrors !== null) {
          if (_errs38) {
            vErrors.length = _errs38;
          } else {
            vErrors = null;
          }
        }
      }
      if (typeof data9 === "string") {
        if (!pattern27.test(data9)) {
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
            if (!pattern36.test(data11)) {
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
            if (!pattern13.test(data13)) {
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
  validate31.errors = vErrors;
  return errors === 0;
}
validate31.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
function validate28(
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
  const evaluated0 = validate28.evaluated;
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
    if (data.id === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "id" },
        message: "must have required property '" + "id" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.authority === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "authority" },
        message: "must have required property '" + "authority" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.taskId === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "taskId" },
        message: "must have required property '" + "taskId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.runId === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "runId" },
        message: "must have required property '" + "runId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.signalIds === undefined) {
      const err5 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "signalIds" },
        message: "must have required property '" + "signalIds" + "'",
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.class === undefined) {
      const err6 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "class" },
        message: "must have required property '" + "class" + "'",
      };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.source === undefined) {
      const err7 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "source" },
        message: "must have required property '" + "source" + "'",
      };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.brief === undefined) {
      const err8 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "brief" },
        message: "must have required property '" + "brief" + "'",
      };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func1.call(schema50.properties, key0)) {
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
    if (data.kind !== undefined) {
      if ("decision.opened" !== data.kind) {
        const err10 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "decision.opened" },
          message: "must be equal to constant",
        };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.id !== undefined) {
      let data1 = data.id;
      if (typeof data1 === "string") {
        if (!pattern18.test(data1)) {
          const err11 = {
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
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
      } else {
        const err12 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/$defs/decisionId/type",
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
    if (data.authority !== undefined) {
      if ("owner" !== data.authority) {
        const err13 = {
          instancePath: instancePath + "/authority",
          schemaPath: "#/properties/authority/const",
          keyword: "const",
          params: { allowedValue: "owner" },
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
    if (data.taskId !== undefined) {
      let data3 = data.taskId;
      if (typeof data3 === "string") {
        if (!pattern4.test(data3)) {
          const err14 = {
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
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
      } else {
        const err15 = {
          instancePath: instancePath + "/taskId",
          schemaPath: "#/$defs/taskId/type",
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
    if (data.runId !== undefined) {
      let data4 = data.runId;
      if (typeof data4 === "string") {
        if (!pattern17.test(data4)) {
          const err16 = {
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
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
      } else {
        const err17 = {
          instancePath: instancePath + "/runId",
          schemaPath: "#/$defs/runId/type",
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
    if (data.signalIds !== undefined) {
      if (
        !validate29(data.signalIds, {
          instancePath: instancePath + "/signalIds",
          parentData: data,
          parentDataProperty: "signalIds",
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
    }
    if (data.class !== undefined) {
      let data6 = data.class;
      if (!(
        data6 === "architecture" ||
        data6 === "scope" ||
        data6 === "technology"
      )) {
        const err18 = {
          instancePath: instancePath + "/class",
          schemaPath: "#/$defs/decisionClass/enum",
          keyword: "enum",
          params: { allowedValues: schema56.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      }
    }
    if (data.source !== undefined) {
      let data7 = data.source;
      if (!(data7 === "plan" || data7 === "floor" || data7 === "selfFlag")) {
        const err19 = {
          instancePath: instancePath + "/source",
          schemaPath: "#/properties/source/enum",
          keyword: "enum",
          params: { allowedValues: schema50.properties.source.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
    }
    if (data.brief !== undefined) {
      if (
        !validate31(data.brief, {
          instancePath: instancePath + "/brief",
          parentData: data,
          parentDataProperty: "brief",
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
    }
  } else {
    const err20 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err20];
    } else {
      vErrors.push(err20);
    }
    errors++;
  }
  validate28.errors = vErrors;
  return errors === 0;
}
validate28.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
const schema69 = {
  title: "DecisionOpenedRuling",
  description:
    "The harness recorded a Ruling (RulingRecord): `createdAt` and `createdSeq` are the envelope's `at` and `seq`, `footprint` and `outcomes` start empty and `status` is `resolved`. A Ruling has no brief and no owner-written field; with source `intake` its class is `null` (checked by the writer).",
  type: "object",
  additionalProperties: false,
  required: [
    "kind",
    "id",
    "authority",
    "taskId",
    "runId",
    "signalIds",
    "class",
    "source",
    "ruling",
  ],
  properties: {
    kind: { const: "decision.opened" },
    id: { $ref: "#/$defs/decisionId" },
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
    ruling: { $ref: "#/$defs/rulingBody" },
  },
};
const schema74 = {
  title: "Ruling",
  description:
    "What the harness decided, why, the cost if wrong and the version of the rubric that routed the call (03 Delegated authority, Q53).",
  $comment: "Copy of objects.schema.json's `rulingBody`.",
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
        "The cost if the call is wrong, as one line of at most 200 code points; B5-5 maps the intake event's longer, multi-line `costIfWrong` into this form, or the Ruling write fails.",
    },
    rubricVersion: { $ref: "#/$defs/rubricVersion" },
  },
};
const schema78 = {
  description:
    "The version of the rubric that routed the call, such as `intake-rubric-1` or `materiality-rubric-1`.",
  $comment: "Copy of objects.schema.json's `rubricVersion`.",
  type: "string",
  pattern: "^(?:intake|materiality)-rubric-[1-9][0-9]{0,5}$",
};
const pattern47 = new RegExp(
  "^(?:intake|materiality)-rubric-[1-9][0-9]{0,5}$",
  "u",
);
function validate38(
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
  const evaluated0 = validate38.evaluated;
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
      const _errs7 = errors;
      const _errs8 = errors;
      if (typeof data0 === "string") {
        if (!pattern6.test(data0)) {
          const err5 = {};
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
      var valid2 = _errs8 === errors;
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
        errors = _errs7;
        if (vErrors !== null) {
          if (_errs7) {
            vErrors.length = _errs7;
          } else {
            vErrors = null;
          }
        }
      }
      if (typeof data0 === "string") {
        if (!pattern27.test(data0)) {
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
      const _errs13 = errors;
      const _errs14 = errors;
      if (typeof data1 === "string") {
        if (!pattern6.test(data1)) {
          const err9 = {};
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
      }
      var valid4 = _errs14 === errors;
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
        errors = _errs13;
        if (vErrors !== null) {
          if (_errs13) {
            vErrors.length = _errs13;
          } else {
            vErrors = null;
          }
        }
      }
      if (typeof data1 === "string") {
        if (!pattern7.test(data1)) {
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
      const _errs19 = errors;
      const _errs20 = errors;
      if (typeof data2 === "string") {
        if (!pattern6.test(data2)) {
          const err13 = {};
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
      }
      var valid6 = _errs20 === errors;
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
        errors = _errs19;
        if (vErrors !== null) {
          if (_errs19) {
            vErrors.length = _errs19;
          } else {
            vErrors = null;
          }
        }
      }
      if (typeof data2 === "string") {
        if (!pattern27.test(data2)) {
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
        if (!pattern47.test(data3)) {
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
  validate38.errors = vErrors;
  return errors === 0;
}
validate38.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
function validate36(
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
  const evaluated0 = validate36.evaluated;
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
    if (data.id === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "id" },
        message: "must have required property '" + "id" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.authority === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "authority" },
        message: "must have required property '" + "authority" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.taskId === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "taskId" },
        message: "must have required property '" + "taskId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.runId === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "runId" },
        message: "must have required property '" + "runId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.signalIds === undefined) {
      const err5 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "signalIds" },
        message: "must have required property '" + "signalIds" + "'",
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.class === undefined) {
      const err6 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "class" },
        message: "must have required property '" + "class" + "'",
      };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.source === undefined) {
      const err7 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "source" },
        message: "must have required property '" + "source" + "'",
      };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.ruling === undefined) {
      const err8 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "ruling" },
        message: "must have required property '" + "ruling" + "'",
      };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func1.call(schema69.properties, key0)) {
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
    if (data.kind !== undefined) {
      if ("decision.opened" !== data.kind) {
        const err10 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "decision.opened" },
          message: "must be equal to constant",
        };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.id !== undefined) {
      let data1 = data.id;
      if (typeof data1 === "string") {
        if (!pattern18.test(data1)) {
          const err11 = {
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
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
      } else {
        const err12 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/$defs/decisionId/type",
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
    if (data.authority !== undefined) {
      if ("harness" !== data.authority) {
        const err13 = {
          instancePath: instancePath + "/authority",
          schemaPath: "#/properties/authority/const",
          keyword: "const",
          params: { allowedValue: "harness" },
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
    if (data.taskId !== undefined) {
      let data3 = data.taskId;
      if (typeof data3 === "string") {
        if (!pattern4.test(data3)) {
          const err14 = {
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
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
      } else {
        const err15 = {
          instancePath: instancePath + "/taskId",
          schemaPath: "#/$defs/taskId/type",
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
    if (data.runId !== undefined) {
      let data4 = data.runId;
      if (typeof data4 === "string") {
        if (!pattern17.test(data4)) {
          const err16 = {
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
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
      } else {
        const err17 = {
          instancePath: instancePath + "/runId",
          schemaPath: "#/$defs/runId/type",
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
    if (data.signalIds !== undefined) {
      if (
        !validate29(data.signalIds, {
          instancePath: instancePath + "/signalIds",
          parentData: data,
          parentDataProperty: "signalIds",
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
    }
    if (data.class !== undefined) {
      let data6 = data.class;
      const _errs18 = errors;
      let valid4 = false;
      let passing0 = null;
      const _errs19 = errors;
      if (data6 !== null) {
        const err18 = {
          instancePath: instancePath + "/class",
          schemaPath: "#/properties/class/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      }
      var _valid0 = _errs19 === errors;
      if (_valid0) {
        valid4 = true;
        passing0 = 0;
      }
      const _errs21 = errors;
      if (!(
        data6 === "architecture" ||
        data6 === "scope" ||
        data6 === "technology"
      )) {
        const err19 = {
          instancePath: instancePath + "/class",
          schemaPath: "#/$defs/decisionClass/enum",
          keyword: "enum",
          params: { allowedValues: schema56.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
      var _valid0 = _errs21 === errors;
      if (_valid0 && valid4) {
        valid4 = false;
        passing0 = [passing0, 1];
      } else {
        if (_valid0) {
          valid4 = true;
          passing0 = 1;
        }
      }
      if (!valid4) {
        const err20 = {
          instancePath: instancePath + "/class",
          schemaPath: "#/properties/class/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing0 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      } else {
        errors = _errs18;
        if (vErrors !== null) {
          if (_errs18) {
            vErrors.length = _errs18;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.source !== undefined) {
      let data7 = data.source;
      if (!(data7 === "plan" || data7 === "floor" || data7 === "intake")) {
        const err21 = {
          instancePath: instancePath + "/source",
          schemaPath: "#/properties/source/enum",
          keyword: "enum",
          params: { allowedValues: schema69.properties.source.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err21];
        } else {
          vErrors.push(err21);
        }
        errors++;
      }
    }
    if (data.ruling !== undefined) {
      if (
        !validate38(data.ruling, {
          instancePath: instancePath + "/ruling",
          parentData: data,
          parentDataProperty: "ruling",
          rootData,
          dynamicAnchors,
        })
      ) {
        vErrors =
          vErrors === null
            ? validate38.errors
            : vErrors.concat(validate38.errors);
        errors = vErrors.length;
      }
    }
  } else {
    const err22 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err22];
    } else {
      vErrors.push(err22);
    }
    errors++;
  }
  validate36.errors = vErrors;
  return errors === 0;
}
validate36.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
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
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (
    !validate28(data, {
      instancePath,
      parentData,
      parentDataProperty,
      rootData,
      dynamicAnchors,
    })
  ) {
    vErrors =
      vErrors === null ? validate28.errors : vErrors.concat(validate28.errors);
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
    !validate36(data, {
      instancePath,
      parentData,
      parentDataProperty,
      rootData,
      dynamicAnchors,
    })
  ) {
    vErrors =
      vErrors === null ? validate36.errors : vErrors.concat(validate36.errors);
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
  validate27.errors = vErrors;
  evaluated0.props = props0;
  return errors === 0;
}
validate27.evaluated = { dynamicProps: true, dynamicItems: false };
const schema79 = {
  title: "DecisionFootprintRecorded",
  description:
    "The harness recorded the footprint of a decision when it closed (Q47); it sets the record's `footprint` once (checked by the writer).",
  type: "object",
  additionalProperties: false,
  required: ["kind", "decisionId", "artifactIds"],
  properties: {
    kind: { const: "decision.footprint.recorded" },
    decisionId: { $ref: "#/$defs/decisionId" },
    artifactIds: {
      description:
        "The footprint artifact IDs, unique (checked by the writer).",
      type: "array",
      minItems: 1,
      maxItems: 1024,
      items: { $ref: "#/$defs/artifactId" },
    },
  },
};
function validate42(
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
  const evaluated0 = validate42.evaluated;
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
    if (data.decisionId === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "decisionId" },
        message: "must have required property '" + "decisionId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.artifactIds === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "artifactIds" },
        message: "must have required property '" + "artifactIds" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(
        key0 === "kind" ||
        key0 === "decisionId" ||
        key0 === "artifactIds"
      )) {
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
    if (data.kind !== undefined) {
      if ("decision.footprint.recorded" !== data.kind) {
        const err4 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "decision.footprint.recorded" },
          message: "must be equal to constant",
        };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
    }
    if (data.decisionId !== undefined) {
      let data1 = data.decisionId;
      if (typeof data1 === "string") {
        if (!pattern18.test(data1)) {
          const err5 = {
            instancePath: instancePath + "/decisionId",
            schemaPath: "#/$defs/decisionId/pattern",
            keyword: "pattern",
            params: { pattern: "^decision-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$" },
            message:
              'must match pattern "' +
              "^decision-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$" +
              '"',
          };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      } else {
        const err6 = {
          instancePath: instancePath + "/decisionId",
          schemaPath: "#/$defs/decisionId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    if (data.artifactIds !== undefined) {
      let data2 = data.artifactIds;
      if (Array.isArray(data2)) {
        if (data2.length > 1024) {
          const err7 = {
            instancePath: instancePath + "/artifactIds",
            schemaPath: "#/properties/artifactIds/maxItems",
            keyword: "maxItems",
            params: { limit: 1024 },
            message: "must NOT have more than 1024 items",
          };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (data2.length < 1) {
          const err8 = {
            instancePath: instancePath + "/artifactIds",
            schemaPath: "#/properties/artifactIds/minItems",
            keyword: "minItems",
            params: { limit: 1 },
            message: "must NOT have fewer than 1 items",
          };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
        const len0 = data2.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data3 = data2[i0];
          if (typeof data3 === "string") {
            if (!pattern13.test(data3)) {
              const err9 = {
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
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
          } else {
            const err10 = {
              instancePath: instancePath + "/artifactIds/" + i0,
              schemaPath: "#/$defs/artifactId/type",
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
      } else {
        const err11 = {
          instancePath: instancePath + "/artifactIds",
          schemaPath: "#/properties/artifactIds/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
  } else {
    const err12 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err12];
    } else {
      vErrors.push(err12);
    }
    errors++;
  }
  validate42.errors = vErrors;
  return errors === 0;
}
validate42.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
const schema82 = {
  title: "DecisionOutcomeSignalled",
  description:
    "The harness found that a later run's diff matched a decision's footprint (Q47); it appends `{kind: \"signal\", signal, runId, artifactIds, at, seq}` to the record's `outcomes`, with the envelope's `at` and `seq`.",
  type: "object",
  additionalProperties: false,
  required: ["kind", "decisionId", "signal", "runId", "artifactIds"],
  properties: {
    kind: { const: "decision.outcome.signalled" },
    decisionId: { $ref: "#/$defs/decisionId" },
    signal: {
      description:
        "`rework`: the diff changed a symbol of a footprint file; `dependencyChanged`: it added or removed a footprint dependency (Q47).",
      $comment:
        "Copy of objects.schema.json's `outcomeSignal.properties.signal`.",
      enum: ["rework", "dependencyChanged"],
    },
    runId: {
      $ref: "#/$defs/runId",
      description: "The run whose diff matched.",
    },
    artifactIds: {
      description: "The footprint entries the diff matched.",
      $comment:
        "Copy of objects.schema.json's `outcomeSignal.properties.artifactIds`.",
      type: "array",
      minItems: 1,
      maxItems: 256,
      items: { $ref: "#/$defs/artifactId" },
    },
  },
};
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
    if (data.decisionId === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "decisionId" },
        message: "must have required property '" + "decisionId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.signal === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "signal" },
        message: "must have required property '" + "signal" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.runId === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "runId" },
        message: "must have required property '" + "runId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.artifactIds === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "artifactIds" },
        message: "must have required property '" + "artifactIds" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(
        key0 === "kind" ||
        key0 === "decisionId" ||
        key0 === "signal" ||
        key0 === "runId" ||
        key0 === "artifactIds"
      )) {
        const err5 = {
          instancePath,
          schemaPath: "#/additionalProperties",
          keyword: "additionalProperties",
          params: { additionalProperty: key0 },
          message: "must NOT have additional properties",
        };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.kind !== undefined) {
      if ("decision.outcome.signalled" !== data.kind) {
        const err6 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "decision.outcome.signalled" },
          message: "must be equal to constant",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    if (data.decisionId !== undefined) {
      let data1 = data.decisionId;
      if (typeof data1 === "string") {
        if (!pattern18.test(data1)) {
          const err7 = {
            instancePath: instancePath + "/decisionId",
            schemaPath: "#/$defs/decisionId/pattern",
            keyword: "pattern",
            params: { pattern: "^decision-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$" },
            message:
              'must match pattern "' +
              "^decision-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$" +
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
          instancePath: instancePath + "/decisionId",
          schemaPath: "#/$defs/decisionId/type",
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
    if (data.signal !== undefined) {
      let data2 = data.signal;
      if (!(data2 === "rework" || data2 === "dependencyChanged")) {
        const err9 = {
          instancePath: instancePath + "/signal",
          schemaPath: "#/properties/signal/enum",
          keyword: "enum",
          params: { allowedValues: schema82.properties.signal.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.runId !== undefined) {
      let data3 = data.runId;
      if (typeof data3 === "string") {
        if (!pattern17.test(data3)) {
          const err10 = {
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
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
      } else {
        const err11 = {
          instancePath: instancePath + "/runId",
          schemaPath: "#/$defs/runId/type",
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
    if (data.artifactIds !== undefined) {
      let data4 = data.artifactIds;
      if (Array.isArray(data4)) {
        if (data4.length > 256) {
          const err12 = {
            instancePath: instancePath + "/artifactIds",
            schemaPath: "#/properties/artifactIds/maxItems",
            keyword: "maxItems",
            params: { limit: 256 },
            message: "must NOT have more than 256 items",
          };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
        if (data4.length < 1) {
          const err13 = {
            instancePath: instancePath + "/artifactIds",
            schemaPath: "#/properties/artifactIds/minItems",
            keyword: "minItems",
            params: { limit: 1 },
            message: "must NOT have fewer than 1 items",
          };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
        const len0 = data4.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data5 = data4[i0];
          if (typeof data5 === "string") {
            if (!pattern13.test(data5)) {
              const err14 = {
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
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
          } else {
            const err15 = {
              instancePath: instancePath + "/artifactIds/" + i0,
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
      } else {
        const err16 = {
          instancePath: instancePath + "/artifactIds",
          schemaPath: "#/properties/artifactIds/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
    }
  } else {
    const err17 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err17];
    } else {
      vErrors.push(err17);
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
  /*# sourceURL="https://github.com/shaangill025/helmwright/schemas/object-event.schema.json" */ let vErrors =
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
      !validate25(data, {
        instancePath,
        parentData,
        parentDataProperty,
        rootData,
        dynamicAnchors,
      })
    ) {
      vErrors =
        vErrors === null
          ? validate25.errors
          : vErrors.concat(validate25.errors);
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
      } else {
        var props1 = validate27.evaluated.props;
      }
      var _valid0 = _errs5 === errors;
      if (_valid0 && valid0) {
        valid0 = false;
        passing0 = [passing0, 3];
      } else {
        if (_valid0) {
          valid0 = true;
          passing0 = 3;
          if (props0 !== true && props1 !== undefined) {
            if (props1 === true) {
              props0 = true;
            } else {
              props0 = props0 || {};
              Object.assign(props0, props1);
            }
          }
        }
        const _errs6 = errors;
        if (
          !validate42(data, {
            instancePath,
            parentData,
            parentDataProperty,
            rootData,
            dynamicAnchors,
          })
        ) {
          vErrors =
            vErrors === null
              ? validate42.errors
              : vErrors.concat(validate42.errors);
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
            !validate44(data, {
              instancePath,
              parentData,
              parentDataProperty,
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
          var _valid0 = _errs7 === errors;
          if (_valid0 && valid0) {
            valid0 = false;
            passing0 = [passing0, 5];
          } else {
            if (_valid0) {
              valid0 = true;
              passing0 = 5;
              if (props0 !== true) {
                props0 = true;
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
