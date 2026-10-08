// Generated from schemas/objects.schema.json by scripts/generate.ts. Do not edit.
"use strict";
export const validate = validate20;
export default validate20;
const schema31 = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/shaangill025/helmwright/schemas/objects.schema.json",
  title: "ObjectRecord",
  description:
    "One record of the harness object model (10 Ontology position, Q61): the five kinds Task, Run, Artifact, Rule and Skill. Event is the session-log envelope (event.schema.json); Decision with Ruling arrives in B5-1b. Every object carries its ring, kind-prefixed ID, typed links by ID pattern, and the seq and time of the event that created it. Link existence, uniqueness inside arrays, sorted scope and the footprint content address are relations the harness checks, not the schema.",
  type: "object",
  oneOf: [
    { $ref: "#/$defs/task" },
    { $ref: "#/$defs/run" },
    { $ref: "#/$defs/artifact" },
    { $ref: "#/$defs/rule" },
    { $ref: "#/$defs/skill" },
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
        "One execution of a Task at a base commit with the intake class it started with (after any owner override; a later upward reclassification is an `intake.reclassified` event), written by the harness at run start; only `terminal` changes, once, at `run.terminated`.",
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
      description: "Escaped text, 1 to 8192 code points, not only spaces.",
      type: "string",
      pattern: "^[\\s\\S]{1,8192}$",
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
  description: "Escaped text, 1 to 8192 code points, not only spaces.",
  type: "string",
  pattern: "^[\\s\\S]{1,8192}$",
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
const pattern8 = new RegExp("^[\\s\\S]{1,8192}$", "u");
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
            params: { pattern: "^[\\s\\S]{1,8192}$" },
            message: 'must match pattern "' + "^[\\s\\S]{1,8192}$" + '"',
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
    "One execution of a Task at a base commit with the intake class it started with (after any owner override; a later upward reclassification is an `intake.reclassified` event), written by the harness at run start; only `terminal` changes, once, at `run.terminated`.",
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
            params: { pattern: "^[\\s\\S]{1,8192}$" },
            message: 'must match pattern "' + "^[\\s\\S]{1,8192}$" + '"',
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
