// Generated from schemas/event.schema.json by scripts/generate.ts. Do not edit.
"use strict";
export const validate = validate20;
export default validate20;
const schema31 = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/shaangill025/helmwright/schemas/event.schema.json",
  title: "Event",
  description:
    "Envelope of every session-log event. Graph, run and node identity are required from the first event (design 06, Ring 0).",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "eventId",
    "seq",
    "graphId",
    "runId",
    "nodeId",
    "type",
    "at",
    "payload",
  ],
  properties: {
    schemaVersion: { const: 1 },
    eventId: { $ref: "#/$defs/id" },
    seq: {
      description:
        "Position in the session log: starts at 0, gap-free and strictly increasing.",
      type: "integer",
      minimum: 0,
      maximum: 9007199254740991,
    },
    graphId: { $ref: "#/$defs/id" },
    runId: { $ref: "#/$defs/id" },
    nodeId: { $ref: "#/$defs/id" },
    type: {
      description: "Dotted event type, e.g. `run.started`.",
      type: "string",
      pattern: "^[a-z][a-z0-9]*(\\.[a-z][a-z0-9]*)+$",
    },
    at: {
      description:
        "UTC timestamp exactly as Date.prototype.toISOString() writes it (millisecond precision, `Z`), so string order is time order. No leap seconds.",
      type: "string",
      pattern:
        "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$",
    },
    payload: {
      description:
        "Event-type-specific body; typed per event kind by the object-model schemas.",
      type: "object",
      additionalProperties: true,
    },
  },
  $defs: {
    id: {
      description:
        "Opaque identifier. A pattern rather than minLength keeps generated validators free of runtime imports.",
      type: "string",
      pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$",
    },
  },
};
const schema32 = {
  description:
    "Opaque identifier. A pattern rather than minLength keeps generated validators free of runtime imports.",
  type: "string",
  pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$",
};
const func1 = Object.prototype.hasOwnProperty;
const pattern4 = new RegExp("^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$", "u");
const pattern8 = new RegExp("^[a-z][a-z0-9]*(\\.[a-z][a-z0-9]*)+$", "u");
const pattern9 = new RegExp(
  "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$",
  "u",
);
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
  /*# sourceURL="https://github.com/shaangill025/helmwright/schemas/event.schema.json" */ let vErrors =
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
    if (data.schemaVersion === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "schemaVersion" },
        message: "must have required property '" + "schemaVersion" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.eventId === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "eventId" },
        message: "must have required property '" + "eventId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.seq === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "seq" },
        message: "must have required property '" + "seq" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.graphId === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "graphId" },
        message: "must have required property '" + "graphId" + "'",
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
    if (data.nodeId === undefined) {
      const err5 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "nodeId" },
        message: "must have required property '" + "nodeId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.type === undefined) {
      const err6 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "type" },
        message: "must have required property '" + "type" + "'",
      };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.at === undefined) {
      const err7 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "at" },
        message: "must have required property '" + "at" + "'",
      };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.payload === undefined) {
      const err8 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "payload" },
        message: "must have required property '" + "payload" + "'",
      };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func1.call(schema31.properties, key0)) {
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
    if (data.schemaVersion !== undefined) {
      if (1 !== data.schemaVersion) {
        const err10 = {
          instancePath: instancePath + "/schemaVersion",
          schemaPath: "#/properties/schemaVersion/const",
          keyword: "const",
          params: { allowedValue: 1 },
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
    if (data.eventId !== undefined) {
      let data1 = data.eventId;
      if (typeof data1 === "string") {
        if (!pattern4.test(data1)) {
          const err11 = {
            instancePath: instancePath + "/eventId",
            schemaPath: "#/$defs/id/pattern",
            keyword: "pattern",
            params: { pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$" },
            message:
              'must match pattern "' +
              "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$" +
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
          instancePath: instancePath + "/eventId",
          schemaPath: "#/$defs/id/type",
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
    if (data.seq !== undefined) {
      let data2 = data.seq;
      if (!(
        typeof data2 == "number" &&
        !(data2 % 1) &&
        !isNaN(data2) &&
        isFinite(data2)
      )) {
        const err13 = {
          instancePath: instancePath + "/seq",
          schemaPath: "#/properties/seq/type",
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
      if (typeof data2 == "number" && isFinite(data2)) {
        if (data2 > 9007199254740991 || isNaN(data2)) {
          const err14 = {
            instancePath: instancePath + "/seq",
            schemaPath: "#/properties/seq/maximum",
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
        if (data2 < 0 || isNaN(data2)) {
          const err15 = {
            instancePath: instancePath + "/seq",
            schemaPath: "#/properties/seq/minimum",
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
    if (data.graphId !== undefined) {
      let data3 = data.graphId;
      if (typeof data3 === "string") {
        if (!pattern4.test(data3)) {
          const err16 = {
            instancePath: instancePath + "/graphId",
            schemaPath: "#/$defs/id/pattern",
            keyword: "pattern",
            params: { pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$" },
            message:
              'must match pattern "' +
              "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$" +
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
          instancePath: instancePath + "/graphId",
          schemaPath: "#/$defs/id/type",
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
    if (data.runId !== undefined) {
      let data4 = data.runId;
      if (typeof data4 === "string") {
        if (!pattern4.test(data4)) {
          const err18 = {
            instancePath: instancePath + "/runId",
            schemaPath: "#/$defs/id/pattern",
            keyword: "pattern",
            params: { pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$" },
            message:
              'must match pattern "' +
              "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$" +
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
          instancePath: instancePath + "/runId",
          schemaPath: "#/$defs/id/type",
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
    if (data.nodeId !== undefined) {
      let data5 = data.nodeId;
      if (typeof data5 === "string") {
        if (!pattern4.test(data5)) {
          const err20 = {
            instancePath: instancePath + "/nodeId",
            schemaPath: "#/$defs/id/pattern",
            keyword: "pattern",
            params: { pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$" },
            message:
              'must match pattern "' +
              "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$" +
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
          instancePath: instancePath + "/nodeId",
          schemaPath: "#/$defs/id/type",
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
    if (data.type !== undefined) {
      let data6 = data.type;
      if (typeof data6 === "string") {
        if (!pattern8.test(data6)) {
          const err22 = {
            instancePath: instancePath + "/type",
            schemaPath: "#/properties/type/pattern",
            keyword: "pattern",
            params: { pattern: "^[a-z][a-z0-9]*(\\.[a-z][a-z0-9]*)+$" },
            message:
              'must match pattern "' +
              "^[a-z][a-z0-9]*(\\.[a-z][a-z0-9]*)+$" +
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
          instancePath: instancePath + "/type",
          schemaPath: "#/properties/type/type",
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
    if (data.at !== undefined) {
      let data7 = data.at;
      if (typeof data7 === "string") {
        if (!pattern9.test(data7)) {
          const err24 = {
            instancePath: instancePath + "/at",
            schemaPath: "#/properties/at/pattern",
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
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
      } else {
        const err25 = {
          instancePath: instancePath + "/at",
          schemaPath: "#/properties/at/type",
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
    if (data.payload !== undefined) {
      let data8 = data.payload;
      if (data8 && typeof data8 == "object" && !Array.isArray(data8)) {
      } else {
        const err26 = {
          instancePath: instancePath + "/payload",
          schemaPath: "#/properties/payload/type",
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
