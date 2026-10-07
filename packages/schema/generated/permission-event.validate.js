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
        "toolCallId",
        "action",
        "requested",
        "inputSha256",
        "target",
        "tier",
        "guard",
        "ruleId",
        "policyVersion",
        "reason",
      ],
      properties: {
        kind: { const: "permission.evaluated" },
        agentId: { $ref: "#/$defs/agentId" },
        toolCallId: { $ref: "#/$defs/toolCallId" },
        action: { $ref: "#/$defs/action" },
        requested: { $ref: "#/$defs/action" },
        inputSha256: {
          $ref: "#/$defs/sha256",
          description:
            "Lowercase hex SHA-256 of the canonical JSON (sorted keys, no whitespace) of the input snapshot that was ruled on, so the log binds the verdict to the exact input even when the shown target is truncated.",
        },
        target: { $ref: "#/$defs/target" },
        tier: { $ref: "#/$defs/tier" },
        guard: {
          description:
            "The guard that decided: the exfiltration check or the policy. Schema denials are `permission.rejected`.",
          enum: ["exfiltration", "policy"],
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
      required: ["kind", "agentId", "toolCallId", "guard", "ruleId", "reason"],
      properties: {
        kind: { const: "permission.rejected" },
        agentId: { $ref: "#/$defs/agentId" },
        toolCallId: { $ref: "#/$defs/toolCallId" },
        guard: {
          description:
            "`schema`: unknown action or invalid input. `policy`: invalid policy.",
          enum: ["schema", "policy"],
        },
        ruleId: { $ref: "#/$defs/rejectedRuleId" },
        reason: { $ref: "#/$defs/text" },
        requestedName: {
          description:
            "The requested action name as shown: cut to 64 code points, then escaped (at most 9 characters each) plus a truncation marker, so at most 640 code points. Absent when the request had no string action.",
          type: "string",
          pattern: "^[\\s\\S]{0,640}$",
        },
      },
    },
    asked: {
      title: "PermissionAsked",
      description:
        "The owner was asked to approve a call. `promptSha256` is the SHA-256 of the exact prompt shown, so an approval can be bound to what was seen. `viewSha256` is present when a target or detail was too long for the prompt: the SHA-256 of the full-value view the owner must page through before an approval counts.",
      type: "object",
      additionalProperties: false,
      required: ["kind", "toolCallId", "presence", "promptSha256"],
      properties: {
        kind: { const: "permission.asked" },
        toolCallId: { $ref: "#/$defs/toolCallId" },
        presence: {
          description:
            "`tty`: an interactive terminal could show the prompt. `none`: no one can answer, so the ask is denied.",
          enum: ["tty", "none"],
        },
        promptSha256: { $ref: "#/$defs/sha256" },
        viewSha256: { $ref: "#/$defs/sha256" },
      },
    },
    answered: {
      title: "PermissionAnswered",
      description:
        "How an ask ended: an approval, which only the owner at the TTY can give, or a denial.",
      oneOf: [
        { $ref: "#/$defs/answeredApproved" },
        { $ref: "#/$defs/answeredDenied" },
      ],
    },
    answeredApproved: {
      title: "PermissionAnsweredApproved",
      type: "object",
      additionalProperties: false,
      required: ["kind", "toolCallId", "answer", "by", "waitMs", "attestation"],
      properties: {
        kind: { const: "permission.answered" },
        toolCallId: { $ref: "#/$defs/toolCallId" },
        answer: { const: "approved" },
        by: { const: "tty" },
        viewed: {
          description:
            "Present when the ask had a full-value view: an approval counts only after the view was shown to its end.",
          const: true,
        },
        waitMs: { $ref: "#/$defs/waitMs" },
        attestation: { $ref: "#/$defs/attestation" },
      },
    },
    answeredDenied: {
      title: "PermissionAnsweredDenied",
      type: "object",
      additionalProperties: false,
      required: ["kind", "toolCallId", "answer", "by", "waitMs", "attestation"],
      properties: {
        kind: { const: "permission.answered" },
        toolCallId: { $ref: "#/$defs/toolCallId" },
        answer: { const: "denied" },
        by: {
          description:
            "`tty`: the owner denied. `noPresence`: no one could be asked. `cancelled`: the ask ended without an answer.",
          enum: ["tty", "noPresence", "cancelled"],
        },
        viewed: {
          description:
            "Present when the ask had a full-value view: whether it was shown to its end.",
          type: "boolean",
        },
        waitMs: { $ref: "#/$defs/waitMs" },
        attestation: { $ref: "#/$defs/attestation" },
      },
    },
    waitMs: {
      description: "Milliseconds between the ask and the answer.",
      type: "integer",
      minimum: 0,
      maximum: 9007199254740991,
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
        "What the action acts on, normalized and escaped for display; handlers never act on it. `truncated` is true when `value` or `detail` was cut to fit; `inputSha256` still covers the whole input.",
      type: "object",
      additionalProperties: false,
      required: ["kind", "value"],
      properties: {
        kind: { enum: ["path", "ref", "remote", "setting", "argv", "amount"] },
        value: { $ref: "#/$defs/text" },
        detail: { $ref: "#/$defs/text" },
        truncated: { type: "boolean" },
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
        "A policy rule ID, `default.ask`, or an always-ask floor ID, `always-ask.<action or reason>` (segments may be camelCase, like spend.raiseCap). The `schema.` and `policy.` IDs belong to rejections. No regex nests unbounded quantifiers (ReDoS).",
      type: "string",
      pattern:
        "^(always-ask(\\.[a-z][A-Za-z0-9-]{0,31}){1,3}|[a-z][a-z0-9-]{0,31}(\\.[a-z][a-z0-9-]{0,31}){0,3})$",
      not: { pattern: "^(schema|policy)\\." },
    },
    rejectedRuleId: {
      title: "PermissionRejectedRuleId",
      description: "`schema.*` or `policy.*`, otherwise like a policy rule ID.",
      type: "string",
      pattern: "^(schema|policy)(\\.[a-z][a-z0-9-]{0,31}){1,3}$",
    },
    agentId: {
      description: "Agent identifier.",
      $comment:
        "Wider than event.schema.json's `id` (adds `.` and `:`) so that namespaced agent IDs of later milestones fit; every envelope ID (M1 uses the node ID) still matches.",
      type: "string",
      pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$",
    },
    toolCallId: {
      description:
        "The engine's tool call ID, as in the loop events: printable ASCII without spaces, 1 to 256 characters.",
      type: "string",
      pattern: "^[!-~]{1,256}$",
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
  title: "PermissionEvaluated",
  description:
    "The permission layer ruled on one action call. `action` is what was ruled on; it differs from `requested` when the call was reclassified (an install through execute is deps.add).",
  type: "object",
  additionalProperties: false,
  required: [
    "kind",
    "agentId",
    "toolCallId",
    "action",
    "requested",
    "inputSha256",
    "target",
    "tier",
    "guard",
    "ruleId",
    "policyVersion",
    "reason",
  ],
  properties: {
    kind: { const: "permission.evaluated" },
    agentId: { $ref: "#/$defs/agentId" },
    toolCallId: { $ref: "#/$defs/toolCallId" },
    action: { $ref: "#/$defs/action" },
    requested: { $ref: "#/$defs/action" },
    inputSha256: {
      $ref: "#/$defs/sha256",
      description:
        "Lowercase hex SHA-256 of the canonical JSON (sorted keys, no whitespace) of the input snapshot that was ruled on, so the log binds the verdict to the exact input even when the shown target is truncated.",
    },
    target: { $ref: "#/$defs/target" },
    tier: { $ref: "#/$defs/tier" },
    guard: {
      description:
        "The guard that decided: the exfiltration check or the policy. Schema denials are `permission.rejected`.",
      enum: ["exfiltration", "policy"],
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
  description: "Agent identifier.",
  $comment:
    "Wider than event.schema.json's `id` (adds `.` and `:`) so that namespaced agent IDs of later milestones fit; every envelope ID (M1 uses the node ID) still matches.",
  type: "string",
  pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$",
};
const schema34 = {
  description:
    "The engine's tool call ID, as in the loop events: printable ASCII without spaces, 1 to 256 characters.",
  type: "string",
  pattern: "^[!-~]{1,256}$",
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
const schema37 = {
  description: "Lowercase hex SHA-256.",
  type: "string",
  pattern: "^[0-9a-f]{64}$",
};
const schema41 = {
  title: "PermissionTier",
  $comment:
    "Copy of PermissionTier in permission-policy.schema.json; a test keeps the two equal.",
  enum: ["allow", "ask", "deny", "alwaysAsk"],
};
const schema42 = {
  title: "PermissionEventRuleId",
  description:
    "A policy rule ID, `default.ask`, or an always-ask floor ID, `always-ask.<action or reason>` (segments may be camelCase, like spend.raiseCap). The `schema.` and `policy.` IDs belong to rejections. No regex nests unbounded quantifiers (ReDoS).",
  type: "string",
  pattern:
    "^(always-ask(\\.[a-z][A-Za-z0-9-]{0,31}){1,3}|[a-z][a-z0-9-]{0,31}(\\.[a-z][a-z0-9-]{0,31}){0,3})$",
  not: { pattern: "^(schema|policy)\\." },
};
const schema39 = {
  description: "Escaped display text, at most 8192 code points.",
  type: "string",
  pattern: "^[\\s\\S]{0,8192}$",
};
const func1 = Object.prototype.hasOwnProperty;
const pattern4 = new RegExp("^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$", "u");
const pattern5 = new RegExp("^[!-~]{1,256}$", "u");
const pattern6 = new RegExp("^[0-9a-f]{64}$", "u");
const pattern9 = new RegExp("^(schema|policy)\\.", "u");
const pattern10 = new RegExp(
  "^(always-ask(\\.[a-z][A-Za-z0-9-]{0,31}){1,3}|[a-z][a-z0-9-]{0,31}(\\.[a-z][a-z0-9-]{0,31}){0,3})$",
  "u",
);
const pattern11 = new RegExp("^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$", "u");
const pattern7 = new RegExp("^[\\s\\S]{0,8192}$", "u");
const schema38 = {
  title: "PermissionEventTarget",
  description:
    "What the action acts on, normalized and escaped for display; handlers never act on it. `truncated` is true when `value` or `detail` was cut to fit; `inputSha256` still covers the whole input.",
  type: "object",
  additionalProperties: false,
  required: ["kind", "value"],
  properties: {
    kind: { enum: ["path", "ref", "remote", "setting", "argv", "amount"] },
    value: { $ref: "#/$defs/text" },
    detail: { $ref: "#/$defs/text" },
    truncated: { type: "boolean" },
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
      if (!(
        key0 === "kind" ||
        key0 === "value" ||
        key0 === "detail" ||
        key0 === "truncated"
      )) {
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
          params: { allowedValues: schema38.properties.kind.enum },
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
        if (!pattern7.test(data1)) {
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
        if (!pattern7.test(data2)) {
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
    if (data.truncated !== undefined) {
      if (typeof data.truncated !== "boolean") {
        const err8 = {
          instancePath: instancePath + "/truncated",
          schemaPath: "#/properties/truncated/type",
          keyword: "type",
          params: { type: "boolean" },
          message: "must be boolean",
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
      schemaPath: "#/type",
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
    if (data.toolCallId === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "toolCallId" },
        message: "must have required property '" + "toolCallId" + "'",
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
    if (data.inputSha256 === undefined) {
      const err5 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "inputSha256" },
        message: "must have required property '" + "inputSha256" + "'",
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.target === undefined) {
      const err6 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "target" },
        message: "must have required property '" + "target" + "'",
      };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.tier === undefined) {
      const err7 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "tier" },
        message: "must have required property '" + "tier" + "'",
      };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.guard === undefined) {
      const err8 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "guard" },
        message: "must have required property '" + "guard" + "'",
      };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    if (data.ruleId === undefined) {
      const err9 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "ruleId" },
        message: "must have required property '" + "ruleId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err9];
      } else {
        vErrors.push(err9);
      }
      errors++;
    }
    if (data.policyVersion === undefined) {
      const err10 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "policyVersion" },
        message: "must have required property '" + "policyVersion" + "'",
      };
      if (vErrors === null) {
        vErrors = [err10];
      } else {
        vErrors.push(err10);
      }
      errors++;
    }
    if (data.reason === undefined) {
      const err11 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "reason" },
        message: "must have required property '" + "reason" + "'",
      };
      if (vErrors === null) {
        vErrors = [err11];
      } else {
        vErrors.push(err11);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func1.call(schema32.properties, key0)) {
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
    if (data.kind !== undefined) {
      if ("permission.evaluated" !== data.kind) {
        const err13 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "permission.evaluated" },
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
    if (data.agentId !== undefined) {
      let data1 = data.agentId;
      if (typeof data1 === "string") {
        if (!pattern4.test(data1)) {
          const err14 = {
            instancePath: instancePath + "/agentId",
            schemaPath: "#/$defs/agentId/pattern",
            keyword: "pattern",
            params: { pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$" },
            message:
              'must match pattern "' +
              "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$" +
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
          instancePath: instancePath + "/agentId",
          schemaPath: "#/$defs/agentId/type",
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
    if (data.toolCallId !== undefined) {
      let data2 = data.toolCallId;
      if (typeof data2 === "string") {
        if (!pattern5.test(data2)) {
          const err16 = {
            instancePath: instancePath + "/toolCallId",
            schemaPath: "#/$defs/toolCallId/pattern",
            keyword: "pattern",
            params: { pattern: "^[!-~]{1,256}$" },
            message: 'must match pattern "' + "^[!-~]{1,256}$" + '"',
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
          instancePath: instancePath + "/toolCallId",
          schemaPath: "#/$defs/toolCallId/type",
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
        const err18 = {
          instancePath: instancePath + "/action",
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
        const err19 = {
          instancePath: instancePath + "/requested",
          schemaPath: "#/$defs/action/enum",
          keyword: "enum",
          params: { allowedValues: schema35.enum },
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
    if (data.inputSha256 !== undefined) {
      let data5 = data.inputSha256;
      if (typeof data5 === "string") {
        if (!pattern6.test(data5)) {
          const err20 = {
            instancePath: instancePath + "/inputSha256",
            schemaPath: "#/$defs/sha256/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9a-f]{64}$" },
            message: 'must match pattern "' + "^[0-9a-f]{64}$" + '"',
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
          instancePath: instancePath + "/inputSha256",
          schemaPath: "#/$defs/sha256/type",
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
      let data7 = data.tier;
      if (!(
        data7 === "allow" ||
        data7 === "ask" ||
        data7 === "deny" ||
        data7 === "alwaysAsk"
      )) {
        const err22 = {
          instancePath: instancePath + "/tier",
          schemaPath: "#/$defs/tier/enum",
          keyword: "enum",
          params: { allowedValues: schema41.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      }
    }
    if (data.guard !== undefined) {
      let data8 = data.guard;
      if (!(data8 === "exfiltration" || data8 === "policy")) {
        const err23 = {
          instancePath: instancePath + "/guard",
          schemaPath: "#/properties/guard/enum",
          keyword: "enum",
          params: { allowedValues: schema32.properties.guard.enum },
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
    if (data.ruleId !== undefined) {
      let data9 = data.ruleId;
      const _errs27 = errors;
      const _errs28 = errors;
      if (typeof data9 === "string") {
        if (!pattern9.test(data9)) {
          const err24 = {};
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
      }
      var valid8 = _errs28 === errors;
      if (valid8) {
        const err25 = {
          instancePath: instancePath + "/ruleId",
          schemaPath: "#/$defs/ruleId/not",
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
        errors = _errs27;
        if (vErrors !== null) {
          if (_errs27) {
            vErrors.length = _errs27;
          } else {
            vErrors = null;
          }
        }
      }
      if (typeof data9 === "string") {
        if (!pattern10.test(data9)) {
          const err26 = {
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
            vErrors = [err26];
          } else {
            vErrors.push(err26);
          }
          errors++;
        }
      } else {
        const err27 = {
          instancePath: instancePath + "/ruleId",
          schemaPath: "#/$defs/ruleId/type",
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
    if (data.policyVersion !== undefined) {
      let data10 = data.policyVersion;
      if (typeof data10 === "string") {
        if (!pattern11.test(data10)) {
          const err28 = {
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
            vErrors = [err28];
          } else {
            vErrors.push(err28);
          }
          errors++;
        }
      } else {
        const err29 = {
          instancePath: instancePath + "/policyVersion",
          schemaPath: "#/properties/policyVersion/type",
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
    if (data.reason !== undefined) {
      let data11 = data.reason;
      if (typeof data11 === "string") {
        if (!pattern7.test(data11)) {
          const err30 = {
            instancePath: instancePath + "/reason",
            schemaPath: "#/$defs/text/pattern",
            keyword: "pattern",
            params: { pattern: "^[\\s\\S]{0,8192}$" },
            message: 'must match pattern "' + "^[\\s\\S]{0,8192}$" + '"',
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
          instancePath: instancePath + "/reason",
          schemaPath: "#/$defs/text/type",
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
  validate21.errors = vErrors;
  return errors === 0;
}
validate21.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
const schema44 = {
  title: "PermissionRejected",
  description:
    "A call denied before evaluation (unknown action, invalid input or invalid policy), so there is no ruled action, target or trusted policy version. A rejection is always a denial.",
  type: "object",
  additionalProperties: false,
  required: ["kind", "agentId", "toolCallId", "guard", "ruleId", "reason"],
  properties: {
    kind: { const: "permission.rejected" },
    agentId: { $ref: "#/$defs/agentId" },
    toolCallId: { $ref: "#/$defs/toolCallId" },
    guard: {
      description:
        "`schema`: unknown action or invalid input. `policy`: invalid policy.",
      enum: ["schema", "policy"],
    },
    ruleId: { $ref: "#/$defs/rejectedRuleId" },
    reason: { $ref: "#/$defs/text" },
    requestedName: {
      description:
        "The requested action name as shown: cut to 64 code points, then escaped (at most 9 characters each) plus a truncation marker, so at most 640 code points. Absent when the request had no string action.",
      type: "string",
      pattern: "^[\\s\\S]{0,640}$",
    },
  },
};
const schema47 = {
  title: "PermissionRejectedRuleId",
  description: "`schema.*` or `policy.*`, otherwise like a policy rule ID.",
  type: "string",
  pattern: "^(schema|policy)(\\.[a-z][a-z0-9-]{0,31}){1,3}$",
};
const pattern15 = new RegExp(
  "^(schema|policy)(\\.[a-z][a-z0-9-]{0,31}){1,3}$",
  "u",
);
const pattern17 = new RegExp("^[\\s\\S]{0,640}$", "u");
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
    if (data.toolCallId === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "toolCallId" },
        message: "must have required property '" + "toolCallId" + "'",
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
        key0 === "toolCallId" ||
        key0 === "guard" ||
        key0 === "ruleId" ||
        key0 === "reason" ||
        key0 === "requestedName"
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
            schemaPath: "#/$defs/agentId/pattern",
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
          schemaPath: "#/$defs/agentId/type",
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
    if (data.toolCallId !== undefined) {
      let data2 = data.toolCallId;
      if (typeof data2 === "string") {
        if (!pattern5.test(data2)) {
          const err10 = {
            instancePath: instancePath + "/toolCallId",
            schemaPath: "#/$defs/toolCallId/pattern",
            keyword: "pattern",
            params: { pattern: "^[!-~]{1,256}$" },
            message: 'must match pattern "' + "^[!-~]{1,256}$" + '"',
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
          instancePath: instancePath + "/toolCallId",
          schemaPath: "#/$defs/toolCallId/type",
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
          params: { allowedValues: schema44.properties.guard.enum },
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
        if (!pattern15.test(data4)) {
          const err13 = {
            instancePath: instancePath + "/ruleId",
            schemaPath: "#/$defs/rejectedRuleId/pattern",
            keyword: "pattern",
            params: {
              pattern: "^(schema|policy)(\\.[a-z][a-z0-9-]{0,31}){1,3}$",
            },
            message:
              'must match pattern "' +
              "^(schema|policy)(\\.[a-z][a-z0-9-]{0,31}){1,3}$" +
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
          schemaPath: "#/$defs/rejectedRuleId/type",
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
        if (!pattern7.test(data5)) {
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
    if (data.requestedName !== undefined) {
      let data6 = data.requestedName;
      if (typeof data6 === "string") {
        if (!pattern17.test(data6)) {
          const err17 = {
            instancePath: instancePath + "/requestedName",
            schemaPath: "#/properties/requestedName/pattern",
            keyword: "pattern",
            params: { pattern: "^[\\s\\S]{0,640}$" },
            message: 'must match pattern "' + "^[\\s\\S]{0,640}$" + '"',
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
          instancePath: instancePath + "/requestedName",
          schemaPath: "#/properties/requestedName/type",
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
const schema49 = {
  title: "PermissionAsked",
  description:
    "The owner was asked to approve a call. `promptSha256` is the SHA-256 of the exact prompt shown, so an approval can be bound to what was seen. `viewSha256` is present when a target or detail was too long for the prompt: the SHA-256 of the full-value view the owner must page through before an approval counts.",
  type: "object",
  additionalProperties: false,
  required: ["kind", "toolCallId", "presence", "promptSha256"],
  properties: {
    kind: { const: "permission.asked" },
    toolCallId: { $ref: "#/$defs/toolCallId" },
    presence: {
      description:
        "`tty`: an interactive terminal could show the prompt. `none`: no one can answer, so the ask is denied.",
      enum: ["tty", "none"],
    },
    promptSha256: { $ref: "#/$defs/sha256" },
    viewSha256: { $ref: "#/$defs/sha256" },
  },
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
    if (data.toolCallId === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "toolCallId" },
        message: "must have required property '" + "toolCallId" + "'",
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
        key0 === "toolCallId" ||
        key0 === "presence" ||
        key0 === "promptSha256" ||
        key0 === "viewSha256"
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
    if (data.toolCallId !== undefined) {
      let data1 = data.toolCallId;
      if (typeof data1 === "string") {
        if (!pattern5.test(data1)) {
          const err6 = {
            instancePath: instancePath + "/toolCallId",
            schemaPath: "#/$defs/toolCallId/pattern",
            keyword: "pattern",
            params: { pattern: "^[!-~]{1,256}$" },
            message: 'must match pattern "' + "^[!-~]{1,256}$" + '"',
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
          instancePath: instancePath + "/toolCallId",
          schemaPath: "#/$defs/toolCallId/type",
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
          params: { allowedValues: schema49.properties.presence.enum },
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
        if (!pattern6.test(data3)) {
          const err9 = {
            instancePath: instancePath + "/promptSha256",
            schemaPath: "#/$defs/sha256/pattern",
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
          schemaPath: "#/$defs/sha256/type",
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
    if (data.viewSha256 !== undefined) {
      let data4 = data.viewSha256;
      if (typeof data4 === "string") {
        if (!pattern6.test(data4)) {
          const err11 = {
            instancePath: instancePath + "/viewSha256",
            schemaPath: "#/$defs/sha256/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9a-f]{64}$" },
            message: 'must match pattern "' + "^[0-9a-f]{64}$" + '"',
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
          instancePath: instancePath + "/viewSha256",
          schemaPath: "#/$defs/sha256/type",
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
  validate27.errors = vErrors;
  return errors === 0;
}
validate27.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
const schema53 = {
  title: "PermissionAnswered",
  description:
    "How an ask ended: an approval, which only the owner at the TTY can give, or a denial.",
  oneOf: [
    { $ref: "#/$defs/answeredApproved" },
    { $ref: "#/$defs/answeredDenied" },
  ],
};
const schema54 = {
  title: "PermissionAnsweredApproved",
  type: "object",
  additionalProperties: false,
  required: ["kind", "toolCallId", "answer", "by", "waitMs", "attestation"],
  properties: {
    kind: { const: "permission.answered" },
    toolCallId: { $ref: "#/$defs/toolCallId" },
    answer: { const: "approved" },
    by: { const: "tty" },
    viewed: {
      description:
        "Present when the ask had a full-value view: an approval counts only after the view was shown to its end.",
      const: true,
    },
    waitMs: { $ref: "#/$defs/waitMs" },
    attestation: { $ref: "#/$defs/attestation" },
  },
};
const schema56 = {
  description: "Milliseconds between the ask and the answer.",
  type: "integer",
  minimum: 0,
  maximum: 9007199254740991,
};
const schema57 = {
  title: "PermissionAttestation",
  description:
    'Proof of who approved. Until slice SIG only `none` exists; SIG adds `{kind: "presence", …}`, a signed owner-presence attestation.',
  oneOf: [{ $ref: "#/$defs/attestationNone" }],
};
const schema58 = {
  title: "PermissionAttestationNone",
  type: "object",
  additionalProperties: false,
  required: ["kind"],
  properties: { kind: { const: "none" } },
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
  validate31.errors = vErrors;
  evaluated0.props = props0;
  return errors === 0;
}
validate31.evaluated = { dynamicProps: true, dynamicItems: false };
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
    if (data.toolCallId === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "toolCallId" },
        message: "must have required property '" + "toolCallId" + "'",
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
        key0 === "toolCallId" ||
        key0 === "answer" ||
        key0 === "by" ||
        key0 === "viewed" ||
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
    if (data.toolCallId !== undefined) {
      let data1 = data.toolCallId;
      if (typeof data1 === "string") {
        if (!pattern5.test(data1)) {
          const err8 = {
            instancePath: instancePath + "/toolCallId",
            schemaPath: "#/$defs/toolCallId/pattern",
            keyword: "pattern",
            params: { pattern: "^[!-~]{1,256}$" },
            message: 'must match pattern "' + "^[!-~]{1,256}$" + '"',
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
          instancePath: instancePath + "/toolCallId",
          schemaPath: "#/$defs/toolCallId/type",
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
      if ("approved" !== data.answer) {
        const err10 = {
          instancePath: instancePath + "/answer",
          schemaPath: "#/properties/answer/const",
          keyword: "const",
          params: { allowedValue: "approved" },
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
    if (data.by !== undefined) {
      if ("tty" !== data.by) {
        const err11 = {
          instancePath: instancePath + "/by",
          schemaPath: "#/properties/by/const",
          keyword: "const",
          params: { allowedValue: "tty" },
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
    if (data.viewed !== undefined) {
      if (true !== data.viewed) {
        const err12 = {
          instancePath: instancePath + "/viewed",
          schemaPath: "#/properties/viewed/const",
          keyword: "const",
          params: { allowedValue: true },
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
    if (data.waitMs !== undefined) {
      let data5 = data.waitMs;
      if (!(
        typeof data5 == "number" &&
        !(data5 % 1) &&
        !isNaN(data5) &&
        isFinite(data5)
      )) {
        const err13 = {
          instancePath: instancePath + "/waitMs",
          schemaPath: "#/$defs/waitMs/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
      if (typeof data5 == "number" && isFinite(data5)) {
        if (data5 > 9007199254740991 || isNaN(data5)) {
          const err14 = {
            instancePath: instancePath + "/waitMs",
            schemaPath: "#/$defs/waitMs/maximum",
            keyword: "maximum",
            params: { comparison: "<=", limit: 9007199254740991 },
            message: "must be <= 9007199254740991",
          };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
        if (data5 < 0 || isNaN(data5)) {
          const err15 = {
            instancePath: instancePath + "/waitMs",
            schemaPath: "#/$defs/waitMs/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
      }
    }
    if (data.attestation !== undefined) {
      if (
        !validate31(data.attestation, {
          instancePath: instancePath + "/attestation",
          parentData: data,
          parentDataProperty: "attestation",
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
    const err16 = {
      instancePath,
      schemaPath: "#/type",
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
  validate30.errors = vErrors;
  return errors === 0;
}
validate30.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
const schema59 = {
  title: "PermissionAnsweredDenied",
  type: "object",
  additionalProperties: false,
  required: ["kind", "toolCallId", "answer", "by", "waitMs", "attestation"],
  properties: {
    kind: { const: "permission.answered" },
    toolCallId: { $ref: "#/$defs/toolCallId" },
    answer: { const: "denied" },
    by: {
      description:
        "`tty`: the owner denied. `noPresence`: no one could be asked. `cancelled`: the ask ended without an answer.",
      enum: ["tty", "noPresence", "cancelled"],
    },
    viewed: {
      description:
        "Present when the ask had a full-value view: whether it was shown to its end.",
      type: "boolean",
    },
    waitMs: { $ref: "#/$defs/waitMs" },
    attestation: { $ref: "#/$defs/attestation" },
  },
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
    if (data.toolCallId === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "toolCallId" },
        message: "must have required property '" + "toolCallId" + "'",
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
        key0 === "toolCallId" ||
        key0 === "answer" ||
        key0 === "by" ||
        key0 === "viewed" ||
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
    if (data.toolCallId !== undefined) {
      let data1 = data.toolCallId;
      if (typeof data1 === "string") {
        if (!pattern5.test(data1)) {
          const err8 = {
            instancePath: instancePath + "/toolCallId",
            schemaPath: "#/$defs/toolCallId/pattern",
            keyword: "pattern",
            params: { pattern: "^[!-~]{1,256}$" },
            message: 'must match pattern "' + "^[!-~]{1,256}$" + '"',
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
          instancePath: instancePath + "/toolCallId",
          schemaPath: "#/$defs/toolCallId/type",
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
      if ("denied" !== data.answer) {
        const err10 = {
          instancePath: instancePath + "/answer",
          schemaPath: "#/properties/answer/const",
          keyword: "const",
          params: { allowedValue: "denied" },
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
    if (data.by !== undefined) {
      let data3 = data.by;
      if (!(
        data3 === "tty" ||
        data3 === "noPresence" ||
        data3 === "cancelled"
      )) {
        const err11 = {
          instancePath: instancePath + "/by",
          schemaPath: "#/properties/by/enum",
          keyword: "enum",
          params: { allowedValues: schema59.properties.by.enum },
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
    if (data.viewed !== undefined) {
      if (typeof data.viewed !== "boolean") {
        const err12 = {
          instancePath: instancePath + "/viewed",
          schemaPath: "#/properties/viewed/type",
          keyword: "type",
          params: { type: "boolean" },
          message: "must be boolean",
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.waitMs !== undefined) {
      let data5 = data.waitMs;
      if (!(
        typeof data5 == "number" &&
        !(data5 % 1) &&
        !isNaN(data5) &&
        isFinite(data5)
      )) {
        const err13 = {
          instancePath: instancePath + "/waitMs",
          schemaPath: "#/$defs/waitMs/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
      if (typeof data5 == "number" && isFinite(data5)) {
        if (data5 > 9007199254740991 || isNaN(data5)) {
          const err14 = {
            instancePath: instancePath + "/waitMs",
            schemaPath: "#/$defs/waitMs/maximum",
            keyword: "maximum",
            params: { comparison: "<=", limit: 9007199254740991 },
            message: "must be <= 9007199254740991",
          };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
        if (data5 < 0 || isNaN(data5)) {
          const err15 = {
            instancePath: instancePath + "/waitMs",
            schemaPath: "#/$defs/waitMs/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
      }
    }
    if (data.attestation !== undefined) {
      if (
        !validate31(data.attestation, {
          instancePath: instancePath + "/attestation",
          parentData: data,
          parentDataProperty: "attestation",
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
    const err16 = {
      instancePath,
      schemaPath: "#/type",
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
  validate34.errors = vErrors;
  return errors === 0;
}
validate34.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
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
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (
    !validate30(data, {
      instancePath,
      parentData,
      parentDataProperty,
      rootData,
      dynamicAnchors,
    })
  ) {
    vErrors =
      vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
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
  validate29.errors = vErrors;
  evaluated0.props = props0;
  return errors === 0;
}
validate29.evaluated = { dynamicProps: true, dynamicItems: false };
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
      } else {
        var props1 = validate29.evaluated.props;
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
