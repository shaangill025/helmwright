// Generated from schemas/permission-policy.schema.json by scripts/generate.ts. Do not edit.
"use strict";
export const validate = validate20;
export default validate20;
const schema31 = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/shaangill025/helmwright/schemas/permission-policy.schema.json",
  title: "PermissionPolicy",
  description:
    "The permission policy the broker evaluates for every typed action (B9, Q51). The always-ask set is checked before any rule, in every governance mode (03); an override may add or tighten, never relax it.",
  type: "object",
  additionalProperties: false,
  required: [
    "version",
    "governance",
    "rules",
    "alwaysAsk",
    "ring0Paths",
    "ring0Settings",
  ],
  properties: {
    version: {
      description: "Policy version, recorded with every permission decision.",
      type: "string",
      pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$",
    },
    governance: {
      description:
        "Governance mode (08, Ring 0). Only the default, tiered, until another mode has a fixture (07 rule 1).",
      const: "tiered",
    },
    rules: {
      description:
        "Evaluated in order after the always-ask checks; the first match wins and no match asks.",
      type: "array",
      maxItems: 256,
      items: { $ref: "#/$defs/rule" },
    },
    alwaysAsk: {
      description:
        "Actions that always ask, whatever the rules or governance mode.",
      type: "array",
      maxItems: 64,
      items: { $ref: "#/$defs/action" },
    },
    ring0Paths: {
      description:
        "Worktree-relative globs, matched case-folded, whose edits always ask. `*` matches within one segment; `/**` may only end a pattern and matches the directory and everything below it.",
      type: "array",
      maxItems: 256,
      items: { $ref: "#/$defs/pathGlob" },
    },
    ring0Settings: {
      description:
        "Dotted setting names (08, Ring 0) whose change always asks, as do their parents and children.",
      type: "array",
      maxItems: 64,
      items: { $ref: "#/$defs/setting" },
    },
  },
  $defs: {
    action: {
      title: "PermissionAction",
      description:
        "A typed action name (Q6). Most have no M1 handler yet; they exist so that the policy can rule on them.",
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
      enum: ["allow", "ask", "deny", "alwaysAsk"],
    },
    rule: {
      title: "PermissionRule",
      type: "object",
      additionalProperties: false,
      required: ["id", "action", "scope", "tier"],
      properties: {
        id: { type: "string", pattern: "^[a-z][a-z0-9.-]{0,63}$" },
        action: { $ref: "#/$defs/action" },
        scope: {
          description:
            "`worktree`: the target is strictly inside the run's worktree and not under `.git` (execute always runs there). `runBranch`: the ref is the run's own branch. `any`: every target.",
          enum: ["worktree", "runBranch", "any"],
        },
        tier: { $ref: "#/$defs/tier" },
      },
    },
    pathGlob: {
      description:
        "Relative, no `.` or `..` segments, no empty segments, and `**` only as the whole last segment. Split into simple patterns so no regex nests quantifiers (ReDoS).",
      type: "string",
      allOf: [
        { pattern: "^[A-Za-z0-9._*/-]{1,128}$" },
        {
          not: {
            pattern: "^/|//|/$|(^|/)\\.\\.?(/|$)|\\*\\*[^/]|[^/]\\*\\*|\\*\\*/",
          },
        },
      ],
    },
    setting: {
      description:
        "Dotted camelCase setting name, e.g. `permissions.governance`; each segment starts with a lowercase letter.",
      type: "string",
      allOf: [
        { pattern: "^[a-z][A-Za-z0-9.]{0,127}$" },
        { not: { pattern: "\\.\\.|\\.$|\\.[^a-z]" } },
      ],
    },
  },
};
const schema33 = {
  title: "PermissionAction",
  description:
    "A typed action name (Q6). Most have no M1 handler yet; they exist so that the policy can rule on them.",
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
const schema36 = {
  description:
    "Relative, no `.` or `..` segments, no empty segments, and `**` only as the whole last segment. Split into simple patterns so no regex nests quantifiers (ReDoS).",
  type: "string",
  allOf: [
    { pattern: "^[A-Za-z0-9._*/-]{1,128}$" },
    {
      not: {
        pattern: "^/|//|/$|(^|/)\\.\\.?(/|$)|\\*\\*[^/]|[^/]\\*\\*|\\*\\*/",
      },
    },
  ],
};
const schema37 = {
  description:
    "Dotted camelCase setting name, e.g. `permissions.governance`; each segment starts with a lowercase letter.",
  type: "string",
  allOf: [
    { pattern: "^[a-z][A-Za-z0-9.]{0,127}$" },
    { not: { pattern: "\\.\\.|\\.$|\\.[^a-z]" } },
  ],
};
const pattern4 = new RegExp("^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$", "u");
const pattern6 = new RegExp("^[A-Za-z0-9._*/-]{1,128}$", "u");
const pattern7 = new RegExp(
  "^/|//|/$|(^|/)\\.\\.?(/|$)|\\*\\*[^/]|[^/]\\*\\*|\\*\\*/",
  "u",
);
const pattern8 = new RegExp("^[a-z][A-Za-z0-9.]{0,127}$", "u");
const pattern9 = new RegExp("\\.\\.|\\.$|\\.[^a-z]", "u");
const schema32 = {
  title: "PermissionRule",
  type: "object",
  additionalProperties: false,
  required: ["id", "action", "scope", "tier"],
  properties: {
    id: { type: "string", pattern: "^[a-z][a-z0-9.-]{0,63}$" },
    action: { $ref: "#/$defs/action" },
    scope: {
      description:
        "`worktree`: the target is strictly inside the run's worktree and not under `.git` (execute always runs there). `runBranch`: the ref is the run's own branch. `any`: every target.",
      enum: ["worktree", "runBranch", "any"],
    },
    tier: { $ref: "#/$defs/tier" },
  },
};
const schema34 = {
  title: "PermissionTier",
  enum: ["allow", "ask", "deny", "alwaysAsk"],
};
const pattern5 = new RegExp("^[a-z][a-z0-9.-]{0,63}$", "u");
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
    if (data.action === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "action" },
        message: "must have required property '" + "action" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.scope === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "scope" },
        message: "must have required property '" + "scope" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.tier === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "tier" },
        message: "must have required property '" + "tier" + "'",
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
        key0 === "id" ||
        key0 === "action" ||
        key0 === "scope" ||
        key0 === "tier"
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
    if (data.id !== undefined) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (!pattern5.test(data0)) {
          const err5 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/properties/id/pattern",
            keyword: "pattern",
            params: { pattern: "^[a-z][a-z0-9.-]{0,63}$" },
            message: 'must match pattern "' + "^[a-z][a-z0-9.-]{0,63}$" + '"',
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
          instancePath: instancePath + "/id",
          schemaPath: "#/properties/id/type",
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
    if (data.action !== undefined) {
      let data1 = data.action;
      if (!(
        data1 === "execute" ||
        data1 === "fs.read" ||
        data1 === "fs.edit" ||
        data1 === "fs.delete" ||
        data1 === "commit" ||
        data1 === "deps.add" ||
        data1 === "config.set" ||
        data1 === "spend.raiseCap" ||
        data1 === "push" ||
        data1 === "pr.open" ||
        data1 === "pr.merge" ||
        data1 === "comment" ||
        data1 === "publish" ||
        data1 === "deploy"
      )) {
        const err7 = {
          instancePath: instancePath + "/action",
          schemaPath: "#/$defs/action/enum",
          keyword: "enum",
          params: { allowedValues: schema33.enum },
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
    if (data.scope !== undefined) {
      let data2 = data.scope;
      if (!(data2 === "worktree" || data2 === "runBranch" || data2 === "any")) {
        const err8 = {
          instancePath: instancePath + "/scope",
          schemaPath: "#/properties/scope/enum",
          keyword: "enum",
          params: { allowedValues: schema32.properties.scope.enum },
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
    if (data.tier !== undefined) {
      let data3 = data.tier;
      if (!(
        data3 === "allow" ||
        data3 === "ask" ||
        data3 === "deny" ||
        data3 === "alwaysAsk"
      )) {
        const err9 = {
          instancePath: instancePath + "/tier",
          schemaPath: "#/$defs/tier/enum",
          keyword: "enum",
          params: { allowedValues: schema34.enum },
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
  } else {
    const err10 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err10];
    } else {
      vErrors.push(err10);
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
  /*# sourceURL="https://github.com/shaangill025/helmwright/schemas/permission-policy.schema.json" */ let vErrors =
    null;
  let errors = 0;
  const evaluated0 = validate20.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.version === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "version" },
        message: "must have required property '" + "version" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.governance === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "governance" },
        message: "must have required property '" + "governance" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.rules === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "rules" },
        message: "must have required property '" + "rules" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.alwaysAsk === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "alwaysAsk" },
        message: "must have required property '" + "alwaysAsk" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.ring0Paths === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "ring0Paths" },
        message: "must have required property '" + "ring0Paths" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.ring0Settings === undefined) {
      const err5 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "ring0Settings" },
        message: "must have required property '" + "ring0Settings" + "'",
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
        key0 === "version" ||
        key0 === "governance" ||
        key0 === "rules" ||
        key0 === "alwaysAsk" ||
        key0 === "ring0Paths" ||
        key0 === "ring0Settings"
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
    if (data.version !== undefined) {
      let data0 = data.version;
      if (typeof data0 === "string") {
        if (!pattern4.test(data0)) {
          const err7 = {
            instancePath: instancePath + "/version",
            schemaPath: "#/properties/version/pattern",
            keyword: "pattern",
            params: { pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$" },
            message:
              'must match pattern "' +
              "^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$" +
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
          instancePath: instancePath + "/version",
          schemaPath: "#/properties/version/type",
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
    if (data.governance !== undefined) {
      if ("tiered" !== data.governance) {
        const err9 = {
          instancePath: instancePath + "/governance",
          schemaPath: "#/properties/governance/const",
          keyword: "const",
          params: { allowedValue: "tiered" },
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
    if (data.rules !== undefined) {
      let data2 = data.rules;
      if (Array.isArray(data2)) {
        if (data2.length > 256) {
          const err10 = {
            instancePath: instancePath + "/rules",
            schemaPath: "#/properties/rules/maxItems",
            keyword: "maxItems",
            params: { limit: 256 },
            message: "must NOT have more than 256 items",
          };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
        const len0 = data2.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (
            !validate21(data2[i0], {
              instancePath: instancePath + "/rules/" + i0,
              parentData: data2,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors =
              vErrors === null
                ? validate21.errors
                : vErrors.concat(validate21.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err11 = {
          instancePath: instancePath + "/rules",
          schemaPath: "#/properties/rules/type",
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
    if (data.alwaysAsk !== undefined) {
      let data4 = data.alwaysAsk;
      if (Array.isArray(data4)) {
        if (data4.length > 64) {
          const err12 = {
            instancePath: instancePath + "/alwaysAsk",
            schemaPath: "#/properties/alwaysAsk/maxItems",
            keyword: "maxItems",
            params: { limit: 64 },
            message: "must NOT have more than 64 items",
          };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
        const len1 = data4.length;
        for (let i1 = 0; i1 < len1; i1++) {
          let data5 = data4[i1];
          if (!(
            data5 === "execute" ||
            data5 === "fs.read" ||
            data5 === "fs.edit" ||
            data5 === "fs.delete" ||
            data5 === "commit" ||
            data5 === "deps.add" ||
            data5 === "config.set" ||
            data5 === "spend.raiseCap" ||
            data5 === "push" ||
            data5 === "pr.open" ||
            data5 === "pr.merge" ||
            data5 === "comment" ||
            data5 === "publish" ||
            data5 === "deploy"
          )) {
            const err13 = {
              instancePath: instancePath + "/alwaysAsk/" + i1,
              schemaPath: "#/$defs/action/enum",
              keyword: "enum",
              params: { allowedValues: schema33.enum },
              message: "must be equal to one of the allowed values",
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
          instancePath: instancePath + "/alwaysAsk",
          schemaPath: "#/properties/alwaysAsk/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
    }
    if (data.ring0Paths !== undefined) {
      let data6 = data.ring0Paths;
      if (Array.isArray(data6)) {
        if (data6.length > 256) {
          const err15 = {
            instancePath: instancePath + "/ring0Paths",
            schemaPath: "#/properties/ring0Paths/maxItems",
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
        const len2 = data6.length;
        for (let i2 = 0; i2 < len2; i2++) {
          let data7 = data6[i2];
          if (typeof data7 !== "string") {
            const err16 = {
              instancePath: instancePath + "/ring0Paths/" + i2,
              schemaPath: "#/$defs/pathGlob/type",
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
          if (typeof data7 === "string") {
            if (!pattern6.test(data7)) {
              const err17 = {
                instancePath: instancePath + "/ring0Paths/" + i2,
                schemaPath: "#/$defs/pathGlob/allOf/0/pattern",
                keyword: "pattern",
                params: { pattern: "^[A-Za-z0-9._*/-]{1,128}$" },
                message:
                  'must match pattern "' + "^[A-Za-z0-9._*/-]{1,128}$" + '"',
              };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
          }
          const _errs19 = errors;
          const _errs20 = errors;
          if (typeof data7 === "string") {
            if (!pattern7.test(data7)) {
              const err18 = {};
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
          }
          var valid10 = _errs20 === errors;
          if (valid10) {
            const err19 = {
              instancePath: instancePath + "/ring0Paths/" + i2,
              schemaPath: "#/$defs/pathGlob/allOf/1/not",
              keyword: "not",
              params: {},
              message: "must NOT be valid",
            };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
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
        }
      } else {
        const err20 = {
          instancePath: instancePath + "/ring0Paths",
          schemaPath: "#/properties/ring0Paths/type",
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
    if (data.ring0Settings !== undefined) {
      let data8 = data.ring0Settings;
      if (Array.isArray(data8)) {
        if (data8.length > 64) {
          const err21 = {
            instancePath: instancePath + "/ring0Settings",
            schemaPath: "#/properties/ring0Settings/maxItems",
            keyword: "maxItems",
            params: { limit: 64 },
            message: "must NOT have more than 64 items",
          };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
        const len3 = data8.length;
        for (let i3 = 0; i3 < len3; i3++) {
          let data9 = data8[i3];
          if (typeof data9 !== "string") {
            const err22 = {
              instancePath: instancePath + "/ring0Settings/" + i3,
              schemaPath: "#/$defs/setting/type",
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
          if (typeof data9 === "string") {
            if (!pattern8.test(data9)) {
              const err23 = {
                instancePath: instancePath + "/ring0Settings/" + i3,
                schemaPath: "#/$defs/setting/allOf/0/pattern",
                keyword: "pattern",
                params: { pattern: "^[a-z][A-Za-z0-9.]{0,127}$" },
                message:
                  'must match pattern "' + "^[a-z][A-Za-z0-9.]{0,127}$" + '"',
              };
              if (vErrors === null) {
                vErrors = [err23];
              } else {
                vErrors.push(err23);
              }
              errors++;
            }
          }
          const _errs28 = errors;
          const _errs29 = errors;
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
          var valid15 = _errs29 === errors;
          if (valid15) {
            const err25 = {
              instancePath: instancePath + "/ring0Settings/" + i3,
              schemaPath: "#/$defs/setting/allOf/1/not",
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
            errors = _errs28;
            if (vErrors !== null) {
              if (_errs28) {
                vErrors.length = _errs28;
              } else {
                vErrors = null;
              }
            }
          }
        }
      } else {
        const err26 = {
          instancePath: instancePath + "/ring0Settings",
          schemaPath: "#/properties/ring0Settings/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
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
  validate20.errors = vErrors;
  return errors === 0;
}
validate20.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
