// Generated from schemas/intake-event.schema.json by scripts/generate.ts. Do not edit.
"use strict";
export const validate = validate20;
export default validate20;
const schema31 = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/shaangill025/helmwright/schemas/intake-event.schema.json",
  title: "IntakeEvent",
  description:
    "Payload of an intake event in the session log (B10, Q52), validated before it is appended. `kind` equals the event's `type`; the writer checks that relation. Intake is a Ring 0 step (03 Intake): each task is classified once by the deterministic rubric, an owner override is logged with its reason, and the harness may later reclassify only upward.",
  type: "object",
  oneOf: [
    { $ref: "#/$defs/classified" },
    { $ref: "#/$defs/overridden" },
    { $ref: "#/$defs/reclassified" },
  ],
  $defs: {
    classified: {
      title: "IntakeClassified",
      description:
        "The rubric classified the task. `scopeSha256` is the SHA-256 of the canonical JSON of the sorted scope (of `[]` when the task declared none), so the class is bound to the exact scope it was computed from.",
      type: "object",
      additionalProperties: false,
      required: [
        "kind",
        "taskId",
        "class",
        "rubricVersion",
        "reasons",
        "scope",
        "scopeSha256",
        "declared",
        "friction",
        "sparring",
      ],
      properties: {
        kind: { const: "intake.classified" },
        taskId: {
          $comment:
            "Copy of the task ID pattern of run.ts and event.schema.json's `id`.",
          type: "string",
          pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$",
        },
        class: { $ref: "#/$defs/class" },
        rubricVersion: { $ref: "#/$defs/rubricVersion" },
        reasons: {
          description:
            "Why the rubric chose the class: one reason per rule that fired, in rule order.",
          type: "array",
          minItems: 1,
          maxItems: 64,
          items: { $ref: "#/$defs/reason" },
        },
        scope: {
          description:
            "The declared scope, sorted: repo-relative paths or globs (`*` within a segment, `**` for any number of segments). Empty when the task declared none.",
          type: "array",
          maxItems: 1024,
          items: { $ref: "#/$defs/entry" },
        },
        scopeSha256: { $ref: "#/$defs/sha256" },
        declared: { $ref: "#/$defs/declared" },
        friction: { $ref: "#/$defs/friction" },
        sparring: {
          description:
            "The sparring default the class sets. Only opt-in exists until A5.",
          const: "optIn",
        },
        costIfWrong: {
          description:
            "What a wrong class would cost, as escaped display text: a misclassification is a ruling the owner can review (03 Intake).",
          $ref: "#/$defs/text",
        },
      },
    },
    overridden: {
      title: "IntakeOverridden",
      description:
        "The owner overrode the class from the CLI with a reason. A downward override is approved at the TTY first; the attestation is none until slice SIG.",
      type: "object",
      additionalProperties: false,
      required: ["kind", "from", "to", "reason", "by", "attestation"],
      properties: {
        kind: { const: "intake.overridden" },
        from: { $ref: "#/$defs/class" },
        to: { $ref: "#/$defs/class" },
        reason: {
          description:
            "The owner's reason, escaped: not empty and not only spaces.",
          type: "string",
          pattern: "^[\\s\\S]{1,8192}$",
          not: { pattern: "^\\s*$" },
        },
        by: { const: "cli" },
        attestation: { $ref: "#/$defs/attestation" },
      },
    },
    reclassified: {
      title: "IntakeReclassified",
      description:
        "The harness reclassified the task because of a floor signal or the plan-time pass. Upward only (Q52): `to` ranks above `from` (chore < bounded < architectural). The schema cannot express that order, so the harness's upgradeOnly guard enforces it before the event is written.",
      type: "object",
      additionalProperties: false,
      required: ["kind", "from", "to", "source", "signalIds", "rubricVersion"],
      properties: {
        kind: { const: "intake.reclassified" },
        from: { $ref: "#/$defs/class" },
        to: { $ref: "#/$defs/class" },
        source: {
          description:
            "`floor`: a structural floor signal. `plan`: the plan-time pass.",
          enum: ["floor", "plan"],
        },
        signalIds: {
          description: "The signals that caused the reclassification.",
          type: "array",
          minItems: 1,
          maxItems: 256,
          items: {
            type: "string",
            pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$",
          },
        },
        rubricVersion: { $ref: "#/$defs/rubricVersion" },
      },
    },
    class: {
      title: "IntakeClass",
      description:
        "Task class, in rank order: chore < bounded < architectural.",
      enum: ["chore", "bounded", "architectural"],
    },
    rubricVersion: {
      description: "The rubric version, such as `intake-rubric-1`.",
      type: "string",
      pattern: "^intake-rubric-[1-9][0-9]{0,5}$",
    },
    reason: {
      title: "IntakeReason",
      description:
        "One rule that fired and the entries it fired on, escaped for display. `noDeclaredScope` and `newProcessBoundary` have no entries.",
      type: "object",
      additionalProperties: false,
      required: ["rule", "entries"],
      properties: {
        rule: { $ref: "#/$defs/rule" },
        entries: {
          type: "array",
          maxItems: 1024,
          items: { $ref: "#/$defs/text" },
        },
      },
    },
    rule: {
      title: "IntakeRule",
      description:
        "Rubric rules: no scope and the declared facts give architectural; Ring 0 paths and entries outside the docs and tests categories give bounded; docs-only and tests-only entries give chore.",
      enum: [
        "noDeclaredScope",
        "newDependencies",
        "newModules",
        "surfaceChanges",
        "newProcessBoundary",
        "ring0Path",
        "notDocsOrTests",
        "docsOnly",
        "testsOnly",
      ],
    },
    declared: {
      title: "IntakeDeclared",
      description:
        "Facts the task declares about its change. Any one of them makes the task architectural.",
      type: "object",
      additionalProperties: false,
      required: [
        "newDependencies",
        "newModules",
        "surfaceChanges",
        "newProcessBoundary",
      ],
      properties: {
        newDependencies: {
          type: "array",
          maxItems: 1024,
          items: { $ref: "#/$defs/entry" },
        },
        newModules: {
          type: "array",
          maxItems: 1024,
          items: { $ref: "#/$defs/entry" },
        },
        surfaceChanges: {
          type: "array",
          $comment:
            "A bound above 20 keeps the generated type an array, not a union of tuples.",
          maxItems: 64,
          items: { $ref: "#/$defs/surfaceChange" },
        },
        newProcessBoundary: { type: "boolean" },
      },
    },
    surfaceChange: {
      title: "IntakeSurfaceChange",
      enum: ["schema", "publicApi", "storage", "wire"],
    },
    friction: {
      title: "IntakeFriction",
      description:
        "The friction the class sets: `minimal` from the chore downgrade, otherwise the configured default intensity.",
      type: "object",
      additionalProperties: false,
      required: ["intensity", "source"],
      properties: {
        intensity: {
          $comment:
            "Copy of friction.defaultIntensity in helmwright-config.schema.json.",
          enum: ["moderate", "minimal", "low", "high"],
        },
        source: { enum: ["default", "choreDowngrade"] },
      },
    },
    attestation: {
      title: "IntakeAttestation",
      description: "Proof of who overrode. Until slice SIG only `none` exists.",
      oneOf: [{ $ref: "#/$defs/attestationNone" }],
    },
    attestationNone: {
      title: "IntakeAttestationNone",
      type: "object",
      additionalProperties: false,
      required: ["kind"],
      properties: { kind: { const: "none" } },
    },
    entry: {
      description:
        "A declared path, glob, module or dependency: 1 to 1024 characters without control characters.",
      type: "string",
      pattern: "^[^\\u0000-\\u001f\\u007f-\\u009f]{1,1024}$",
    },
    sha256: {
      description: "Lowercase hex SHA-256.",
      type: "string",
      pattern: "^[0-9a-f]{64}$",
    },
    text: {
      description: "Escaped display text, at most 8192 code points.",
      type: "string",
      pattern: "^[\\s\\S]{0,8192}$",
    },
  },
};
const schema32 = {
  title: "IntakeClassified",
  description:
    "The rubric classified the task. `scopeSha256` is the SHA-256 of the canonical JSON of the sorted scope (of `[]` when the task declared none), so the class is bound to the exact scope it was computed from.",
  type: "object",
  additionalProperties: false,
  required: [
    "kind",
    "taskId",
    "class",
    "rubricVersion",
    "reasons",
    "scope",
    "scopeSha256",
    "declared",
    "friction",
    "sparring",
  ],
  properties: {
    kind: { const: "intake.classified" },
    taskId: {
      $comment:
        "Copy of the task ID pattern of run.ts and event.schema.json's `id`.",
      type: "string",
      pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$",
    },
    class: { $ref: "#/$defs/class" },
    rubricVersion: { $ref: "#/$defs/rubricVersion" },
    reasons: {
      description:
        "Why the rubric chose the class: one reason per rule that fired, in rule order.",
      type: "array",
      minItems: 1,
      maxItems: 64,
      items: { $ref: "#/$defs/reason" },
    },
    scope: {
      description:
        "The declared scope, sorted: repo-relative paths or globs (`*` within a segment, `**` for any number of segments). Empty when the task declared none.",
      type: "array",
      maxItems: 1024,
      items: { $ref: "#/$defs/entry" },
    },
    scopeSha256: { $ref: "#/$defs/sha256" },
    declared: { $ref: "#/$defs/declared" },
    friction: { $ref: "#/$defs/friction" },
    sparring: {
      description:
        "The sparring default the class sets. Only opt-in exists until A5.",
      const: "optIn",
    },
    costIfWrong: {
      description:
        "What a wrong class would cost, as escaped display text: a misclassification is a ruling the owner can review (03 Intake).",
      $ref: "#/$defs/text",
    },
  },
};
const schema33 = {
  title: "IntakeClass",
  description: "Task class, in rank order: chore < bounded < architectural.",
  enum: ["chore", "bounded", "architectural"],
};
const schema34 = {
  description: "The rubric version, such as `intake-rubric-1`.",
  type: "string",
  pattern: "^intake-rubric-[1-9][0-9]{0,5}$",
};
const schema38 = {
  description:
    "A declared path, glob, module or dependency: 1 to 1024 characters without control characters.",
  type: "string",
  pattern: "^[^\\u0000-\\u001f\\u007f-\\u009f]{1,1024}$",
};
const schema39 = {
  description: "Lowercase hex SHA-256.",
  type: "string",
  pattern: "^[0-9a-f]{64}$",
};
const schema44 = {
  title: "IntakeFriction",
  description:
    "The friction the class sets: `minimal` from the chore downgrade, otherwise the configured default intensity.",
  type: "object",
  additionalProperties: false,
  required: ["intensity", "source"],
  properties: {
    intensity: {
      $comment:
        "Copy of friction.defaultIntensity in helmwright-config.schema.json.",
      enum: ["moderate", "minimal", "low", "high"],
    },
    source: { enum: ["default", "choreDowngrade"] },
  },
};
const schema37 = {
  description: "Escaped display text, at most 8192 code points.",
  type: "string",
  pattern: "^[\\s\\S]{0,8192}$",
};
const func1 = Object.prototype.hasOwnProperty;
const pattern4 = new RegExp("^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$", "u");
const pattern5 = new RegExp("^intake-rubric-[1-9][0-9]{0,5}$", "u");
const pattern7 = new RegExp("^[^\\u0000-\\u001f\\u007f-\\u009f]{1,1024}$", "u");
const pattern8 = new RegExp("^[0-9a-f]{64}$", "u");
const pattern6 = new RegExp("^[\\s\\S]{0,8192}$", "u");
const schema35 = {
  title: "IntakeReason",
  description:
    "One rule that fired and the entries it fired on, escaped for display. `noDeclaredScope` and `newProcessBoundary` have no entries.",
  type: "object",
  additionalProperties: false,
  required: ["rule", "entries"],
  properties: {
    rule: { $ref: "#/$defs/rule" },
    entries: { type: "array", maxItems: 1024, items: { $ref: "#/$defs/text" } },
  },
};
const schema36 = {
  title: "IntakeRule",
  description:
    "Rubric rules: no scope and the declared facts give architectural; Ring 0 paths and entries outside the docs and tests categories give bounded; docs-only and tests-only entries give chore.",
  enum: [
    "noDeclaredScope",
    "newDependencies",
    "newModules",
    "surfaceChanges",
    "newProcessBoundary",
    "ring0Path",
    "notDocsOrTests",
    "docsOnly",
    "testsOnly",
  ],
};
function validate22(
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
  const evaluated0 = validate22.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.rule === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "rule" },
        message: "must have required property '" + "rule" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.entries === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "entries" },
        message: "must have required property '" + "entries" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "rule" || key0 === "entries")) {
        const err2 = {
          instancePath,
          schemaPath: "#/additionalProperties",
          keyword: "additionalProperties",
          params: { additionalProperty: key0 },
          message: "must NOT have additional properties",
        };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.rule !== undefined) {
      let data0 = data.rule;
      if (!(
        data0 === "noDeclaredScope" ||
        data0 === "newDependencies" ||
        data0 === "newModules" ||
        data0 === "surfaceChanges" ||
        data0 === "newProcessBoundary" ||
        data0 === "ring0Path" ||
        data0 === "notDocsOrTests" ||
        data0 === "docsOnly" ||
        data0 === "testsOnly"
      )) {
        const err3 = {
          instancePath: instancePath + "/rule",
          schemaPath: "#/$defs/rule/enum",
          keyword: "enum",
          params: { allowedValues: schema36.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.entries !== undefined) {
      let data1 = data.entries;
      if (Array.isArray(data1)) {
        if (data1.length > 1024) {
          const err4 = {
            instancePath: instancePath + "/entries",
            schemaPath: "#/properties/entries/maxItems",
            keyword: "maxItems",
            params: { limit: 1024 },
            message: "must NOT have more than 1024 items",
          };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        const len0 = data1.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data2 = data1[i0];
          if (typeof data2 === "string") {
            if (!pattern6.test(data2)) {
              const err5 = {
                instancePath: instancePath + "/entries/" + i0,
                schemaPath: "#/$defs/text/pattern",
                keyword: "pattern",
                params: { pattern: "^[\\s\\S]{0,8192}$" },
                message: 'must match pattern "' + "^[\\s\\S]{0,8192}$" + '"',
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
              instancePath: instancePath + "/entries/" + i0,
              schemaPath: "#/$defs/text/type",
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
      } else {
        const err7 = {
          instancePath: instancePath + "/entries",
          schemaPath: "#/properties/entries/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
  } else {
    const err8 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err8];
    } else {
      vErrors.push(err8);
    }
    errors++;
  }
  validate22.errors = vErrors;
  return errors === 0;
}
validate22.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
const schema40 = {
  title: "IntakeDeclared",
  description:
    "Facts the task declares about its change. Any one of them makes the task architectural.",
  type: "object",
  additionalProperties: false,
  required: [
    "newDependencies",
    "newModules",
    "surfaceChanges",
    "newProcessBoundary",
  ],
  properties: {
    newDependencies: {
      type: "array",
      maxItems: 1024,
      items: { $ref: "#/$defs/entry" },
    },
    newModules: {
      type: "array",
      maxItems: 1024,
      items: { $ref: "#/$defs/entry" },
    },
    surfaceChanges: {
      type: "array",
      $comment:
        "A bound above 20 keeps the generated type an array, not a union of tuples.",
      maxItems: 64,
      items: { $ref: "#/$defs/surfaceChange" },
    },
    newProcessBoundary: { type: "boolean" },
  },
};
const schema43 = {
  title: "IntakeSurfaceChange",
  enum: ["schema", "publicApi", "storage", "wire"],
};
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
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.newDependencies === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "newDependencies" },
        message: "must have required property '" + "newDependencies" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.newModules === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "newModules" },
        message: "must have required property '" + "newModules" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.surfaceChanges === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "surfaceChanges" },
        message: "must have required property '" + "surfaceChanges" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.newProcessBoundary === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "newProcessBoundary" },
        message: "must have required property '" + "newProcessBoundary" + "'",
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
        key0 === "newDependencies" ||
        key0 === "newModules" ||
        key0 === "surfaceChanges" ||
        key0 === "newProcessBoundary"
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
    if (data.newDependencies !== undefined) {
      let data0 = data.newDependencies;
      if (Array.isArray(data0)) {
        if (data0.length > 1024) {
          const err5 = {
            instancePath: instancePath + "/newDependencies",
            schemaPath: "#/properties/newDependencies/maxItems",
            keyword: "maxItems",
            params: { limit: 1024 },
            message: "must NOT have more than 1024 items",
          };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        const len0 = data0.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data1 = data0[i0];
          if (typeof data1 === "string") {
            if (!pattern7.test(data1)) {
              const err6 = {
                instancePath: instancePath + "/newDependencies/" + i0,
                schemaPath: "#/$defs/entry/pattern",
                keyword: "pattern",
                params: {
                  pattern: "^[^\\u0000-\\u001f\\u007f-\\u009f]{1,1024}$",
                },
                message:
                  'must match pattern "' +
                  "^[^\\u0000-\\u001f\\u007f-\\u009f]{1,1024}$" +
                  '"',
              };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
          } else {
            const err7 = {
              instancePath: instancePath + "/newDependencies/" + i0,
              schemaPath: "#/$defs/entry/type",
              keyword: "type",
              params: { type: "string" },
              message: "must be string",
            };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
      } else {
        const err8 = {
          instancePath: instancePath + "/newDependencies",
          schemaPath: "#/properties/newDependencies/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.newModules !== undefined) {
      let data2 = data.newModules;
      if (Array.isArray(data2)) {
        if (data2.length > 1024) {
          const err9 = {
            instancePath: instancePath + "/newModules",
            schemaPath: "#/properties/newModules/maxItems",
            keyword: "maxItems",
            params: { limit: 1024 },
            message: "must NOT have more than 1024 items",
          };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
        const len1 = data2.length;
        for (let i1 = 0; i1 < len1; i1++) {
          let data3 = data2[i1];
          if (typeof data3 === "string") {
            if (!pattern7.test(data3)) {
              const err10 = {
                instancePath: instancePath + "/newModules/" + i1,
                schemaPath: "#/$defs/entry/pattern",
                keyword: "pattern",
                params: {
                  pattern: "^[^\\u0000-\\u001f\\u007f-\\u009f]{1,1024}$",
                },
                message:
                  'must match pattern "' +
                  "^[^\\u0000-\\u001f\\u007f-\\u009f]{1,1024}$" +
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
              instancePath: instancePath + "/newModules/" + i1,
              schemaPath: "#/$defs/entry/type",
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
      } else {
        const err12 = {
          instancePath: instancePath + "/newModules",
          schemaPath: "#/properties/newModules/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.surfaceChanges !== undefined) {
      let data4 = data.surfaceChanges;
      if (Array.isArray(data4)) {
        if (data4.length > 64) {
          const err13 = {
            instancePath: instancePath + "/surfaceChanges",
            schemaPath: "#/properties/surfaceChanges/maxItems",
            keyword: "maxItems",
            params: { limit: 64 },
            message: "must NOT have more than 64 items",
          };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
        const len2 = data4.length;
        for (let i2 = 0; i2 < len2; i2++) {
          let data5 = data4[i2];
          if (!(
            data5 === "schema" ||
            data5 === "publicApi" ||
            data5 === "storage" ||
            data5 === "wire"
          )) {
            const err14 = {
              instancePath: instancePath + "/surfaceChanges/" + i2,
              schemaPath: "#/$defs/surfaceChange/enum",
              keyword: "enum",
              params: { allowedValues: schema43.enum },
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
      } else {
        const err15 = {
          instancePath: instancePath + "/surfaceChanges",
          schemaPath: "#/properties/surfaceChanges/type",
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
    if (data.newProcessBoundary !== undefined) {
      if (typeof data.newProcessBoundary !== "boolean") {
        const err16 = {
          instancePath: instancePath + "/newProcessBoundary",
          schemaPath: "#/properties/newProcessBoundary/type",
          keyword: "type",
          params: { type: "boolean" },
          message: "must be boolean",
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
  validate24.errors = vErrors;
  return errors === 0;
}
validate24.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
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
    if (data.class === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "class" },
        message: "must have required property '" + "class" + "'",
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
    if (data.reasons === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "reasons" },
        message: "must have required property '" + "reasons" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.scope === undefined) {
      const err5 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "scope" },
        message: "must have required property '" + "scope" + "'",
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.scopeSha256 === undefined) {
      const err6 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "scopeSha256" },
        message: "must have required property '" + "scopeSha256" + "'",
      };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.declared === undefined) {
      const err7 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "declared" },
        message: "must have required property '" + "declared" + "'",
      };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.friction === undefined) {
      const err8 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "friction" },
        message: "must have required property '" + "friction" + "'",
      };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    if (data.sparring === undefined) {
      const err9 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "sparring" },
        message: "must have required property '" + "sparring" + "'",
      };
      if (vErrors === null) {
        vErrors = [err9];
      } else {
        vErrors.push(err9);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func1.call(schema32.properties, key0)) {
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
      if ("intake.classified" !== data.kind) {
        const err11 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "intake.classified" },
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
    if (data.taskId !== undefined) {
      let data1 = data.taskId;
      if (typeof data1 === "string") {
        if (!pattern4.test(data1)) {
          const err12 = {
            instancePath: instancePath + "/taskId",
            schemaPath: "#/properties/taskId/pattern",
            keyword: "pattern",
            params: { pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$" },
            message:
              'must match pattern "' +
              "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$" +
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
          instancePath: instancePath + "/taskId",
          schemaPath: "#/properties/taskId/type",
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
    if (data.class !== undefined) {
      let data2 = data.class;
      if (!(
        data2 === "chore" ||
        data2 === "bounded" ||
        data2 === "architectural"
      )) {
        const err14 = {
          instancePath: instancePath + "/class",
          schemaPath: "#/$defs/class/enum",
          keyword: "enum",
          params: { allowedValues: schema33.enum },
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
    if (data.rubricVersion !== undefined) {
      let data3 = data.rubricVersion;
      if (typeof data3 === "string") {
        if (!pattern5.test(data3)) {
          const err15 = {
            instancePath: instancePath + "/rubricVersion",
            schemaPath: "#/$defs/rubricVersion/pattern",
            keyword: "pattern",
            params: { pattern: "^intake-rubric-[1-9][0-9]{0,5}$" },
            message:
              'must match pattern "' + "^intake-rubric-[1-9][0-9]{0,5}$" + '"',
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
          instancePath: instancePath + "/rubricVersion",
          schemaPath: "#/$defs/rubricVersion/type",
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
    if (data.reasons !== undefined) {
      let data4 = data.reasons;
      if (Array.isArray(data4)) {
        if (data4.length > 64) {
          const err17 = {
            instancePath: instancePath + "/reasons",
            schemaPath: "#/properties/reasons/maxItems",
            keyword: "maxItems",
            params: { limit: 64 },
            message: "must NOT have more than 64 items",
          };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        }
        if (data4.length < 1) {
          const err18 = {
            instancePath: instancePath + "/reasons",
            schemaPath: "#/properties/reasons/minItems",
            keyword: "minItems",
            params: { limit: 1 },
            message: "must NOT have fewer than 1 items",
          };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
        const len0 = data4.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (
            !validate22(data4[i0], {
              instancePath: instancePath + "/reasons/" + i0,
              parentData: data4,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors =
              vErrors === null
                ? validate22.errors
                : vErrors.concat(validate22.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err19 = {
          instancePath: instancePath + "/reasons",
          schemaPath: "#/properties/reasons/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
    }
    if (data.scope !== undefined) {
      let data6 = data.scope;
      if (Array.isArray(data6)) {
        if (data6.length > 1024) {
          const err20 = {
            instancePath: instancePath + "/scope",
            schemaPath: "#/properties/scope/maxItems",
            keyword: "maxItems",
            params: { limit: 1024 },
            message: "must NOT have more than 1024 items",
          };
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        }
        const len1 = data6.length;
        for (let i1 = 0; i1 < len1; i1++) {
          let data7 = data6[i1];
          if (typeof data7 === "string") {
            if (!pattern7.test(data7)) {
              const err21 = {
                instancePath: instancePath + "/scope/" + i1,
                schemaPath: "#/$defs/entry/pattern",
                keyword: "pattern",
                params: {
                  pattern: "^[^\\u0000-\\u001f\\u007f-\\u009f]{1,1024}$",
                },
                message:
                  'must match pattern "' +
                  "^[^\\u0000-\\u001f\\u007f-\\u009f]{1,1024}$" +
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
              instancePath: instancePath + "/scope/" + i1,
              schemaPath: "#/$defs/entry/type",
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
          instancePath: instancePath + "/scope",
          schemaPath: "#/properties/scope/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err23];
        } else {
          vErrors.push(err23);
        }
        errors++;
      }
    }
    if (data.scopeSha256 !== undefined) {
      let data8 = data.scopeSha256;
      if (typeof data8 === "string") {
        if (!pattern8.test(data8)) {
          const err24 = {
            instancePath: instancePath + "/scopeSha256",
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
          instancePath: instancePath + "/scopeSha256",
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
    if (data.declared !== undefined) {
      if (
        !validate24(data.declared, {
          instancePath: instancePath + "/declared",
          parentData: data,
          parentDataProperty: "declared",
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
    }
    if (data.friction !== undefined) {
      let data10 = data.friction;
      if (data10 && typeof data10 == "object" && !Array.isArray(data10)) {
        if (data10.intensity === undefined) {
          const err26 = {
            instancePath: instancePath + "/friction",
            schemaPath: "#/$defs/friction/required",
            keyword: "required",
            params: { missingProperty: "intensity" },
            message: "must have required property '" + "intensity" + "'",
          };
          if (vErrors === null) {
            vErrors = [err26];
          } else {
            vErrors.push(err26);
          }
          errors++;
        }
        if (data10.source === undefined) {
          const err27 = {
            instancePath: instancePath + "/friction",
            schemaPath: "#/$defs/friction/required",
            keyword: "required",
            params: { missingProperty: "source" },
            message: "must have required property '" + "source" + "'",
          };
          if (vErrors === null) {
            vErrors = [err27];
          } else {
            vErrors.push(err27);
          }
          errors++;
        }
        for (const key1 in data10) {
          if (!(key1 === "intensity" || key1 === "source")) {
            const err28 = {
              instancePath: instancePath + "/friction",
              schemaPath: "#/$defs/friction/additionalProperties",
              keyword: "additionalProperties",
              params: { additionalProperty: key1 },
              message: "must NOT have additional properties",
            };
            if (vErrors === null) {
              vErrors = [err28];
            } else {
              vErrors.push(err28);
            }
            errors++;
          }
        }
        if (data10.intensity !== undefined) {
          let data11 = data10.intensity;
          if (!(
            data11 === "moderate" ||
            data11 === "minimal" ||
            data11 === "low" ||
            data11 === "high"
          )) {
            const err29 = {
              instancePath: instancePath + "/friction/intensity",
              schemaPath: "#/$defs/friction/properties/intensity/enum",
              keyword: "enum",
              params: { allowedValues: schema44.properties.intensity.enum },
              message: "must be equal to one of the allowed values",
            };
            if (vErrors === null) {
              vErrors = [err29];
            } else {
              vErrors.push(err29);
            }
            errors++;
          }
        }
        if (data10.source !== undefined) {
          let data12 = data10.source;
          if (!(data12 === "default" || data12 === "choreDowngrade")) {
            const err30 = {
              instancePath: instancePath + "/friction/source",
              schemaPath: "#/$defs/friction/properties/source/enum",
              keyword: "enum",
              params: { allowedValues: schema44.properties.source.enum },
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
      } else {
        const err31 = {
          instancePath: instancePath + "/friction",
          schemaPath: "#/$defs/friction/type",
          keyword: "type",
          params: { type: "object" },
          message: "must be object",
        };
        if (vErrors === null) {
          vErrors = [err31];
        } else {
          vErrors.push(err31);
        }
        errors++;
      }
    }
    if (data.sparring !== undefined) {
      if ("optIn" !== data.sparring) {
        const err32 = {
          instancePath: instancePath + "/sparring",
          schemaPath: "#/properties/sparring/const",
          keyword: "const",
          params: { allowedValue: "optIn" },
          message: "must be equal to constant",
        };
        if (vErrors === null) {
          vErrors = [err32];
        } else {
          vErrors.push(err32);
        }
        errors++;
      }
    }
    if (data.costIfWrong !== undefined) {
      let data14 = data.costIfWrong;
      if (typeof data14 === "string") {
        if (!pattern6.test(data14)) {
          const err33 = {
            instancePath: instancePath + "/costIfWrong",
            schemaPath: "#/$defs/text/pattern",
            keyword: "pattern",
            params: { pattern: "^[\\s\\S]{0,8192}$" },
            message: 'must match pattern "' + "^[\\s\\S]{0,8192}$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err33];
          } else {
            vErrors.push(err33);
          }
          errors++;
        }
      } else {
        const err34 = {
          instancePath: instancePath + "/costIfWrong",
          schemaPath: "#/$defs/text/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
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
  validate21.errors = vErrors;
  return errors === 0;
}
validate21.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
const schema46 = {
  title: "IntakeOverridden",
  description:
    "The owner overrode the class from the CLI with a reason. A downward override is approved at the TTY first; the attestation is none until slice SIG.",
  type: "object",
  additionalProperties: false,
  required: ["kind", "from", "to", "reason", "by", "attestation"],
  properties: {
    kind: { const: "intake.overridden" },
    from: { $ref: "#/$defs/class" },
    to: { $ref: "#/$defs/class" },
    reason: {
      description:
        "The owner's reason, escaped: not empty and not only spaces.",
      type: "string",
      pattern: "^[\\s\\S]{1,8192}$",
      not: { pattern: "^\\s*$" },
    },
    by: { const: "cli" },
    attestation: { $ref: "#/$defs/attestation" },
  },
};
const pattern12 = new RegExp("^\\s*$", "u");
const pattern13 = new RegExp("^[\\s\\S]{1,8192}$", "u");
const schema49 = {
  title: "IntakeAttestation",
  description: "Proof of who overrode. Until slice SIG only `none` exists.",
  oneOf: [{ $ref: "#/$defs/attestationNone" }],
};
const schema50 = {
  title: "IntakeAttestationNone",
  type: "object",
  additionalProperties: false,
  required: ["kind"],
  properties: { kind: { const: "none" } },
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
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.kind === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/$defs/attestationNone/required",
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
          schemaPath: "#/$defs/attestationNone/additionalProperties",
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
      if ("none" !== data.kind) {
        const err2 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/$defs/attestationNone/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "none" },
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
      schemaPath: "#/$defs/attestationNone/type",
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
  if (!valid0) {
    const err4 = {
      instancePath,
      schemaPath: "#/oneOf",
      keyword: "oneOf",
      params: { passingSchemas: passing0 },
      message: "must match exactly one schema in oneOf",
    };
    if (vErrors === null) {
      vErrors = [err4];
    } else {
      vErrors.push(err4);
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
  validate28.errors = vErrors;
  evaluated0.props = props0;
  return errors === 0;
}
validate28.evaluated = { dynamicProps: true, dynamicItems: false };
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
    if (data.from === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "from" },
        message: "must have required property '" + "from" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.to === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "to" },
        message: "must have required property '" + "to" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.reason === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "reason" },
        message: "must have required property '" + "reason" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.by === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "by" },
        message: "must have required property '" + "by" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.attestation === undefined) {
      const err5 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "attestation" },
        message: "must have required property '" + "attestation" + "'",
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
        key0 === "from" ||
        key0 === "to" ||
        key0 === "reason" ||
        key0 === "by" ||
        key0 === "attestation"
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
      if ("intake.overridden" !== data.kind) {
        const err7 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "intake.overridden" },
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
    if (data.from !== undefined) {
      let data1 = data.from;
      if (!(
        data1 === "chore" ||
        data1 === "bounded" ||
        data1 === "architectural"
      )) {
        const err8 = {
          instancePath: instancePath + "/from",
          schemaPath: "#/$defs/class/enum",
          keyword: "enum",
          params: { allowedValues: schema33.enum },
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
    if (data.to !== undefined) {
      let data2 = data.to;
      if (!(
        data2 === "chore" ||
        data2 === "bounded" ||
        data2 === "architectural"
      )) {
        const err9 = {
          instancePath: instancePath + "/to",
          schemaPath: "#/$defs/class/enum",
          keyword: "enum",
          params: { allowedValues: schema33.enum },
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
    if (data.reason !== undefined) {
      let data3 = data.reason;
      const _errs9 = errors;
      const _errs10 = errors;
      if (typeof data3 === "string") {
        if (!pattern12.test(data3)) {
          const err10 = {};
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
      }
      var valid3 = _errs10 === errors;
      if (valid3) {
        const err11 = {
          instancePath: instancePath + "/reason",
          schemaPath: "#/properties/reason/not",
          keyword: "not",
          params: {},
          message: "must NOT be valid",
        };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      } else {
        errors = _errs9;
        if (vErrors !== null) {
          if (_errs9) {
            vErrors.length = _errs9;
          } else {
            vErrors = null;
          }
        }
      }
      if (typeof data3 === "string") {
        if (!pattern13.test(data3)) {
          const err12 = {
            instancePath: instancePath + "/reason",
            schemaPath: "#/properties/reason/pattern",
            keyword: "pattern",
            params: { pattern: "^[\\s\\S]{1,8192}$" },
            message: 'must match pattern "' + "^[\\s\\S]{1,8192}$" + '"',
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
          instancePath: instancePath + "/reason",
          schemaPath: "#/properties/reason/type",
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
    if (data.by !== undefined) {
      if ("cli" !== data.by) {
        const err14 = {
          instancePath: instancePath + "/by",
          schemaPath: "#/properties/by/const",
          keyword: "const",
          params: { allowedValue: "cli" },
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
    if (data.attestation !== undefined) {
      if (
        !validate28(data.attestation, {
          instancePath: instancePath + "/attestation",
          parentData: data,
          parentDataProperty: "attestation",
          rootData,
          dynamicAnchors,
        })
      ) {
        vErrors =
          vErrors === null
            ? validate28.errors
            : vErrors.concat(validate28.errors);
        errors = vErrors.length;
      }
    }
  } else {
    const err15 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err15];
    } else {
      vErrors.push(err15);
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
const schema51 = {
  title: "IntakeReclassified",
  description:
    "The harness reclassified the task because of a floor signal or the plan-time pass. Upward only (Q52): `to` ranks above `from` (chore < bounded < architectural). The schema cannot express that order, so the harness's upgradeOnly guard enforces it before the event is written.",
  type: "object",
  additionalProperties: false,
  required: ["kind", "from", "to", "source", "signalIds", "rubricVersion"],
  properties: {
    kind: { const: "intake.reclassified" },
    from: { $ref: "#/$defs/class" },
    to: { $ref: "#/$defs/class" },
    source: {
      description:
        "`floor`: a structural floor signal. `plan`: the plan-time pass.",
      enum: ["floor", "plan"],
    },
    signalIds: {
      description: "The signals that caused the reclassification.",
      type: "array",
      minItems: 1,
      maxItems: 256,
      items: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$" },
    },
    rubricVersion: { $ref: "#/$defs/rubricVersion" },
  },
};
const pattern14 = new RegExp("^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$", "u");
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
    if (data.from === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "from" },
        message: "must have required property '" + "from" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.to === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "to" },
        message: "must have required property '" + "to" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.source === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "source" },
        message: "must have required property '" + "source" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.signalIds === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "signalIds" },
        message: "must have required property '" + "signalIds" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.rubricVersion === undefined) {
      const err5 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "rubricVersion" },
        message: "must have required property '" + "rubricVersion" + "'",
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
        key0 === "from" ||
        key0 === "to" ||
        key0 === "source" ||
        key0 === "signalIds" ||
        key0 === "rubricVersion"
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
      if ("intake.reclassified" !== data.kind) {
        const err7 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "intake.reclassified" },
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
    if (data.from !== undefined) {
      let data1 = data.from;
      if (!(
        data1 === "chore" ||
        data1 === "bounded" ||
        data1 === "architectural"
      )) {
        const err8 = {
          instancePath: instancePath + "/from",
          schemaPath: "#/$defs/class/enum",
          keyword: "enum",
          params: { allowedValues: schema33.enum },
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
    if (data.to !== undefined) {
      let data2 = data.to;
      if (!(
        data2 === "chore" ||
        data2 === "bounded" ||
        data2 === "architectural"
      )) {
        const err9 = {
          instancePath: instancePath + "/to",
          schemaPath: "#/$defs/class/enum",
          keyword: "enum",
          params: { allowedValues: schema33.enum },
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
    if (data.source !== undefined) {
      let data3 = data.source;
      if (!(data3 === "floor" || data3 === "plan")) {
        const err10 = {
          instancePath: instancePath + "/source",
          schemaPath: "#/properties/source/enum",
          keyword: "enum",
          params: { allowedValues: schema51.properties.source.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.signalIds !== undefined) {
      let data4 = data.signalIds;
      if (Array.isArray(data4)) {
        if (data4.length > 256) {
          const err11 = {
            instancePath: instancePath + "/signalIds",
            schemaPath: "#/properties/signalIds/maxItems",
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
        if (data4.length < 1) {
          const err12 = {
            instancePath: instancePath + "/signalIds",
            schemaPath: "#/properties/signalIds/minItems",
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
        const len0 = data4.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data5 = data4[i0];
          if (typeof data5 === "string") {
            if (!pattern14.test(data5)) {
              const err13 = {
                instancePath: instancePath + "/signalIds/" + i0,
                schemaPath: "#/properties/signalIds/items/pattern",
                keyword: "pattern",
                params: { pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$" },
                message:
                  'must match pattern "' +
                  "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$" +
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
              instancePath: instancePath + "/signalIds/" + i0,
              schemaPath: "#/properties/signalIds/items/type",
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
          instancePath: instancePath + "/signalIds",
          schemaPath: "#/properties/signalIds/type",
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
    if (data.rubricVersion !== undefined) {
      let data6 = data.rubricVersion;
      if (typeof data6 === "string") {
        if (!pattern5.test(data6)) {
          const err16 = {
            instancePath: instancePath + "/rubricVersion",
            schemaPath: "#/$defs/rubricVersion/pattern",
            keyword: "pattern",
            params: { pattern: "^intake-rubric-[1-9][0-9]{0,5}$" },
            message:
              'must match pattern "' + "^intake-rubric-[1-9][0-9]{0,5}$" + '"',
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
          instancePath: instancePath + "/rubricVersion",
          schemaPath: "#/$defs/rubricVersion/type",
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
  } else {
    const err18 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err18];
    } else {
      vErrors.push(err18);
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
  /*# sourceURL="https://github.com/shaangill025/helmwright/schemas/intake-event.schema.json" */ let vErrors =
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
    !validate27(data, {
      instancePath,
      parentData,
      parentDataProperty,
      rootData,
      dynamicAnchors,
    })
  ) {
    vErrors =
      vErrors === null ? validate27.errors : vErrors.concat(validate27.errors);
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
