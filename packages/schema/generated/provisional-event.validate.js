// Generated from schemas/provisional-event.schema.json by scripts/generate.ts. Do not edit.
"use strict";
export const validate = validate20;
export default validate20;
const schema31 = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/shaangill025/helmwright/schemas/provisional-event.schema.json",
  title: "ProvisionalEvent",
  description:
    "Payload of a provisional-branch event in the session log (PB, X3 revised), validated before it is appended. `kind` equals the event's `type`; the writer checks that relation. A run that ends with a pending owner decision of class technology or scope forks one provisional commit per decision from the floor's own candidate tree. Fork and discard are Ring 0 and pure functions of logged facts: the commit ID is recomputed on replay. The log holds no recommendation (Q48). PB-1 writes `provisional.opened` or `provisional.refused`; the other two are reserved for the work that builds on a provisional branch (PB-2) and for the owner's answer (PB-3).",
  type: "object",
  oneOf: [
    { $ref: "#/$defs/opened" },
    { $ref: "#/$defs/refused" },
    { $ref: "#/$defs/attached" },
    { $ref: "#/$defs/resolved" },
  ],
  $defs: {
    opened: {
      title: "ProvisionalOpened",
      description:
        "A provisional commit was made for the owner decision `decisionId`, logged after that `decision.opened` and before `floor.checked`, in the floor's transaction. `ref` is `refs/helmwright/provisional/<decisionId>` in the host repository's common git dir; it is created only after the transaction commits, is never under `refs/heads` and is never pushed. `commit` is the deterministic commit of `tree` (the floor's `candidateTree`) on `baseCommit`.",
      type: "object",
      additionalProperties: false,
      required: [
        "kind",
        "decisionId",
        "class",
        "commit",
        "tree",
        "baseCommit",
        "ref",
      ],
      properties: {
        kind: { const: "provisional.opened" },
        decisionId: { $ref: "#/$defs/decisionId" },
        class: {
          description:
            "The decision's class: architecture is never provisional.",
          enum: ["scope", "technology"],
        },
        commit: { $ref: "#/$defs/oid" },
        tree: {
          $ref: "#/$defs/oid",
          description: "The commit's tree: `floor.checked.candidateTree`.",
        },
        baseCommit: {
          $ref: "#/$defs/oid",
          description: "The commit's only parent: `run.started.baseCommit`.",
        },
        ref: {
          type: "string",
          pattern:
            "^refs/helmwright/provisional/decision-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$",
        },
      },
    },
    refused: {
      title: "ProvisionalRefused",
      description:
        "The fork for the owner decision `decisionId` was refused, logged in place of `provisional.opened`: `cap` means the repository already has the most open provisional branches. The floor is logged as usual; only the run fails.",
      type: "object",
      additionalProperties: false,
      required: ["kind", "decisionId", "reason"],
      properties: {
        kind: { const: "provisional.refused" },
        decisionId: { $ref: "#/$defs/decisionId" },
        reason: { enum: ["cap"] },
      },
    },
    attached: {
      title: "ProvisionalAttached",
      description:
        "Reserved (PB-2): a run's work was built on the provisional commit `commit` of the pending decision `decisionId`. Not written by PB-1.",
      type: "object",
      additionalProperties: false,
      required: ["kind", "decisionId", "runId", "commit"],
      properties: {
        kind: { const: "provisional.attached" },
        decisionId: { $ref: "#/$defs/decisionId" },
        runId: { $ref: "#/$defs/runId" },
        commit: { $ref: "#/$defs/oid" },
      },
    },
    resolved: {
      title: "ProvisionalResolved",
      description:
        "Reserved (PB-3): the owner answered `decisionId`, so its provisional branch was confirmed or discarded. Not written by PB-1.",
      type: "object",
      additionalProperties: false,
      required: ["kind", "decisionId", "outcome", "chosenOption", "resolvedBy"],
      properties: {
        kind: { const: "provisional.resolved" },
        decisionId: { $ref: "#/$defs/decisionId" },
        outcome: { enum: ["confirmed", "discarded"] },
        chosenOption: { $ref: "#/$defs/optionId" },
        resolvedBy: {
          description:
            "Who resolved it: the ID of the event or the owner answer that did, as shown text.",
          type: "string",
          pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$",
        },
      },
    },
    decisionId: {
      type: "string",
      pattern: "^decision-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$",
    },
    runId: { type: "string", pattern: "^run-[A-Za-z0-9][A-Za-z0-9_-]{0,123}$" },
    optionId: {
      description: "A Brief option ID.",
      type: "string",
      pattern: "^[a-z][a-z0-9-]{0,31}$",
    },
    oid: {
      description: "A full lowercase hex git object ID (SHA-1 or SHA-256).",
      type: "string",
      pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$",
    },
  },
};
const schema32 = {
  title: "ProvisionalOpened",
  description:
    "A provisional commit was made for the owner decision `decisionId`, logged after that `decision.opened` and before `floor.checked`, in the floor's transaction. `ref` is `refs/helmwright/provisional/<decisionId>` in the host repository's common git dir; it is created only after the transaction commits, is never under `refs/heads` and is never pushed. `commit` is the deterministic commit of `tree` (the floor's `candidateTree`) on `baseCommit`.",
  type: "object",
  additionalProperties: false,
  required: [
    "kind",
    "decisionId",
    "class",
    "commit",
    "tree",
    "baseCommit",
    "ref",
  ],
  properties: {
    kind: { const: "provisional.opened" },
    decisionId: { $ref: "#/$defs/decisionId" },
    class: {
      description: "The decision's class: architecture is never provisional.",
      enum: ["scope", "technology"],
    },
    commit: { $ref: "#/$defs/oid" },
    tree: {
      $ref: "#/$defs/oid",
      description: "The commit's tree: `floor.checked.candidateTree`.",
    },
    baseCommit: {
      $ref: "#/$defs/oid",
      description: "The commit's only parent: `run.started.baseCommit`.",
    },
    ref: {
      type: "string",
      pattern:
        "^refs/helmwright/provisional/decision-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$",
    },
  },
};
const schema33 = {
  type: "string",
  pattern: "^decision-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$",
};
const schema34 = {
  description: "A full lowercase hex git object ID (SHA-1 or SHA-256).",
  type: "string",
  pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$",
};
const pattern4 = new RegExp("^decision-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$", "u");
const pattern5 = new RegExp("^(?:[0-9a-f]{40}|[0-9a-f]{64})$", "u");
const pattern8 = new RegExp(
  "^refs/helmwright/provisional/decision-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$",
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
    if (data.commit === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "commit" },
        message: "must have required property '" + "commit" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.tree === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "tree" },
        message: "must have required property '" + "tree" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.baseCommit === undefined) {
      const err5 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "baseCommit" },
        message: "must have required property '" + "baseCommit" + "'",
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.ref === undefined) {
      const err6 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "ref" },
        message: "must have required property '" + "ref" + "'",
      };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(
        key0 === "kind" ||
        key0 === "decisionId" ||
        key0 === "class" ||
        key0 === "commit" ||
        key0 === "tree" ||
        key0 === "baseCommit" ||
        key0 === "ref"
      )) {
        const err7 = {
          instancePath,
          schemaPath: "#/additionalProperties",
          keyword: "additionalProperties",
          params: { additionalProperty: key0 },
          message: "must NOT have additional properties",
        };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.kind !== undefined) {
      if ("provisional.opened" !== data.kind) {
        const err8 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "provisional.opened" },
          message: "must be equal to constant",
        };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.decisionId !== undefined) {
      let data1 = data.decisionId;
      if (typeof data1 === "string") {
        if (!pattern4.test(data1)) {
          const err9 = {
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
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
      } else {
        const err10 = {
          instancePath: instancePath + "/decisionId",
          schemaPath: "#/$defs/decisionId/type",
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
    if (data.class !== undefined) {
      let data2 = data.class;
      if (!(data2 === "scope" || data2 === "technology")) {
        const err11 = {
          instancePath: instancePath + "/class",
          schemaPath: "#/properties/class/enum",
          keyword: "enum",
          params: { allowedValues: schema32.properties.class.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    if (data.commit !== undefined) {
      let data3 = data.commit;
      if (typeof data3 === "string") {
        if (!pattern5.test(data3)) {
          const err12 = {
            instancePath: instancePath + "/commit",
            schemaPath: "#/$defs/oid/pattern",
            keyword: "pattern",
            params: { pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$" },
            message:
              'must match pattern "' + "^(?:[0-9a-f]{40}|[0-9a-f]{64})$" + '"',
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
          instancePath: instancePath + "/commit",
          schemaPath: "#/$defs/oid/type",
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
    if (data.tree !== undefined) {
      let data4 = data.tree;
      if (typeof data4 === "string") {
        if (!pattern5.test(data4)) {
          const err14 = {
            instancePath: instancePath + "/tree",
            schemaPath: "#/$defs/oid/pattern",
            keyword: "pattern",
            params: { pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$" },
            message:
              'must match pattern "' + "^(?:[0-9a-f]{40}|[0-9a-f]{64})$" + '"',
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
          instancePath: instancePath + "/tree",
          schemaPath: "#/$defs/oid/type",
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
    if (data.baseCommit !== undefined) {
      let data5 = data.baseCommit;
      if (typeof data5 === "string") {
        if (!pattern5.test(data5)) {
          const err16 = {
            instancePath: instancePath + "/baseCommit",
            schemaPath: "#/$defs/oid/pattern",
            keyword: "pattern",
            params: { pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$" },
            message:
              'must match pattern "' + "^(?:[0-9a-f]{40}|[0-9a-f]{64})$" + '"',
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
          instancePath: instancePath + "/baseCommit",
          schemaPath: "#/$defs/oid/type",
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
    if (data.ref !== undefined) {
      let data6 = data.ref;
      if (typeof data6 === "string") {
        if (!pattern8.test(data6)) {
          const err18 = {
            instancePath: instancePath + "/ref",
            schemaPath: "#/properties/ref/pattern",
            keyword: "pattern",
            params: {
              pattern:
                "^refs/helmwright/provisional/decision-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$",
            },
            message:
              'must match pattern "' +
              "^refs/helmwright/provisional/decision-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$" +
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
          instancePath: instancePath + "/ref",
          schemaPath: "#/properties/ref/type",
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
  validate21.errors = vErrors;
  return errors === 0;
}
validate21.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
const schema37 = {
  title: "ProvisionalRefused",
  description:
    "The fork for the owner decision `decisionId` was refused, logged in place of `provisional.opened`: `cap` means the repository already has the most open provisional branches. The floor is logged as usual; only the run fails.",
  type: "object",
  additionalProperties: false,
  required: ["kind", "decisionId", "reason"],
  properties: {
    kind: { const: "provisional.refused" },
    decisionId: { $ref: "#/$defs/decisionId" },
    reason: { enum: ["cap"] },
  },
};
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
    if (data.reason === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "reason" },
        message: "must have required property '" + "reason" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "kind" || key0 === "decisionId" || key0 === "reason")) {
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
      if ("provisional.refused" !== data.kind) {
        const err4 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "provisional.refused" },
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
        if (!pattern4.test(data1)) {
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
    if (data.reason !== undefined) {
      if (!(data.reason === "cap")) {
        const err7 = {
          instancePath: instancePath + "/reason",
          schemaPath: "#/properties/reason/enum",
          keyword: "enum",
          params: { allowedValues: schema37.properties.reason.enum },
          message: "must be equal to one of the allowed values",
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
  validate23.errors = vErrors;
  return errors === 0;
}
validate23.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
const schema39 = {
  title: "ProvisionalAttached",
  description:
    "Reserved (PB-2): a run's work was built on the provisional commit `commit` of the pending decision `decisionId`. Not written by PB-1.",
  type: "object",
  additionalProperties: false,
  required: ["kind", "decisionId", "runId", "commit"],
  properties: {
    kind: { const: "provisional.attached" },
    decisionId: { $ref: "#/$defs/decisionId" },
    runId: { $ref: "#/$defs/runId" },
    commit: { $ref: "#/$defs/oid" },
  },
};
const schema41 = {
  type: "string",
  pattern: "^run-[A-Za-z0-9][A-Za-z0-9_-]{0,123}$",
};
const pattern11 = new RegExp("^run-[A-Za-z0-9][A-Za-z0-9_-]{0,123}$", "u");
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
    if (data.commit === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "commit" },
        message: "must have required property '" + "commit" + "'",
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
        key0 === "kind" ||
        key0 === "decisionId" ||
        key0 === "runId" ||
        key0 === "commit"
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
    if (data.kind !== undefined) {
      if ("provisional.attached" !== data.kind) {
        const err5 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "provisional.attached" },
          message: "must be equal to constant",
        };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.decisionId !== undefined) {
      let data1 = data.decisionId;
      if (typeof data1 === "string") {
        if (!pattern4.test(data1)) {
          const err6 = {
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
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      } else {
        const err7 = {
          instancePath: instancePath + "/decisionId",
          schemaPath: "#/$defs/decisionId/type",
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
    if (data.runId !== undefined) {
      let data2 = data.runId;
      if (typeof data2 === "string") {
        if (!pattern11.test(data2)) {
          const err8 = {
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
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      } else {
        const err9 = {
          instancePath: instancePath + "/runId",
          schemaPath: "#/$defs/runId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.commit !== undefined) {
      let data3 = data.commit;
      if (typeof data3 === "string") {
        if (!pattern5.test(data3)) {
          const err10 = {
            instancePath: instancePath + "/commit",
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
          instancePath: instancePath + "/commit",
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
  validate25.errors = vErrors;
  return errors === 0;
}
validate25.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
const schema43 = {
  title: "ProvisionalResolved",
  description:
    "Reserved (PB-3): the owner answered `decisionId`, so its provisional branch was confirmed or discarded. Not written by PB-1.",
  type: "object",
  additionalProperties: false,
  required: ["kind", "decisionId", "outcome", "chosenOption", "resolvedBy"],
  properties: {
    kind: { const: "provisional.resolved" },
    decisionId: { $ref: "#/$defs/decisionId" },
    outcome: { enum: ["confirmed", "discarded"] },
    chosenOption: { $ref: "#/$defs/optionId" },
    resolvedBy: {
      description:
        "Who resolved it: the ID of the event or the owner answer that did, as shown text.",
      type: "string",
      pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$",
    },
  },
};
const schema45 = {
  description: "A Brief option ID.",
  type: "string",
  pattern: "^[a-z][a-z0-9-]{0,31}$",
};
const pattern14 = new RegExp("^[a-z][a-z0-9-]{0,31}$", "u");
const pattern15 = new RegExp("^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$", "u");
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
    if (data.outcome === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "outcome" },
        message: "must have required property '" + "outcome" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.chosenOption === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "chosenOption" },
        message: "must have required property '" + "chosenOption" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.resolvedBy === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "resolvedBy" },
        message: "must have required property '" + "resolvedBy" + "'",
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
        key0 === "outcome" ||
        key0 === "chosenOption" ||
        key0 === "resolvedBy"
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
      if ("provisional.resolved" !== data.kind) {
        const err6 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "provisional.resolved" },
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
        if (!pattern4.test(data1)) {
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
    if (data.outcome !== undefined) {
      let data2 = data.outcome;
      if (!(data2 === "confirmed" || data2 === "discarded")) {
        const err9 = {
          instancePath: instancePath + "/outcome",
          schemaPath: "#/properties/outcome/enum",
          keyword: "enum",
          params: { allowedValues: schema43.properties.outcome.enum },
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
    if (data.chosenOption !== undefined) {
      let data3 = data.chosenOption;
      if (typeof data3 === "string") {
        if (!pattern14.test(data3)) {
          const err10 = {
            instancePath: instancePath + "/chosenOption",
            schemaPath: "#/$defs/optionId/pattern",
            keyword: "pattern",
            params: { pattern: "^[a-z][a-z0-9-]{0,31}$" },
            message: 'must match pattern "' + "^[a-z][a-z0-9-]{0,31}$" + '"',
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
          instancePath: instancePath + "/chosenOption",
          schemaPath: "#/$defs/optionId/type",
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
    if (data.resolvedBy !== undefined) {
      let data4 = data.resolvedBy;
      if (typeof data4 === "string") {
        if (!pattern15.test(data4)) {
          const err12 = {
            instancePath: instancePath + "/resolvedBy",
            schemaPath: "#/properties/resolvedBy/pattern",
            keyword: "pattern",
            params: { pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$" },
            message:
              'must match pattern "' +
              "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$" +
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
          instancePath: instancePath + "/resolvedBy",
          schemaPath: "#/properties/resolvedBy/type",
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
  } else {
    const err14 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err14];
    } else {
      vErrors.push(err14);
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
  /*# sourceURL="https://github.com/shaangill025/helmwright/schemas/provisional-event.schema.json" */ let vErrors =
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
