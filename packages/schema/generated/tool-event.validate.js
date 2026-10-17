// Generated from schemas/tool-event.schema.json by scripts/generate.ts. Do not edit.
"use strict";
export const validate = validate20;
export default validate20;
const schema31 = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/shaangill025/helmwright/schemas/tool-event.schema.json",
  title: "ToolEvent",
  description:
    "Payload of a tool-output event in the session log (Q69), validated before it is appended. `kind` equals the event's `type`; the writer checks that relation.",
  type: "object",
  oneOf: [{ $ref: "#/$defs/offloaded" }],
  $defs: {
    offloaded: {
      title: "ToolOutputOffloaded",
      description:
        "A tool result over the threshold was written whole to `<stateDir>/offload/<sha256>.txt`, outside the sandbox workspace, and the engine saw a head and tail preview plus a pointer line built from this payload alone. `truncatedAtSource` is true when the sandbox hit its capture ceiling, so the file is itself cut.",
      type: "object",
      additionalProperties: false,
      required: ["kind", "toolCallId", "sha256", "bytes", "truncatedAtSource"],
      properties: {
        kind: { const: "tool.output.offloaded" },
        toolCallId: {
          description:
            "The engine's tool call ID, as in the loop events: printable ASCII without spaces, 1 to 256 characters.",
          type: "string",
          pattern: "^[!-~]{1,256}$",
        },
        sha256: {
          description:
            "Lowercase hex SHA-256 of the offloaded text (UTF-8), which names its file.",
          type: "string",
          pattern: "^[0-9a-f]{64}$",
        },
        bytes: {
          description: "Size of the offloaded text in UTF-8 bytes.",
          type: "integer",
          minimum: 0,
          maximum: 9007199254740991,
        },
        truncatedAtSource: { type: "boolean" },
      },
    },
  },
};
const schema32 = {
  title: "ToolOutputOffloaded",
  description:
    "A tool result over the threshold was written whole to `<stateDir>/offload/<sha256>.txt`, outside the sandbox workspace, and the engine saw a head and tail preview plus a pointer line built from this payload alone. `truncatedAtSource` is true when the sandbox hit its capture ceiling, so the file is itself cut.",
  type: "object",
  additionalProperties: false,
  required: ["kind", "toolCallId", "sha256", "bytes", "truncatedAtSource"],
  properties: {
    kind: { const: "tool.output.offloaded" },
    toolCallId: {
      description:
        "The engine's tool call ID, as in the loop events: printable ASCII without spaces, 1 to 256 characters.",
      type: "string",
      pattern: "^[!-~]{1,256}$",
    },
    sha256: {
      description:
        "Lowercase hex SHA-256 of the offloaded text (UTF-8), which names its file.",
      type: "string",
      pattern: "^[0-9a-f]{64}$",
    },
    bytes: {
      description: "Size of the offloaded text in UTF-8 bytes.",
      type: "integer",
      minimum: 0,
      maximum: 9007199254740991,
    },
    truncatedAtSource: { type: "boolean" },
  },
};
const pattern4 = new RegExp("^[!-~]{1,256}$", "u");
const pattern5 = new RegExp("^[0-9a-f]{64}$", "u");
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
  /*# sourceURL="https://github.com/shaangill025/helmwright/schemas/tool-event.schema.json" */ let vErrors =
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
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.kind === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/$defs/offloaded/required",
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
    if (data.toolCallId === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/$defs/offloaded/required",
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
    if (data.sha256 === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/$defs/offloaded/required",
        keyword: "required",
        params: { missingProperty: "sha256" },
        message: "must have required property '" + "sha256" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.bytes === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/$defs/offloaded/required",
        keyword: "required",
        params: { missingProperty: "bytes" },
        message: "must have required property '" + "bytes" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.truncatedAtSource === undefined) {
      const err5 = {
        instancePath,
        schemaPath: "#/$defs/offloaded/required",
        keyword: "required",
        params: { missingProperty: "truncatedAtSource" },
        message: "must have required property '" + "truncatedAtSource" + "'",
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
        key0 === "sha256" ||
        key0 === "bytes" ||
        key0 === "truncatedAtSource"
      )) {
        const err6 = {
          instancePath,
          schemaPath: "#/$defs/offloaded/additionalProperties",
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
      if ("tool.output.offloaded" !== data.kind) {
        const err7 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/$defs/offloaded/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "tool.output.offloaded" },
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
        if (!pattern4.test(data1)) {
          const err8 = {
            instancePath: instancePath + "/toolCallId",
            schemaPath: "#/$defs/offloaded/properties/toolCallId/pattern",
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
          schemaPath: "#/$defs/offloaded/properties/toolCallId/type",
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
    if (data.sha256 !== undefined) {
      let data2 = data.sha256;
      if (typeof data2 === "string") {
        if (!pattern5.test(data2)) {
          const err10 = {
            instancePath: instancePath + "/sha256",
            schemaPath: "#/$defs/offloaded/properties/sha256/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9a-f]{64}$" },
            message: 'must match pattern "' + "^[0-9a-f]{64}$" + '"',
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
          instancePath: instancePath + "/sha256",
          schemaPath: "#/$defs/offloaded/properties/sha256/type",
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
    if (data.bytes !== undefined) {
      let data3 = data.bytes;
      if (!(
        typeof data3 == "number" &&
        !(data3 % 1) &&
        !isNaN(data3) &&
        isFinite(data3)
      )) {
        const err12 = {
          instancePath: instancePath + "/bytes",
          schemaPath: "#/$defs/offloaded/properties/bytes/type",
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
      if (typeof data3 == "number" && isFinite(data3)) {
        if (data3 > 9007199254740991 || isNaN(data3)) {
          const err13 = {
            instancePath: instancePath + "/bytes",
            schemaPath: "#/$defs/offloaded/properties/bytes/maximum",
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
        if (data3 < 0 || isNaN(data3)) {
          const err14 = {
            instancePath: instancePath + "/bytes",
            schemaPath: "#/$defs/offloaded/properties/bytes/minimum",
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
    if (data.truncatedAtSource !== undefined) {
      if (typeof data.truncatedAtSource !== "boolean") {
        const err15 = {
          instancePath: instancePath + "/truncatedAtSource",
          schemaPath: "#/$defs/offloaded/properties/truncatedAtSource/type",
          keyword: "type",
          params: { type: "boolean" },
          message: "must be boolean",
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
      schemaPath: "#/$defs/offloaded/type",
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
  var _valid0 = _errs2 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
    var props0 = true;
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
