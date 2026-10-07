// Generated from schemas/permission-event.schema.json by scripts/generate.ts. Do not edit.
"use strict";
export const validate = validate20;
export default validate20;
const schema31 = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/shaangill025/helmwright/schemas/permission-event.schema.json",
  title: "PermissionEvent",
  description:
    "Payload of a permission event in the session log (B9), validated before it is appended. `kind` equals the event's `type`; that the two match is a relation between envelope and payload, so the writer checks it. The B9b-2 writer emits `permission.rejected` whenever the policy verdict has no target (unknown action, invalid input, invalid policy) and `permission.evaluated` otherwise.",
  type: "object",
  oneOf: [
    { $ref: "#/$defs/evaluated" },
    { $ref: "#/$defs/rejected" },
    { $ref: "#/$defs/asked" },
    { $ref: "#/$defs/answered" },
  ],
  $defs: {
    evaluated: {
      title: "PermissionEvaluated",
      description:
        "The permission layer ruled on one action call. `action` is what was ruled on; it differs from `requested` when the call was reclassified (an install through execute is deps.add).",
      type: "object",
      additionalProperties: false,
      required: [
        "kind",
        "agentId",
        "callId",
        "action",
        "requested",
        "target",
        "tier",
        "guard",
        "ruleId",
        "policyVersion",
        "reason",
      ],
      properties: {
        kind: { const: "permission.evaluated" },
        agentId: { $ref: "#/$defs/id" },
        callId: { $ref: "#/$defs/id" },
        action: { $ref: "#/$defs/action" },
        requested: { $ref: "#/$defs/action" },
        target: { $ref: "#/$defs/target" },
        tier: { $ref: "#/$defs/tier" },
        guard: {
          description:
            "The guard that decided: input parsing, the exfiltration check or the policy.",
          enum: ["schema", "exfiltration", "policy"],
        },
        ruleId: { $ref: "#/$defs/ruleId" },
        policyVersion: {
          $comment: "Copy of the PermissionPolicy `version` pattern.",
          type: "string",
          pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$",
        },
        reason: { $ref: "#/$defs/text" },
      },
    },
    rejected: {
      title: "PermissionRejected",
      description:
        "A call denied before evaluation (unknown action, invalid input or invalid policy), so there is no ruled action, target or trusted policy version. A rejection is always a denial.",
      type: "object",
      additionalProperties: false,
      required: ["kind", "agentId", "callId", "guard", "ruleId", "reason"],
      properties: {
        kind: { const: "permission.rejected" },
        agentId: { $ref: "#/$defs/id" },
        callId: { $ref: "#/$defs/id" },
        guard: {
          description:
            "`schema`: unknown action or invalid input. `policy`: invalid policy.",
          enum: ["schema", "policy"],
        },
        ruleId: { $ref: "#/$defs/ruleId" },
        reason: { $ref: "#/$defs/text" },
        requested: {
          description:
            "The requested action name as shown: escaped, already truncated, at most 256 code points. Absent when the request had no string action.",
          type: "string",
          pattern: "^[\\s\\S]{0,256}$",
        },
      },
    },
    asked: {
      title: "PermissionAsked",
      description:
        "The owner was asked to approve a call. `promptSha256` is the SHA-256 of the exact prompt shown, so an approval can be bound to what was seen.",
      type: "object",
      additionalProperties: false,
      required: ["kind", "callId", "presence", "promptSha256"],
      properties: {
        kind: { const: "permission.asked" },
        callId: { $ref: "#/$defs/id" },
        presence: {
          description:
            "`tty`: an interactive terminal could show the prompt. `none`: no one can answer, so the ask is denied.",
          enum: ["tty", "none"],
        },
        promptSha256: {
          description: "Lowercase hex SHA-256.",
          type: "string",
          pattern: "^[0-9a-f]{64}$",
        },
      },
    },
    answered: {
      title: "PermissionAnswered",
      description:
        "How an ask ended. Every answer but an approval from the TTY is a denial.",
      type: "object",
      additionalProperties: false,
      required: ["kind", "callId", "answer", "by", "waitMs", "attestation"],
      properties: {
        kind: { const: "permission.answered" },
        callId: { $ref: "#/$defs/id" },
        answer: { enum: ["approved", "denied"] },
        by: {
          description:
            "Who or what ended the ask: the owner at the TTY, no presence to ask, cancellation, or the prompt timeout.",
          enum: ["tty", "noPresence", "cancelled", "timeout"],
        },
        waitMs: {
          description: "Milliseconds between the ask and the answer.",
          type: "integer",
          minimum: 0,
          maximum: 9007199254740991,
        },
        attestation: { $ref: "#/$defs/attestation" },
      },
    },
    attestation: {
      title: "PermissionAttestation",
      description:
        'Proof of who approved. Until slice SIG only `none` exists; SIG adds `{kind: "presence", …}`, a signed owner-presence attestation.',
      oneOf: [{ $ref: "#/$defs/attestationNone" }],
    },
    attestationNone: {
      title: "PermissionAttestationNone",
      type: "object",
      additionalProperties: false,
      required: ["kind"],
      properties: { kind: { const: "none" } },
    },
    target: {
      title: "PermissionEventTarget",
      description:
        "What the action acts on, normalized and escaped for display; handlers never act on it.",
      type: "object",
      additionalProperties: false,
      required: ["kind", "value"],
      properties: {
        kind: { enum: ["path", "ref", "remote", "setting", "argv", "amount"] },
        value: { $ref: "#/$defs/text" },
        detail: { $ref: "#/$defs/text" },
      },
    },
    action: {
      title: "PermissionAction",
      $comment:
        "Copy of PermissionAction in permission-policy.schema.json (the generator compiles each schema alone); a test keeps the two equal.",
      enum: [
        "execute",
        "fs.read",
        "fs.edit",
        "fs.delete",
        "commit",
        "deps.add",
        "config.set",
        "spend.raiseCap",
        "push",
        "pr.open",
        "pr.merge",
        "comment",
        "publish",
        "deploy",
      ],
    },
    tier: {
      title: "PermissionTier",
      $comment:
        "Copy of PermissionTier in permission-policy.schema.json; a test keeps the two equal.",
      enum: ["allow", "ask", "deny", "alwaysAsk"],
    },
    ruleId: {
      title: "PermissionEventRuleId",
      description:
        "A policy rule ID, or an ID a guard records: `always-ask.<action or reason>` (segments may be camelCase, like spend.raiseCap), `default.ask`, `policy.*` or `schema.*`. No regex nests unbounded quantifiers (ReDoS).",
      type: "string",
      pattern:
        "^(always-ask(\\.[a-z][A-Za-z0-9-]{0,31}){1,3}|[a-z][a-z0-9-]{0,31}(\\.[a-z][a-z0-9-]{0,31}){0,3})$",
    },
    id: {
      description: "Agent or tool-call identifier.",
      type: "string",
      pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$",
    },
    text: {
      description: "Escaped display text, at most 8192 code points.",
      type: "string",
      pattern: "^[\\s\\S]{0,8192}$",
    },
  },
};
const schema32 = {
  title: "PermissionEvaluated",
  description:
    "The permission layer ruled on one action call. `action` is what was ruled on; it differs from `requested` when the call was reclassified (an install through execute is deps.add).",
  type: "object",
  additionalProperties: false,
  required: [
    "kind",
    "agentId",
    "callId",
    "action",
    "requested",
    "target",
    "tier",
    "guard",
    "ruleId",
    "policyVersion",
    "reason",
  ],
  properties: {
    kind: { const: "permission.evaluated" },
    agentId: { $ref: "#/$defs/id" },
    callId: { $ref: "#/$defs/id" },
    action: { $ref: "#/$defs/action" },
    requested: { $ref: "#/$defs/action" },
    target: { $ref: "#/$defs/target" },
    tier: { $ref: "#/$defs/tier" },
    guard: {
      description:
        "The guard that decided: input parsing, the exfiltration check or the policy.",
      enum: ["schema", "exfiltration", "policy"],
    },
    ruleId: { $ref: "#/$defs/ruleId" },
    policyVersion: {
      $comment: "Copy of the PermissionPolicy `version` pattern.",
      type: "string",
      pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$",
    },
    reason: { $ref: "#/$defs/text" },
  },
};
const schema33 = {
  description: "Agent or tool-call identifier.",
  type: "string",
  pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$",
};
const schema35 = {
  title: "PermissionAction",
  $comment:
    "Copy of PermissionAction in permission-policy.schema.json (the generator compiles each schema alone); a test keeps the two equal.",
  enum: [
    "execute",
    "fs.read",
    "fs.edit",
    "fs.delete",
    "commit",
    "deps.add",
    "config.set",
    "spend.raiseCap",
    "push",
    "pr.open",
    "pr.merge",
    "comment",
    "publish",
    "deploy",
  ],
};
const schema40 = {
  title: "PermissionTier",
  $comment:
    "Copy of PermissionTier in permission-policy.schema.json; a test keeps the two equal.",
  enum: ["allow", "ask", "deny", "alwaysAsk"],
};
const schema41 = {
  title: "PermissionEventRuleId",
  description:
    "A policy rule ID, or an ID a guard records: `always-ask.<action or reason>` (segments may be camelCase, like spend.raiseCap), `default.ask`, `policy.*` or `schema.*`. No regex nests unbounded quantifiers (ReDoS).",
  type: "string",
  pattern:
    "^(always-ask(\\.[a-z][A-Za-z0-9-]{0,31}){1,3}|[a-z][a-z0-9-]{0,31}(\\.[a-z][a-z0-9-]{0,31}){0,3})$",
};
const schema38 = {
  description: "Escaped display text, at most 8192 code points.",
  type: "string",
  pattern: "^[\\s\\S]{0,8192}$",
};
const func1 = Object.prototype.hasOwnProperty;
const pattern4 = new RegExp("^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$", "u");
const pattern8 = new RegExp(
  "^(always-ask(\\.[a-z][A-Za-z0-9-]{0,31}){1,3}|[a-z][a-z0-9-]{0,31}(\\.[a-z][a-z0-9-]{0,31}){0,3})$",
  "u",
);
const pattern9 = new RegExp("^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$", "u");
const pattern6 = new RegExp("^[\\s\\S]{0,8192}$", "u");
const schema37 = {
  title: "PermissionEventTarget",
  description:
    "What the action acts on, normalized and escaped for display; handlers never act on it.",
  type: "object",
  additionalProperties: false,
  required: ["kind", "value"],
  properties: {
    kind: { enum: ["path", "ref", "remote", "setting", "argv", "amount"] },
    value: { $ref: "#/$defs/text" },
    detail: { $ref: "#/$defs/text" },
  },
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
    if (data.value === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "value" },
        message: "must have required property '" + "value" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "kind" || key0 === "value" || key0 === "detail")) {
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
    if (data.kind !== undefined) {
      let data0 = data.kind;
      if (!(
        data0 === "path" ||
        data0 === "ref" ||
        data0 === "remote" ||
        data0 === "setting" ||
        data0 === "argv" ||
        data0 === "amount"
      )) {
        const err3 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/properties/kind/enum",
          keyword: "enum",
          params: { allowedValues: schema37.properties.kind.enum },
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
    if (data.value !== undefined) {
      let data1 = data.value;
      if (typeof data1 === "string") {
        if (!pattern6.test(data1)) {
          const err4 = {
            instancePath: instancePath + "/value",
            schemaPath: "#/$defs/text/pattern",
            keyword: "pattern",
            params: { pattern: "^[\\s\\S]{0,8192}$" },
            message: 'must match pattern "' + "^[\\s\\S]{0,8192}$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      } else {
        const err5 = {
          instancePath: instancePath + "/value",
          schemaPath: "#/$defs/text/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.detail !== undefined) {
      let data2 = data.detail;
      if (typeof data2 === "string") {
        if (!pattern6.test(data2)) {
          const err6 = {
            instancePath: instancePath + "/detail",
            schemaPath: "#/$defs/text/pattern",
            keyword: "pattern",
            params: { pattern: "^[\\s\\S]{0,8192}$" },
            message: 'must match pattern "' + "^[\\s\\S]{0,8192}$" + '"',
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
          instancePath: instancePath + "/detail",
          schemaPath: "#/$defs/text/type",
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
    if (data.agentId === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "agentId" },
        message: "must have required property '" + "agentId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.callId === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "callId" },
        message: "must have required property '" + "callId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.action === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "action" },
        message: "must have required property '" + "action" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.requested === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "requested" },
        message: "must have required property '" + "requested" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.target === undefined) {
      const err5 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "target" },
        message: "must have required property '" + "target" + "'",
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.tier === undefined) {
      const err6 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "tier" },
        message: "must have required property '" + "tier" + "'",
      };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.guard === undefined) {
      const err7 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "guard" },
        message: "must have required property '" + "guard" + "'",
      };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.ruleId === undefined) {
      const err8 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "ruleId" },
        message: "must have required property '" + "ruleId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    if (data.policyVersion === undefined) {
      const err9 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "policyVersion" },
        message: "must have required property '" + "policyVersion" + "'",
      };
      if (vErrors === null) {
        vErrors = [err9];
      } else {
        vErrors.push(err9);
      }
      errors++;
    }
    if (data.reason === undefined) {
      const err10 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "reason" },
        message: "must have required property '" + "reason" + "'",
      };
      if (vErrors === null) {
        vErrors = [err10];
      } else {
        vErrors.push(err10);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func1.call(schema32.properties, key0)) {
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
    if (data.kind !== undefined) {
      if ("permission.evaluated" !== data.kind) {
        const err12 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "permission.evaluated" },
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
    if (data.agentId !== undefined) {
      let data1 = data.agentId;
      if (typeof data1 === "string") {
        if (!pattern4.test(data1)) {
          const err13 = {
            instancePath: instancePath + "/agentId",
            schemaPath: "#/$defs/id/pattern",
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
          instancePath: instancePath + "/agentId",
          schemaPath: "#/$defs/id/type",
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
    if (data.callId !== undefined) {
      let data2 = data.callId;
      if (typeof data2 === "string") {
        if (!pattern4.test(data2)) {
          const err15 = {
            instancePath: instancePath + "/callId",
            schemaPath: "#/$defs/id/pattern",
            keyword: "pattern",
            params: { pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$" },
            message:
              'must match pattern "' +
              "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$" +
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
          instancePath: instancePath + "/callId",
          schemaPath: "#/$defs/id/type",
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
    if (data.action !== undefined) {
      let data3 = data.action;
      if (!(
        data3 === "execute" ||
        data3 === "fs.read" ||
        data3 === "fs.edit" ||
        data3 === "fs.delete" ||
        data3 === "commit" ||
        data3 === "deps.add" ||
        data3 === "config.set" ||
        data3 === "spend.raiseCap" ||
        data3 === "push" ||
        data3 === "pr.open" ||
        data3 === "pr.merge" ||
        data3 === "comment" ||
        data3 === "publish" ||
        data3 === "deploy"
      )) {
        const err17 = {
          instancePath: instancePath + "/action",
          schemaPath: "#/$defs/action/enum",
          keyword: "enum",
          params: { allowedValues: schema35.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
    }
    if (data.requested !== undefined) {
      let data4 = data.requested;
      if (!(
        data4 === "execute" ||
        data4 === "fs.read" ||
        data4 === "fs.edit" ||
        data4 === "fs.delete" ||
        data4 === "commit" ||
        data4 === "deps.add" ||
        data4 === "config.set" ||
        data4 === "spend.raiseCap" ||
        data4 === "push" ||
        data4 === "pr.open" ||
        data4 === "pr.merge" ||
        data4 === "comment" ||
        data4 === "publish" ||
        data4 === "deploy"
      )) {
        const err18 = {
          instancePath: instancePath + "/requested",
          schemaPath: "#/$defs/action/enum",
          keyword: "enum",
          params: { allowedValues: schema35.enum },
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
    if (data.target !== undefined) {
      if (
        !validate22(data.target, {
          instancePath: instancePath + "/target",
          parentData: data,
          parentDataProperty: "target",
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
    if (data.tier !== undefined) {
      let data6 = data.tier;
      if (!(
        data6 === "allow" ||
        data6 === "ask" ||
        data6 === "deny" ||
        data6 === "alwaysAsk"
      )) {
        const err19 = {
          instancePath: instancePath + "/tier",
          schemaPath: "#/$defs/tier/enum",
          keyword: "enum",
          params: { allowedValues: schema40.enum },
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
    if (data.guard !== undefined) {
      let data7 = data.guard;
      if (!(
        data7 === "schema" ||
        data7 === "exfiltration" ||
        data7 === "policy"
      )) {
        const err20 = {
          instancePath: instancePath + "/guard",
          schemaPath: "#/properties/guard/enum",
          keyword: "enum",
          params: { allowedValues: schema32.properties.guard.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
    }
    if (data.ruleId !== undefined) {
      let data8 = data.ruleId;
      if (typeof data8 === "string") {
        if (!pattern8.test(data8)) {
          const err21 = {
            instancePath: instancePath + "/ruleId",
            schemaPath: "#/$defs/ruleId/pattern",
            keyword: "pattern",
            params: {
              pattern:
                "^(always-ask(\\.[a-z][A-Za-z0-9-]{0,31}){1,3}|[a-z][a-z0-9-]{0,31}(\\.[a-z][a-z0-9-]{0,31}){0,3})$",
            },
            message:
              'must match pattern "' +
              "^(always-ask(\\.[a-z][A-Za-z0-9-]{0,31}){1,3}|[a-z][a-z0-9-]{0,31}(\\.[a-z][a-z0-9-]{0,31}){0,3})$" +
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
          instancePath: instancePath + "/ruleId",
          schemaPath: "#/$defs/ruleId/type",
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
    if (data.policyVersion !== undefined) {
      let data9 = data.policyVersion;
      if (typeof data9 === "string") {
        if (!pattern9.test(data9)) {
          const err23 = {
            instancePath: instancePath + "/policyVersion",
            schemaPath: "#/properties/policyVersion/pattern",
            keyword: "pattern",
            params: { pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$" },
            message:
              'must match pattern "' +
              "^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$" +
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
          instancePath: instancePath + "/policyVersion",
          schemaPath: "#/properties/policyVersion/type",
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
    if (data.reason !== undefined) {
      let data10 = data.reason;
      if (typeof data10 === "string") {
        if (!pattern6.test(data10)) {
          const err25 = {
            instancePath: instancePath + "/reason",
            schemaPath: "#/$defs/text/pattern",
            keyword: "pattern",
            params: { pattern: "^[\\s\\S]{0,8192}$" },
            message: 'must match pattern "' + "^[\\s\\S]{0,8192}$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err25];
          } else {
            vErrors.push(err25);
          }
          errors++;
        }
      } else {
        const err26 = {
          instancePath: instancePath + "/reason",
          schemaPath: "#/$defs/text/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
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
  validate21.errors = vErrors;
  return errors === 0;
}
validate21.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
const schema43 = {
  title: "PermissionRejected",
  description:
    "A call denied before evaluation (unknown action, invalid input or invalid policy), so there is no ruled action, target or trusted policy version. A rejection is always a denial.",
  type: "object",
  additionalProperties: false,
  required: ["kind", "agentId", "callId", "guard", "ruleId", "reason"],
  properties: {
    kind: { const: "permission.rejected" },
    agentId: { $ref: "#/$defs/id" },
    callId: { $ref: "#/$defs/id" },
    guard: {
      description:
        "`schema`: unknown action or invalid input. `policy`: invalid policy.",
      enum: ["schema", "policy"],
    },
    ruleId: { $ref: "#/$defs/ruleId" },
    reason: { $ref: "#/$defs/text" },
    requested: {
      description:
        "The requested action name as shown: escaped, already truncated, at most 256 code points. Absent when the request had no string action.",
      type: "string",
      pattern: "^[\\s\\S]{0,256}$",
    },
  },
};
const pattern15 = new RegExp("^[\\s\\S]{0,256}$", "u");
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
    if (data.agentId === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "agentId" },
        message: "must have required property '" + "agentId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.callId === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "callId" },
        message: "must have required property '" + "callId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.guard === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "guard" },
        message: "must have required property '" + "guard" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.ruleId === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "ruleId" },
        message: "must have required property '" + "ruleId" + "'",
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
        schemaPath: "#/required",
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
    for (const key0 in data) {
      if (!(
        key0 === "kind" ||
        key0 === "agentId" ||
        key0 === "callId" ||
        key0 === "guard" ||
        key0 === "ruleId" ||
        key0 === "reason" ||
        key0 === "requested"
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
      if ("permission.rejected" !== data.kind) {
        const err7 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "permission.rejected" },
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
    if (data.agentId !== undefined) {
      let data1 = data.agentId;
      if (typeof data1 === "string") {
        if (!pattern4.test(data1)) {
          const err8 = {
            instancePath: instancePath + "/agentId",
            schemaPath: "#/$defs/id/pattern",
            keyword: "pattern",
            params: { pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$" },
            message:
              'must match pattern "' +
              "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$" +
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
          instancePath: instancePath + "/agentId",
          schemaPath: "#/$defs/id/type",
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
    if (data.callId !== undefined) {
      let data2 = data.callId;
      if (typeof data2 === "string") {
        if (!pattern4.test(data2)) {
          const err10 = {
            instancePath: instancePath + "/callId",
            schemaPath: "#/$defs/id/pattern",
            keyword: "pattern",
            params: { pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$" },
            message:
              'must match pattern "' +
              "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$" +
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
          instancePath: instancePath + "/callId",
          schemaPath: "#/$defs/id/type",
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
    if (data.guard !== undefined) {
      let data3 = data.guard;
      if (!(data3 === "schema" || data3 === "policy")) {
        const err12 = {
          instancePath: instancePath + "/guard",
          schemaPath: "#/properties/guard/enum",
          keyword: "enum",
          params: { allowedValues: schema43.properties.guard.enum },
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
    if (data.ruleId !== undefined) {
      let data4 = data.ruleId;
      if (typeof data4 === "string") {
        if (!pattern8.test(data4)) {
          const err13 = {
            instancePath: instancePath + "/ruleId",
            schemaPath: "#/$defs/ruleId/pattern",
            keyword: "pattern",
            params: {
              pattern:
                "^(always-ask(\\.[a-z][A-Za-z0-9-]{0,31}){1,3}|[a-z][a-z0-9-]{0,31}(\\.[a-z][a-z0-9-]{0,31}){0,3})$",
            },
            message:
              'must match pattern "' +
              "^(always-ask(\\.[a-z][A-Za-z0-9-]{0,31}){1,3}|[a-z][a-z0-9-]{0,31}(\\.[a-z][a-z0-9-]{0,31}){0,3})$" +
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
          instancePath: instancePath + "/ruleId",
          schemaPath: "#/$defs/ruleId/type",
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
    if (data.reason !== undefined) {
      let data5 = data.reason;
      if (typeof data5 === "string") {
        if (!pattern6.test(data5)) {
          const err15 = {
            instancePath: instancePath + "/reason",
            schemaPath: "#/$defs/text/pattern",
            keyword: "pattern",
            params: { pattern: "^[\\s\\S]{0,8192}$" },
            message: 'must match pattern "' + "^[\\s\\S]{0,8192}$" + '"',
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
          instancePath: instancePath + "/reason",
          schemaPath: "#/$defs/text/type",
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
    if (data.requested !== undefined) {
      let data6 = data.requested;
      if (typeof data6 === "string") {
        if (!pattern15.test(data6)) {
          const err17 = {
            instancePath: instancePath + "/requested",
            schemaPath: "#/properties/requested/pattern",
            keyword: "pattern",
            params: { pattern: "^[\\s\\S]{0,256}$" },
            message: 'must match pattern "' + "^[\\s\\S]{0,256}$" + '"',
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
          instancePath: instancePath + "/requested",
          schemaPath: "#/properties/requested/type",
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
  validate25.errors = vErrors;
  return errors === 0;
}
validate25.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
const schema48 = {
  title: "PermissionAsked",
  description:
    "The owner was asked to approve a call. `promptSha256` is the SHA-256 of the exact prompt shown, so an approval can be bound to what was seen.",
  type: "object",
  additionalProperties: false,
  required: ["kind", "callId", "presence", "promptSha256"],
  properties: {
    kind: { const: "permission.asked" },
    callId: { $ref: "#/$defs/id" },
    presence: {
      description:
        "`tty`: an interactive terminal could show the prompt. `none`: no one can answer, so the ask is denied.",
      enum: ["tty", "none"],
    },
    promptSha256: {
      description: "Lowercase hex SHA-256.",
      type: "string",
      pattern: "^[0-9a-f]{64}$",
    },
  },
};
const pattern17 = new RegExp("^[0-9a-f]{64}$", "u");
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
    if (data.callId === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "callId" },
        message: "must have required property '" + "callId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.presence === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "presence" },
        message: "must have required property '" + "presence" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.promptSha256 === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "promptSha256" },
        message: "must have required property '" + "promptSha256" + "'",
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
        key0 === "callId" ||
        key0 === "presence" ||
        key0 === "promptSha256"
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
      if ("permission.asked" !== data.kind) {
        const err5 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "permission.asked" },
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
    if (data.callId !== undefined) {
      let data1 = data.callId;
      if (typeof data1 === "string") {
        if (!pattern4.test(data1)) {
          const err6 = {
            instancePath: instancePath + "/callId",
            schemaPath: "#/$defs/id/pattern",
            keyword: "pattern",
            params: { pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$" },
            message:
              'must match pattern "' +
              "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$" +
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
          instancePath: instancePath + "/callId",
          schemaPath: "#/$defs/id/type",
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
    if (data.presence !== undefined) {
      let data2 = data.presence;
      if (!(data2 === "tty" || data2 === "none")) {
        const err8 = {
          instancePath: instancePath + "/presence",
          schemaPath: "#/properties/presence/enum",
          keyword: "enum",
          params: { allowedValues: schema48.properties.presence.enum },
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
    if (data.promptSha256 !== undefined) {
      let data3 = data.promptSha256;
      if (typeof data3 === "string") {
        if (!pattern17.test(data3)) {
          const err9 = {
            instancePath: instancePath + "/promptSha256",
            schemaPath: "#/properties/promptSha256/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9a-f]{64}$" },
            message: 'must match pattern "' + "^[0-9a-f]{64}$" + '"',
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
          instancePath: instancePath + "/promptSha256",
          schemaPath: "#/properties/promptSha256/type",
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
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err11];
    } else {
      vErrors.push(err11);
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
const schema50 = {
  title: "PermissionAnswered",
  description:
    "How an ask ended. Every answer but an approval from the TTY is a denial.",
  type: "object",
  additionalProperties: false,
  required: ["kind", "callId", "answer", "by", "waitMs", "attestation"],
  properties: {
    kind: { const: "permission.answered" },
    callId: { $ref: "#/$defs/id" },
    answer: { enum: ["approved", "denied"] },
    by: {
      description:
        "Who or what ended the ask: the owner at the TTY, no presence to ask, cancellation, or the prompt timeout.",
      enum: ["tty", "noPresence", "cancelled", "timeout"],
    },
    waitMs: {
      description: "Milliseconds between the ask and the answer.",
      type: "integer",
      minimum: 0,
      maximum: 9007199254740991,
    },
    attestation: { $ref: "#/$defs/attestation" },
  },
};
const schema52 = {
  title: "PermissionAttestation",
  description:
    'Proof of who approved. Until slice SIG only `none` exists; SIG adds `{kind: "presence", …}`, a signed owner-presence attestation.',
  oneOf: [{ $ref: "#/$defs/attestationNone" }],
};
const schema53 = {
  title: "PermissionAttestationNone",
  type: "object",
  additionalProperties: false,
  required: ["kind"],
  properties: { kind: { const: "none" } },
};
function validate30(
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
  const evaluated0 = validate30.evaluated;
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
  validate30.errors = vErrors;
  evaluated0.props = props0;
  return errors === 0;
}
validate30.evaluated = { dynamicProps: true, dynamicItems: false };
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
    if (data.callId === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "callId" },
        message: "must have required property '" + "callId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.answer === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "answer" },
        message: "must have required property '" + "answer" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.by === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "by" },
        message: "must have required property '" + "by" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.waitMs === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "waitMs" },
        message: "must have required property '" + "waitMs" + "'",
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
        key0 === "callId" ||
        key0 === "answer" ||
        key0 === "by" ||
        key0 === "waitMs" ||
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
      if ("permission.answered" !== data.kind) {
        const err7 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "permission.answered" },
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
    if (data.callId !== undefined) {
      let data1 = data.callId;
      if (typeof data1 === "string") {
        if (!pattern4.test(data1)) {
          const err8 = {
            instancePath: instancePath + "/callId",
            schemaPath: "#/$defs/id/pattern",
            keyword: "pattern",
            params: { pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$" },
            message:
              'must match pattern "' +
              "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$" +
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
          instancePath: instancePath + "/callId",
          schemaPath: "#/$defs/id/type",
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
    if (data.answer !== undefined) {
      let data2 = data.answer;
      if (!(data2 === "approved" || data2 === "denied")) {
        const err10 = {
          instancePath: instancePath + "/answer",
          schemaPath: "#/properties/answer/enum",
          keyword: "enum",
          params: { allowedValues: schema50.properties.answer.enum },
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
    if (data.by !== undefined) {
      let data3 = data.by;
      if (!(
        data3 === "tty" ||
        data3 === "noPresence" ||
        data3 === "cancelled" ||
        data3 === "timeout"
      )) {
        const err11 = {
          instancePath: instancePath + "/by",
          schemaPath: "#/properties/by/enum",
          keyword: "enum",
          params: { allowedValues: schema50.properties.by.enum },
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
    if (data.waitMs !== undefined) {
      let data4 = data.waitMs;
      if (!(
        typeof data4 == "number" &&
        !(data4 % 1) &&
        !isNaN(data4) &&
        isFinite(data4)
      )) {
        const err12 = {
          instancePath: instancePath + "/waitMs",
          schemaPath: "#/properties/waitMs/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
      if (typeof data4 == "number" && isFinite(data4)) {
        if (data4 > 9007199254740991 || isNaN(data4)) {
          const err13 = {
            instancePath: instancePath + "/waitMs",
            schemaPath: "#/properties/waitMs/maximum",
            keyword: "maximum",
            params: { comparison: "<=", limit: 9007199254740991 },
            message: "must be <= 9007199254740991",
          };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
        if (data4 < 0 || isNaN(data4)) {
          const err14 = {
            instancePath: instancePath + "/waitMs",
            schemaPath: "#/properties/waitMs/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
      }
    }
    if (data.attestation !== undefined) {
      if (
        !validate30(data.attestation, {
          instancePath: instancePath + "/attestation",
          parentData: data,
          parentDataProperty: "attestation",
          rootData,
          dynamicAnchors,
        })
      ) {
        vErrors =
          vErrors === null
            ? validate30.errors
            : vErrors.concat(validate30.errors);
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
  validate29.errors = vErrors;
  return errors === 0;
}
validate29.evaluated = {
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
  /*# sourceURL="https://github.com/shaangill025/helmwright/schemas/permission-event.schema.json" */ let vErrors =
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
    !validate25(data, {
      instancePath,
      parentData,
      parentDataProperty,
      rootData,
      dynamicAnchors,
    })
  ) {
    vErrors =
      vErrors === null ? validate25.errors : vErrors.concat(validate25.errors);
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
