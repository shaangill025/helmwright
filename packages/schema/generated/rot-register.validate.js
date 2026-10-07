// Generated from schemas/rot-register.schema.json by scripts/generate.ts. Do not edit.
"use strict";
export const validate = validate20;
export default validate20;
const schema31 = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/shaangill025/helmwright/schemas/rot-register.schema.json",
  title: "RotRegister",
  description:
    "The rot register (07 rule 2, Q60): the assumption each component was built on, reviewed when a trigger fires. This schema checks each entry's shape; that every module is covered, every component exists and no component repeats are checked by the register's test.",
  type: "array",
  minItems: 1,
  maxItems: 1024,
  items: { $ref: "#/$defs/entry" },
  $defs: {
    entry: {
      title: "RotRegisterEntry",
      type: "object",
      additionalProperties: false,
      required: [
        "component",
        "ring",
        "assumption",
        "evidence",
        "added",
        "lastReviewed",
        "reviewTrigger",
      ],
      properties: {
        component: {
          description:
            "Repository-relative path of a file, or of a directory that covers every module below it.",
          type: "string",
          pattern: "^[A-Za-z0-9._@+/-]{1,256}$",
          not: { pattern: "^/|//|/$|(^|/)\\.\\.?(/|$)" },
        },
        ring: {
          description:
            "The component's ring in the 05 Rings table: 0 owner only, 1 evolve agent through the gate, 2 harness code.",
          enum: [0, 1, 2],
        },
        assumption: {
          description:
            "The assumption the component was built on, as one line.",
          type: "string",
          pattern: "^\\S(.{0,1022}\\S)?$",
        },
        evidence: {
          description:
            'Where the assumption comes from or is tested: a design section ("07 rule 2"), a decision row ("decisions Q60"), a test path or a corpus entry.',
          type: "array",
          minItems: 1,
          maxItems: 32,
          items: { type: "string", pattern: "^\\S(.{0,254}\\S)?$" },
        },
        added: { $ref: "#/$defs/date" },
        lastReviewed: { $ref: "#/$defs/date" },
        reviewTrigger: {
          description:
            "What makes the assumption due for review: a model change, an engine change or a milestone end.",
          type: "array",
          minItems: 1,
          maxItems: 3,
          items: { $ref: "#/$defs/reviewTrigger" },
        },
      },
    },
    date: {
      title: "RotRegisterDate",
      description: "A calendar date, YYYY-MM-DD.",
      type: "string",
      pattern: "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$",
    },
    reviewTrigger: {
      title: "RotReviewTrigger",
      enum: ["model", "engine", "milestone"],
    },
  },
};
const schema32 = {
  title: "RotRegisterEntry",
  type: "object",
  additionalProperties: false,
  required: [
    "component",
    "ring",
    "assumption",
    "evidence",
    "added",
    "lastReviewed",
    "reviewTrigger",
  ],
  properties: {
    component: {
      description:
        "Repository-relative path of a file, or of a directory that covers every module below it.",
      type: "string",
      pattern: "^[A-Za-z0-9._@+/-]{1,256}$",
      not: { pattern: "^/|//|/$|(^|/)\\.\\.?(/|$)" },
    },
    ring: {
      description:
        "The component's ring in the 05 Rings table: 0 owner only, 1 evolve agent through the gate, 2 harness code.",
      enum: [0, 1, 2],
    },
    assumption: {
      description: "The assumption the component was built on, as one line.",
      type: "string",
      pattern: "^\\S(.{0,1022}\\S)?$",
    },
    evidence: {
      description:
        'Where the assumption comes from or is tested: a design section ("07 rule 2"), a decision row ("decisions Q60"), a test path or a corpus entry.',
      type: "array",
      minItems: 1,
      maxItems: 32,
      items: { type: "string", pattern: "^\\S(.{0,254}\\S)?$" },
    },
    added: { $ref: "#/$defs/date" },
    lastReviewed: { $ref: "#/$defs/date" },
    reviewTrigger: {
      description:
        "What makes the assumption due for review: a model change, an engine change or a milestone end.",
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: { $ref: "#/$defs/reviewTrigger" },
    },
  },
};
const schema33 = {
  title: "RotRegisterDate",
  description: "A calendar date, YYYY-MM-DD.",
  type: "string",
  pattern: "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$",
};
const schema35 = {
  title: "RotReviewTrigger",
  enum: ["model", "engine", "milestone"],
};
const pattern4 = new RegExp("^/|//|/$|(^|/)\\.\\.?(/|$)", "u");
const pattern5 = new RegExp("^[A-Za-z0-9._@+/-]{1,256}$", "u");
const pattern6 = new RegExp("^\\S(.{0,1022}\\S)?$", "u");
const pattern7 = new RegExp("^\\S(.{0,254}\\S)?$", "u");
const pattern8 = new RegExp(
  "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$",
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
    if (data.component === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "component" },
        message: "must have required property '" + "component" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.ring === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "ring" },
        message: "must have required property '" + "ring" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.assumption === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "assumption" },
        message: "must have required property '" + "assumption" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.evidence === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "evidence" },
        message: "must have required property '" + "evidence" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.added === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "added" },
        message: "must have required property '" + "added" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.lastReviewed === undefined) {
      const err5 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "lastReviewed" },
        message: "must have required property '" + "lastReviewed" + "'",
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.reviewTrigger === undefined) {
      const err6 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "reviewTrigger" },
        message: "must have required property '" + "reviewTrigger" + "'",
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
        key0 === "component" ||
        key0 === "ring" ||
        key0 === "assumption" ||
        key0 === "evidence" ||
        key0 === "added" ||
        key0 === "lastReviewed" ||
        key0 === "reviewTrigger"
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
    if (data.component !== undefined) {
      let data0 = data.component;
      const _errs4 = errors;
      const _errs5 = errors;
      if (typeof data0 === "string") {
        if (!pattern4.test(data0)) {
          const err8 = {};
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      }
      var valid1 = _errs5 === errors;
      if (valid1) {
        const err9 = {
          instancePath: instancePath + "/component",
          schemaPath: "#/properties/component/not",
          keyword: "not",
          params: {},
          message: "must NOT be valid",
        };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
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
      if (typeof data0 === "string") {
        if (!pattern5.test(data0)) {
          const err10 = {
            instancePath: instancePath + "/component",
            schemaPath: "#/properties/component/pattern",
            keyword: "pattern",
            params: { pattern: "^[A-Za-z0-9._@+/-]{1,256}$" },
            message:
              'must match pattern "' + "^[A-Za-z0-9._@+/-]{1,256}$" + '"',
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
          instancePath: instancePath + "/component",
          schemaPath: "#/properties/component/type",
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
    if (data.ring !== undefined) {
      let data1 = data.ring;
      if (!(data1 === 0 || data1 === 1 || data1 === 2)) {
        const err12 = {
          instancePath: instancePath + "/ring",
          schemaPath: "#/properties/ring/enum",
          keyword: "enum",
          params: { allowedValues: schema32.properties.ring.enum },
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
    if (data.assumption !== undefined) {
      let data2 = data.assumption;
      if (typeof data2 === "string") {
        if (!pattern6.test(data2)) {
          const err13 = {
            instancePath: instancePath + "/assumption",
            schemaPath: "#/properties/assumption/pattern",
            keyword: "pattern",
            params: { pattern: "^\\S(.{0,1022}\\S)?$" },
            message: 'must match pattern "' + "^\\S(.{0,1022}\\S)?$" + '"',
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
          instancePath: instancePath + "/assumption",
          schemaPath: "#/properties/assumption/type",
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
    if (data.evidence !== undefined) {
      let data3 = data.evidence;
      if (Array.isArray(data3)) {
        if (data3.length > 32) {
          const err15 = {
            instancePath: instancePath + "/evidence",
            schemaPath: "#/properties/evidence/maxItems",
            keyword: "maxItems",
            params: { limit: 32 },
            message: "must NOT have more than 32 items",
          };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
        if (data3.length < 1) {
          const err16 = {
            instancePath: instancePath + "/evidence",
            schemaPath: "#/properties/evidence/minItems",
            keyword: "minItems",
            params: { limit: 1 },
            message: "must NOT have fewer than 1 items",
          };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
        const len0 = data3.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data4 = data3[i0];
          if (typeof data4 === "string") {
            if (!pattern7.test(data4)) {
              const err17 = {
                instancePath: instancePath + "/evidence/" + i0,
                schemaPath: "#/properties/evidence/items/pattern",
                keyword: "pattern",
                params: { pattern: "^\\S(.{0,254}\\S)?$" },
                message: 'must match pattern "' + "^\\S(.{0,254}\\S)?$" + '"',
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
              instancePath: instancePath + "/evidence/" + i0,
              schemaPath: "#/properties/evidence/items/type",
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
          instancePath: instancePath + "/evidence",
          schemaPath: "#/properties/evidence/type",
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
    if (data.added !== undefined) {
      let data5 = data.added;
      if (typeof data5 === "string") {
        if (!pattern8.test(data5)) {
          const err20 = {
            instancePath: instancePath + "/added",
            schemaPath: "#/$defs/date/pattern",
            keyword: "pattern",
            params: {
              pattern: "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$",
            },
            message:
              'must match pattern "' +
              "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$" +
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
          instancePath: instancePath + "/added",
          schemaPath: "#/$defs/date/type",
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
    if (data.lastReviewed !== undefined) {
      let data6 = data.lastReviewed;
      if (typeof data6 === "string") {
        if (!pattern8.test(data6)) {
          const err22 = {
            instancePath: instancePath + "/lastReviewed",
            schemaPath: "#/$defs/date/pattern",
            keyword: "pattern",
            params: {
              pattern: "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$",
            },
            message:
              'must match pattern "' +
              "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$" +
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
          instancePath: instancePath + "/lastReviewed",
          schemaPath: "#/$defs/date/type",
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
    if (data.reviewTrigger !== undefined) {
      let data7 = data.reviewTrigger;
      if (Array.isArray(data7)) {
        if (data7.length > 3) {
          const err24 = {
            instancePath: instancePath + "/reviewTrigger",
            schemaPath: "#/properties/reviewTrigger/maxItems",
            keyword: "maxItems",
            params: { limit: 3 },
            message: "must NOT have more than 3 items",
          };
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
        if (data7.length < 1) {
          const err25 = {
            instancePath: instancePath + "/reviewTrigger",
            schemaPath: "#/properties/reviewTrigger/minItems",
            keyword: "minItems",
            params: { limit: 1 },
            message: "must NOT have fewer than 1 items",
          };
          if (vErrors === null) {
            vErrors = [err25];
          } else {
            vErrors.push(err25);
          }
          errors++;
        }
        const len1 = data7.length;
        for (let i1 = 0; i1 < len1; i1++) {
          let data8 = data7[i1];
          if (!(
            data8 === "model" ||
            data8 === "engine" ||
            data8 === "milestone"
          )) {
            const err26 = {
              instancePath: instancePath + "/reviewTrigger/" + i1,
              schemaPath: "#/$defs/reviewTrigger/enum",
              keyword: "enum",
              params: { allowedValues: schema35.enum },
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
          instancePath: instancePath + "/reviewTrigger",
          schemaPath: "#/properties/reviewTrigger/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err27];
        } else {
          vErrors.push(err27);
        }
        errors++;
      }
    }
  } else {
    const err28 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err28];
    } else {
      vErrors.push(err28);
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
  /*# sourceURL="https://github.com/shaangill025/helmwright/schemas/rot-register.schema.json" */ let vErrors =
    null;
  let errors = 0;
  const evaluated0 = validate20.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (Array.isArray(data)) {
    if (data.length > 1024) {
      const err0 = {
        instancePath,
        schemaPath: "#/maxItems",
        keyword: "maxItems",
        params: { limit: 1024 },
        message: "must NOT have more than 1024 items",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.length < 1) {
      const err1 = {
        instancePath,
        schemaPath: "#/minItems",
        keyword: "minItems",
        params: { limit: 1 },
        message: "must NOT have fewer than 1 items",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    const len0 = data.length;
    for (let i0 = 0; i0 < len0; i0++) {
      if (
        !validate21(data[i0], {
          instancePath: instancePath + "/" + i0,
          parentData: data,
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
    const err2 = {
      instancePath,
      schemaPath: "#/type",
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
  validate20.errors = vErrors;
  return errors === 0;
}
validate20.evaluated = {
  items: true,
  dynamicProps: false,
  dynamicItems: false,
};
