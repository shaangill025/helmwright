// Generated from schemas/floor-event.schema.json by scripts/generate.ts. Do not edit.
"use strict";
export const validate = validate20;
export default validate20;
const schema31 = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/shaangill025/helmwright/schemas/floor-event.schema.json",
  title: "FloorEvent",
  description:
    "Payload of a sensor floor event in the session log (B3), validated before it is appended. `kind` equals the event's `type`; the writer checks that relation. The floor is Ring 0 (06 Ring 0 contents): a deterministic rule table on the host compares the candidate tree with the run's base commit, and a candidate cannot pass by adding a suppression, changing config discovery, replacing a test command or deleting a protected assertion.",
  type: "object",
  oneOf: [{ $ref: "#/$defs/checked" }],
  $defs: {
    checked: {
      title: "FloorChecked",
      description:
        "The floor checked the candidate tree. `verdict` is `reject` if and only if there is at least one finding; `truncated` is true when more findings were found than are listed.",
      type: "object",
      additionalProperties: false,
      required: [
        "kind",
        "rules",
        "baseCommit",
        "candidateTree",
        "verdict",
        "findings",
        "truncated",
      ],
      properties: {
        kind: { const: "floor.checked" },
        rules: {
          description: "The rule table version, such as `floor-1`.",
          type: "string",
          pattern: "^floor-[1-9][0-9]{0,5}$",
        },
        baseCommit: {
          $ref: "#/$defs/oid",
          description: "The run's base commit (`run.started.baseCommit`).",
        },
        candidateTree: {
          $ref: "#/$defs/oid",
          description:
            "The candidate tree: the worktree's HEAD plus its working tree, without ignored files. Its objects need not be kept; the same content gives the same ID.",
        },
        verdict: { enum: ["pass", "reject"] },
        findings: {
          description: "The findings, sorted by path, line, rule and detail.",
          type: "array",
          maxItems: 256,
          items: { $ref: "#/$defs/finding" },
        },
        truncated: { type: "boolean" },
      },
      if: { properties: { verdict: { const: "pass" } } },
      then: {
        properties: {
          findings: { type: "array", maxItems: 0 },
          truncated: { const: false },
        },
      },
      else: { properties: { findings: { type: "array", minItems: 1 } } },
    },
    finding: {
      title: "FloorFinding",
      description:
        "One rule that fired. `path` is absent only for a `floor.limits` finding about the whole change list; `line` is the 1-based line in the candidate file.",
      type: "object",
      additionalProperties: false,
      required: ["rule", "detail"],
      properties: {
        rule: { $ref: "#/$defs/rule" },
        path: { $ref: "#/$defs/path" },
        line: { type: "integer", minimum: 1, maximum: 4294967295 },
        detail: { $ref: "#/$defs/text" },
      },
      if: { properties: { rule: { not: { const: "floor.limits" } } } },
      then: {
        properties: { path: { $ref: "#/$defs/path" } },
        required: ["path"],
      },
    },
    rule: {
      title: "FloorRule",
      description:
        "Rules of `floor-1` and `floor-2`. `assertion.removed` is `floor-1` only: `floor-2` replaces it with `protected.changed`, a finding for any change to a protected path. `floor.limits`: the change was too large to check, so the floor fails closed.",
      enum: [
        "suppression.added",
        "config.changed",
        "package.changed",
        "assertion.removed",
        "protected.changed",
        "symlink.added",
        "gitlink.added",
        "encoding.unreadable",
        "floor.limits",
      ],
    },
    oid: {
      description: "A full lowercase hex git object ID (SHA-1 or SHA-256).",
      type: "string",
      pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$",
    },
    path: {
      description:
        "A repo-relative path escaped for display: 1 to 8192 code points without C0 or C1 controls, format characters, line or paragraph separators or lone surrogates, not absolute and without empty, `.` or `..` segments.",
      type: "string",
      pattern:
        "^[^\\u0000-\\u001f\\u007f-\\u009f\\p{Cf}\\p{Zl}\\p{Zp}\\p{Cs}]{1,8192}$",
      not: { pattern: "(^|/)\\.{0,2}(/|$)" },
    },
    text: {
      description:
        "Escaped display text: 1 to 8192 code points without C0 or C1 controls, format characters, line or paragraph separators or lone surrogates.",
      type: "string",
      pattern:
        "^[^\\u0000-\\u001f\\u007f-\\u009f\\p{Cf}\\p{Zl}\\p{Zp}\\p{Cs}]{1,8192}$",
    },
  },
};
const schema32 = {
  title: "FloorChecked",
  description:
    "The floor checked the candidate tree. `verdict` is `reject` if and only if there is at least one finding; `truncated` is true when more findings were found than are listed.",
  type: "object",
  additionalProperties: false,
  required: [
    "kind",
    "rules",
    "baseCommit",
    "candidateTree",
    "verdict",
    "findings",
    "truncated",
  ],
  properties: {
    kind: { const: "floor.checked" },
    rules: {
      description: "The rule table version, such as `floor-1`.",
      type: "string",
      pattern: "^floor-[1-9][0-9]{0,5}$",
    },
    baseCommit: {
      $ref: "#/$defs/oid",
      description: "The run's base commit (`run.started.baseCommit`).",
    },
    candidateTree: {
      $ref: "#/$defs/oid",
      description:
        "The candidate tree: the worktree's HEAD plus its working tree, without ignored files. Its objects need not be kept; the same content gives the same ID.",
    },
    verdict: { enum: ["pass", "reject"] },
    findings: {
      description: "The findings, sorted by path, line, rule and detail.",
      type: "array",
      maxItems: 256,
      items: { $ref: "#/$defs/finding" },
    },
    truncated: { type: "boolean" },
  },
  if: { properties: { verdict: { const: "pass" } } },
  then: {
    properties: {
      findings: { type: "array", maxItems: 0 },
      truncated: { const: false },
    },
  },
  else: { properties: { findings: { type: "array", minItems: 1 } } },
};
const schema33 = {
  description: "A full lowercase hex git object ID (SHA-1 or SHA-256).",
  type: "string",
  pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$",
};
const pattern4 = new RegExp("^floor-[1-9][0-9]{0,5}$", "u");
const pattern5 = new RegExp("^(?:[0-9a-f]{40}|[0-9a-f]{64})$", "u");
const schema35 = {
  title: "FloorFinding",
  description:
    "One rule that fired. `path` is absent only for a `floor.limits` finding about the whole change list; `line` is the 1-based line in the candidate file.",
  type: "object",
  additionalProperties: false,
  required: ["rule", "detail"],
  properties: {
    rule: { $ref: "#/$defs/rule" },
    path: { $ref: "#/$defs/path" },
    line: { type: "integer", minimum: 1, maximum: 4294967295 },
    detail: { $ref: "#/$defs/text" },
  },
  if: { properties: { rule: { not: { const: "floor.limits" } } } },
  then: { properties: { path: { $ref: "#/$defs/path" } }, required: ["path"] },
};
const schema36 = {
  description:
    "A repo-relative path escaped for display: 1 to 8192 code points without C0 or C1 controls, format characters, line or paragraph separators or lone surrogates, not absolute and without empty, `.` or `..` segments.",
  type: "string",
  pattern:
    "^[^\\u0000-\\u001f\\u007f-\\u009f\\p{Cf}\\p{Zl}\\p{Zp}\\p{Cs}]{1,8192}$",
  not: { pattern: "(^|/)\\.{0,2}(/|$)" },
};
const schema37 = {
  title: "FloorRule",
  description:
    "Rules of `floor-1` and `floor-2`. `assertion.removed` is `floor-1` only: `floor-2` replaces it with `protected.changed`, a finding for any change to a protected path. `floor.limits`: the change was too large to check, so the floor fails closed.",
  enum: [
    "suppression.added",
    "config.changed",
    "package.changed",
    "assertion.removed",
    "protected.changed",
    "symlink.added",
    "gitlink.added",
    "encoding.unreadable",
    "floor.limits",
  ],
};
const schema39 = {
  description:
    "Escaped display text: 1 to 8192 code points without C0 or C1 controls, format characters, line or paragraph separators or lone surrogates.",
  type: "string",
  pattern:
    "^[^\\u0000-\\u001f\\u007f-\\u009f\\p{Cf}\\p{Zl}\\p{Zp}\\p{Cs}]{1,8192}$",
};
const pattern7 = new RegExp("(^|/)\\.{0,2}(/|$)", "u");
const pattern8 = new RegExp(
  "^[^\\u0000-\\u001f\\u007f-\\u009f\\p{Cf}\\p{Zl}\\p{Zp}\\p{Cs}]{1,8192}$",
  "u",
);
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
  const _errs1 = errors;
  let valid0 = true;
  const _errs2 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.rule !== undefined) {
      const _errs4 = errors;
      const _errs5 = errors;
      if ("floor.limits" !== data.rule) {
        const err0 = {};
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      var valid2 = _errs5 === errors;
      if (valid2) {
        const err1 = {};
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      } else {
        errors = _errs4;
        if (vErrors !== null) {
          if (_errs4) {
            vErrors.length = _errs4;
          } else {
            vErrors = null;
          }
        }
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
    const _errs6 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      if (data.path === undefined) {
        const err2 = {
          instancePath,
          schemaPath: "#/then/required",
          keyword: "required",
          params: { missingProperty: "path" },
          message: "must have required property '" + "path" + "'",
        };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
      if (data.path !== undefined) {
        let data1 = data.path;
        const _errs10 = errors;
        const _errs11 = errors;
        if (typeof data1 === "string") {
          if (!pattern7.test(data1)) {
            const err3 = {};
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        var valid5 = _errs11 === errors;
        if (valid5) {
          const err4 = {
            instancePath: instancePath + "/path",
            schemaPath: "#/$defs/path/not",
            keyword: "not",
            params: {},
            message: "must NOT be valid",
          };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
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
            const err5 = {
              instancePath: instancePath + "/path",
              schemaPath: "#/$defs/path/pattern",
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
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        } else {
          const err6 = {
            instancePath: instancePath + "/path",
            schemaPath: "#/$defs/path/type",
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
    }
    var _valid0 = _errs6 === errors;
    valid0 = _valid0;
    if (valid0) {
      var props0 = {};
      props0.path = true;
      props0.rule = true;
    }
  }
  if (!valid0) {
    const err7 = {
      instancePath,
      schemaPath: "#/if",
      keyword: "if",
      params: { failingKeyword: "then" },
      message: 'must match "then" schema',
    };
    if (vErrors === null) {
      vErrors = [err7];
    } else {
      vErrors.push(err7);
    }
    errors++;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.rule === undefined) {
      const err8 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "rule" },
        message: "must have required property '" + "rule" + "'",
      };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    if (data.detail === undefined) {
      const err9 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "detail" },
        message: "must have required property '" + "detail" + "'",
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
        key0 === "rule" ||
        key0 === "path" ||
        key0 === "line" ||
        key0 === "detail"
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
    if (data.rule !== undefined) {
      let data2 = data.rule;
      if (!(
        data2 === "suppression.added" ||
        data2 === "config.changed" ||
        data2 === "package.changed" ||
        data2 === "assertion.removed" ||
        data2 === "protected.changed" ||
        data2 === "symlink.added" ||
        data2 === "gitlink.added" ||
        data2 === "encoding.unreadable" ||
        data2 === "floor.limits"
      )) {
        const err11 = {
          instancePath: instancePath + "/rule",
          schemaPath: "#/$defs/rule/enum",
          keyword: "enum",
          params: { allowedValues: schema37.enum },
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
    if (data.path !== undefined) {
      let data3 = data.path;
      const _errs18 = errors;
      const _errs19 = errors;
      if (typeof data3 === "string") {
        if (!pattern7.test(data3)) {
          const err12 = {};
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
      }
      var valid9 = _errs19 === errors;
      if (valid9) {
        const err13 = {
          instancePath: instancePath + "/path",
          schemaPath: "#/$defs/path/not",
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
        errors = _errs18;
        if (vErrors !== null) {
          if (_errs18) {
            vErrors.length = _errs18;
          } else {
            vErrors = null;
          }
        }
      }
      if (typeof data3 === "string") {
        if (!pattern8.test(data3)) {
          const err14 = {
            instancePath: instancePath + "/path",
            schemaPath: "#/$defs/path/pattern",
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
          instancePath: instancePath + "/path",
          schemaPath: "#/$defs/path/type",
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
    if (data.line !== undefined) {
      let data4 = data.line;
      if (!(
        typeof data4 == "number" &&
        !(data4 % 1) &&
        !isNaN(data4) &&
        isFinite(data4)
      )) {
        const err16 = {
          instancePath: instancePath + "/line",
          schemaPath: "#/properties/line/type",
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
        if (data4 > 4294967295 || isNaN(data4)) {
          const err17 = {
            instancePath: instancePath + "/line",
            schemaPath: "#/properties/line/maximum",
            keyword: "maximum",
            params: { comparison: "<=", limit: 4294967295 },
            message: "must be <= 4294967295",
          };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        }
        if (data4 < 1 || isNaN(data4)) {
          const err18 = {
            instancePath: instancePath + "/line",
            schemaPath: "#/properties/line/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 1 },
            message: "must be >= 1",
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
    if (data.detail !== undefined) {
      let data5 = data.detail;
      if (typeof data5 === "string") {
        if (!pattern8.test(data5)) {
          const err19 = {
            instancePath: instancePath + "/detail",
            schemaPath: "#/$defs/text/pattern",
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
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
      } else {
        const err20 = {
          instancePath: instancePath + "/detail",
          schemaPath: "#/$defs/text/type",
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
  const _errs1 = errors;
  let valid0 = true;
  const _errs2 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.verdict !== undefined) {
      if ("pass" !== data.verdict) {
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
  let ifClause0;
  if (_valid0) {
    const _errs4 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      if (data.findings !== undefined) {
        let data1 = data.findings;
        if (Array.isArray(data1)) {
          if (data1.length > 0) {
            const err1 = {
              instancePath: instancePath + "/findings",
              schemaPath: "#/then/properties/findings/maxItems",
              keyword: "maxItems",
              params: { limit: 0 },
              message: "must NOT have more than 0 items",
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
            instancePath: instancePath + "/findings",
            schemaPath: "#/then/properties/findings/type",
            keyword: "type",
            params: { type: "array" },
            message: "must be array",
          };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
      }
      if (data.truncated !== undefined) {
        if (false !== data.truncated) {
          const err3 = {
            instancePath: instancePath + "/truncated",
            schemaPath: "#/then/properties/truncated/const",
            keyword: "const",
            params: { allowedValue: false },
            message: "must be equal to constant",
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
      props0.findings = true;
      props0.truncated = true;
      props0.verdict = true;
    }
    ifClause0 = "then";
  } else {
    const _errs8 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      if (data.findings !== undefined) {
        let data3 = data.findings;
        if (Array.isArray(data3)) {
          if (data3.length < 1) {
            const err4 = {
              instancePath: instancePath + "/findings",
              schemaPath: "#/else/properties/findings/minItems",
              keyword: "minItems",
              params: { limit: 1 },
              message: "must NOT have fewer than 1 items",
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
            instancePath: instancePath + "/findings",
            schemaPath: "#/else/properties/findings/type",
            keyword: "type",
            params: { type: "array" },
            message: "must be array",
          };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
    }
    var _valid0 = _errs8 === errors;
    valid0 = _valid0;
    if (valid0) {
      if (props0 !== true) {
        props0 = props0 || {};
        props0.findings = true;
      }
    }
    ifClause0 = "else";
  }
  if (!valid0) {
    const err6 = {
      instancePath,
      schemaPath: "#/if",
      keyword: "if",
      params: { failingKeyword: ifClause0 },
      message: 'must match "' + ifClause0 + '" schema',
    };
    if (vErrors === null) {
      vErrors = [err6];
    } else {
      vErrors.push(err6);
    }
    errors++;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.kind === undefined) {
      const err7 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "kind" },
        message: "must have required property '" + "kind" + "'",
      };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.rules === undefined) {
      const err8 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "rules" },
        message: "must have required property '" + "rules" + "'",
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
    if (data.candidateTree === undefined) {
      const err10 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "candidateTree" },
        message: "must have required property '" + "candidateTree" + "'",
      };
      if (vErrors === null) {
        vErrors = [err10];
      } else {
        vErrors.push(err10);
      }
      errors++;
    }
    if (data.verdict === undefined) {
      const err11 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "verdict" },
        message: "must have required property '" + "verdict" + "'",
      };
      if (vErrors === null) {
        vErrors = [err11];
      } else {
        vErrors.push(err11);
      }
      errors++;
    }
    if (data.findings === undefined) {
      const err12 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "findings" },
        message: "must have required property '" + "findings" + "'",
      };
      if (vErrors === null) {
        vErrors = [err12];
      } else {
        vErrors.push(err12);
      }
      errors++;
    }
    if (data.truncated === undefined) {
      const err13 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "truncated" },
        message: "must have required property '" + "truncated" + "'",
      };
      if (vErrors === null) {
        vErrors = [err13];
      } else {
        vErrors.push(err13);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(
        key0 === "kind" ||
        key0 === "rules" ||
        key0 === "baseCommit" ||
        key0 === "candidateTree" ||
        key0 === "verdict" ||
        key0 === "findings" ||
        key0 === "truncated"
      )) {
        const err14 = {
          instancePath,
          schemaPath: "#/additionalProperties",
          keyword: "additionalProperties",
          params: { additionalProperty: key0 },
          message: "must NOT have additional properties",
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
      if ("floor.checked" !== data.kind) {
        const err15 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "floor.checked" },
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
    if (data.rules !== undefined) {
      let data5 = data.rules;
      if (typeof data5 === "string") {
        if (!pattern4.test(data5)) {
          const err16 = {
            instancePath: instancePath + "/rules",
            schemaPath: "#/properties/rules/pattern",
            keyword: "pattern",
            params: { pattern: "^floor-[1-9][0-9]{0,5}$" },
            message: 'must match pattern "' + "^floor-[1-9][0-9]{0,5}$" + '"',
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
          instancePath: instancePath + "/rules",
          schemaPath: "#/properties/rules/type",
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
    if (data.baseCommit !== undefined) {
      let data6 = data.baseCommit;
      if (typeof data6 === "string") {
        if (!pattern5.test(data6)) {
          const err18 = {
            instancePath: instancePath + "/baseCommit",
            schemaPath: "#/$defs/oid/pattern",
            keyword: "pattern",
            params: { pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$" },
            message:
              'must match pattern "' + "^(?:[0-9a-f]{40}|[0-9a-f]{64})$" + '"',
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
          instancePath: instancePath + "/baseCommit",
          schemaPath: "#/$defs/oid/type",
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
    if (data.candidateTree !== undefined) {
      let data7 = data.candidateTree;
      if (typeof data7 === "string") {
        if (!pattern5.test(data7)) {
          const err20 = {
            instancePath: instancePath + "/candidateTree",
            schemaPath: "#/$defs/oid/pattern",
            keyword: "pattern",
            params: { pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$" },
            message:
              'must match pattern "' + "^(?:[0-9a-f]{40}|[0-9a-f]{64})$" + '"',
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
          instancePath: instancePath + "/candidateTree",
          schemaPath: "#/$defs/oid/type",
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
    if (data.verdict !== undefined) {
      let data8 = data.verdict;
      if (!(data8 === "pass" || data8 === "reject")) {
        const err22 = {
          instancePath: instancePath + "/verdict",
          schemaPath: "#/properties/verdict/enum",
          keyword: "enum",
          params: { allowedValues: schema32.properties.verdict.enum },
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
    if (data.findings !== undefined) {
      let data9 = data.findings;
      if (Array.isArray(data9)) {
        if (data9.length > 256) {
          const err23 = {
            instancePath: instancePath + "/findings",
            schemaPath: "#/properties/findings/maxItems",
            keyword: "maxItems",
            params: { limit: 256 },
            message: "must NOT have more than 256 items",
          };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
        const len0 = data9.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (
            !validate22(data9[i0], {
              instancePath: instancePath + "/findings/" + i0,
              parentData: data9,
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
        const err24 = {
          instancePath: instancePath + "/findings",
          schemaPath: "#/properties/findings/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
        }
        errors++;
      }
    }
    if (data.truncated !== undefined) {
      if (typeof data.truncated !== "boolean") {
        const err25 = {
          instancePath: instancePath + "/truncated",
          schemaPath: "#/properties/truncated/type",
          keyword: "type",
          params: { type: "boolean" },
          message: "must be boolean",
        };
        if (vErrors === null) {
          vErrors = [err25];
        } else {
          vErrors.push(err25);
        }
        errors++;
      }
    }
  } else {
    const err26 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err26];
    } else {
      vErrors.push(err26);
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
  /*# sourceURL="https://github.com/shaangill025/helmwright/schemas/floor-event.schema.json" */ let vErrors =
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
