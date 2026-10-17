// Generated from schemas/owner-event.schema.json by scripts/generate.ts. Do not edit.
"use strict";
export const validate = validate20;
export default validate20;
const schema31 = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/shaangill025/helmwright/schemas/owner-event.schema.json",
  title: "OwnerEvent",
  description:
    "Payload of an owner event (`decision.owner.*`) in the session log (SIG, T-EXT-04). Every owner event carries a presence signature over the canonical message that packages/harness/src/permission/owner-message.ts builds from it. `kind` equals the event's `type`. SIG-1 adds only this schema and the message builder: the log still refuses every `decision.owner.*` event until the signing and verifying code lands (SIG-2 and later).",
  type: "object",
  oneOf: [
    { $ref: "#/$defs/answered" },
    { $ref: "#/$defs/keyRegistered" },
    { $ref: "#/$defs/keyRotated" },
  ],
  $defs: {
    answered: {
      title: "OwnerAnswered",
      description:
        "The owner answered a decision card: chose an option, or overrode with own text. The presence signature binds the card, the decision, the action, the option hash, the text hash, the brief hash (the question as shown), the run, the graph and the nonce.",
      type: "object",
      additionalProperties: false,
      required: [
        "kind",
        "cardId",
        "decisionId",
        "action",
        "optionId",
        "optionHash",
        "presence",
      ],
      properties: {
        kind: { const: "decision.owner.answered" },
        cardId: { $ref: "#/$defs/id" },
        decisionId: { $ref: "#/$defs/id" },
        action: { enum: ["choose", "override"] },
        optionId: { enum: ["a", "b", "c", "d"] },
        optionHash: {
          $ref: "#/$defs/sha256",
          description:
            "SHA-256 of the option named by `optionId`, as `optionHash` in owner-message.ts computes it. The verifier recomputes it from the stored option with that ID; for `override` it is the option the owner started from.",
        },
        text: {
          description:
            "The owner's own text, one line of 1 to 500 code points, not only spaces, without a control character, line break, bidi control or lone surrogate (the `line` rules of objects.schema.json). `override` requires it; `choose` may carry it as a note. With `text`, `textHash` is required, and the reverse.",
          type: "string",
          pattern:
            "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,500}$",
          not: { pattern: "^\\s*$" },
        },
        textHash: {
          $ref: "#/$defs/sha256",
          description: "SHA-256 of the UTF-8 bytes of `text`.",
        },
        presence: { $ref: "#/$defs/presence" },
      },
      dependentRequired: { text: ["textHash"], textHash: ["text"] },
      if: { properties: { action: { const: "override" } } },
      then: { required: ["text"], properties: { text: true } },
    },
    keyRegistered: {
      title: "OwnerKeyRegistered",
      description:
        "The owner public key was pinned at setup. The log records the key fingerprint and the helper digest that the tamper checks compare. The first registration is signed by the key it registers.",
      type: "object",
      additionalProperties: false,
      required: [
        "kind",
        "keyId",
        "publicKeySpki",
        "fingerprint",
        "helperDigest",
        "mode",
        "presence",
      ],
      properties: {
        kind: { const: "decision.owner.key.registered" },
        keyId: { $ref: "#/$defs/id" },
        publicKeySpki: { $ref: "#/$defs/spki" },
        fingerprint: {
          $ref: "#/$defs/sha256",
          description: "SHA-256 of the SPKI DER bytes.",
        },
        helperDigest: {
          $ref: "#/$defs/sha256",
          description: "SHA-256 of the signing helper's binary.",
        },
        mode: { $ref: "#/$defs/mode" },
        presence: { $ref: "#/$defs/presence" },
      },
    },
    keyRotated: {
      title: "OwnerKeyRotated",
      description:
        "The pinned owner key changed. `presence` is a signature by the current key (`fromKeyId`); `newKeyPresence` is a signature by the new key (`toKeyId`) over the same message bytes except keyId, which proves that the owner holds it. Both bind the new fingerprint, the helper digest, the mode and fromKeyId.",
      type: "object",
      additionalProperties: false,
      required: [
        "kind",
        "fromKeyId",
        "toKeyId",
        "publicKeySpki",
        "fingerprint",
        "helperDigest",
        "mode",
        "presence",
        "newKeyPresence",
      ],
      properties: {
        kind: { const: "decision.owner.key.rotated" },
        fromKeyId: { $ref: "#/$defs/id" },
        toKeyId: { $ref: "#/$defs/id" },
        publicKeySpki: { $ref: "#/$defs/spki" },
        fingerprint: { $ref: "#/$defs/sha256" },
        helperDigest: { $ref: "#/$defs/sha256" },
        mode: { $ref: "#/$defs/mode" },
        presence: { $ref: "#/$defs/presence" },
        newKeyPresence: { $ref: "#/$defs/presence" },
      },
    },
    presence: {
      title: "OwnerPresence",
      description:
        "One presence signature: ECDSA P-256 over the owner message, made after a user-presence check. `keyId` is the signing key; `nonce` is single use; `issuedAt` is the signing time. It has no mode: the mode belongs to the registered key and is bound in the registration message, and the pinned helper digest is what makes that claim credible.",
      type: "object",
      additionalProperties: false,
      required: ["keyId", "nonce", "issuedAt", "signature"],
      properties: {
        keyId: { $ref: "#/$defs/id" },
        nonce: {
          description: "128 random bits as 32 lowercase hex digits.",
          type: "string",
          pattern: "^[0-9a-f]{32}$",
        },
        issuedAt: {
          description: "UTC timestamp in the form of the envelope `at`.",
          type: "string",
          pattern:
            "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$",
        },
        signature: {
          description:
            "Base64 of the DER-encoded ECDSA signature: 8 to 72 bytes for P-256, so 12 to 96 characters before padding. Strict DER parsing belongs to the verifier.",
          type: "string",
          pattern: "^[A-Za-z0-9+/]{12,96}={0,2}$",
        },
      },
    },
    mode: {
      description:
        "`enclave`: a Secure Enclave key. `software`: a key in memory, allowed only in test builds.",
      enum: ["enclave", "software"],
    },
    id: {
      description: "A run, card, decision or key ID.",
      type: "string",
      pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$",
    },
    sha256: {
      description: "Lowercase hex SHA-256.",
      type: "string",
      pattern: "^[0-9a-f]{64}$",
    },
    spki: {
      description:
        "Base64 of the 91-byte SubjectPublicKeyInfo DER of a P-256 public key: the fixed 26-byte header, then the 0x04 uncompressed-point marker and 64 bytes. The first 36 characters are fixed.",
      type: "string",
      pattern:
        "^MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE[A-Za-z0-9+/]{85}[AQgw]==$",
    },
  },
};
const schema32 = {
  title: "OwnerAnswered",
  description:
    "The owner answered a decision card: chose an option, or overrode with own text. The presence signature binds the card, the decision, the action, the option hash, the text hash, the brief hash (the question as shown), the run, the graph and the nonce.",
  type: "object",
  additionalProperties: false,
  required: [
    "kind",
    "cardId",
    "decisionId",
    "action",
    "optionId",
    "optionHash",
    "presence",
  ],
  properties: {
    kind: { const: "decision.owner.answered" },
    cardId: { $ref: "#/$defs/id" },
    decisionId: { $ref: "#/$defs/id" },
    action: { enum: ["choose", "override"] },
    optionId: { enum: ["a", "b", "c", "d"] },
    optionHash: {
      $ref: "#/$defs/sha256",
      description:
        "SHA-256 of the option named by `optionId`, as `optionHash` in owner-message.ts computes it. The verifier recomputes it from the stored option with that ID; for `override` it is the option the owner started from.",
    },
    text: {
      description:
        "The owner's own text, one line of 1 to 500 code points, not only spaces, without a control character, line break, bidi control or lone surrogate (the `line` rules of objects.schema.json). `override` requires it; `choose` may carry it as a note. With `text`, `textHash` is required, and the reverse.",
      type: "string",
      pattern:
        "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,500}$",
      not: { pattern: "^\\s*$" },
    },
    textHash: {
      $ref: "#/$defs/sha256",
      description: "SHA-256 of the UTF-8 bytes of `text`.",
    },
    presence: { $ref: "#/$defs/presence" },
  },
  dependentRequired: { text: ["textHash"], textHash: ["text"] },
  if: { properties: { action: { const: "override" } } },
  then: { required: ["text"], properties: { text: true } },
};
const schema33 = {
  description: "A run, card, decision or key ID.",
  type: "string",
  pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$",
};
const schema35 = {
  description: "Lowercase hex SHA-256.",
  type: "string",
  pattern: "^[0-9a-f]{64}$",
};
const func1 = Object.prototype.hasOwnProperty;
const pattern4 = new RegExp("^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$", "u");
const pattern6 = new RegExp("^[0-9a-f]{64}$", "u");
const pattern7 = new RegExp("^\\s*$", "u");
const pattern8 = new RegExp(
  "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,500}$",
  "u",
);
const schema37 = {
  title: "OwnerPresence",
  description:
    "One presence signature: ECDSA P-256 over the owner message, made after a user-presence check. `keyId` is the signing key; `nonce` is single use; `issuedAt` is the signing time. It has no mode: the mode belongs to the registered key and is bound in the registration message, and the pinned helper digest is what makes that claim credible.",
  type: "object",
  additionalProperties: false,
  required: ["keyId", "nonce", "issuedAt", "signature"],
  properties: {
    keyId: { $ref: "#/$defs/id" },
    nonce: {
      description: "128 random bits as 32 lowercase hex digits.",
      type: "string",
      pattern: "^[0-9a-f]{32}$",
    },
    issuedAt: {
      description: "UTC timestamp in the form of the envelope `at`.",
      type: "string",
      pattern:
        "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$",
    },
    signature: {
      description:
        "Base64 of the DER-encoded ECDSA signature: 8 to 72 bytes for P-256, so 12 to 96 characters before padding. Strict DER parsing belongs to the verifier.",
      type: "string",
      pattern: "^[A-Za-z0-9+/]{12,96}={0,2}$",
    },
  },
};
const pattern11 = new RegExp("^[0-9a-f]{32}$", "u");
const pattern12 = new RegExp(
  "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$",
  "u",
);
const pattern13 = new RegExp("^[A-Za-z0-9+/]{12,96}={0,2}$", "u");
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
    if (data.keyId === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "keyId" },
        message: "must have required property '" + "keyId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.nonce === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "nonce" },
        message: "must have required property '" + "nonce" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.issuedAt === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "issuedAt" },
        message: "must have required property '" + "issuedAt" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.signature === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "signature" },
        message: "must have required property '" + "signature" + "'",
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
        key0 === "keyId" ||
        key0 === "nonce" ||
        key0 === "issuedAt" ||
        key0 === "signature"
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
    if (data.keyId !== undefined) {
      let data0 = data.keyId;
      if (typeof data0 === "string") {
        if (!pattern4.test(data0)) {
          const err5 = {
            instancePath: instancePath + "/keyId",
            schemaPath: "#/$defs/id/pattern",
            keyword: "pattern",
            params: { pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$" },
            message:
              'must match pattern "' +
              "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$" +
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
          instancePath: instancePath + "/keyId",
          schemaPath: "#/$defs/id/type",
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
    if (data.nonce !== undefined) {
      let data1 = data.nonce;
      if (typeof data1 === "string") {
        if (!pattern11.test(data1)) {
          const err7 = {
            instancePath: instancePath + "/nonce",
            schemaPath: "#/properties/nonce/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9a-f]{32}$" },
            message: 'must match pattern "' + "^[0-9a-f]{32}$" + '"',
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
          instancePath: instancePath + "/nonce",
          schemaPath: "#/properties/nonce/type",
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
    if (data.issuedAt !== undefined) {
      let data2 = data.issuedAt;
      if (typeof data2 === "string") {
        if (!pattern12.test(data2)) {
          const err9 = {
            instancePath: instancePath + "/issuedAt",
            schemaPath: "#/properties/issuedAt/pattern",
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
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
      } else {
        const err10 = {
          instancePath: instancePath + "/issuedAt",
          schemaPath: "#/properties/issuedAt/type",
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
    if (data.signature !== undefined) {
      let data3 = data.signature;
      if (typeof data3 === "string") {
        if (!pattern13.test(data3)) {
          const err11 = {
            instancePath: instancePath + "/signature",
            schemaPath: "#/properties/signature/pattern",
            keyword: "pattern",
            params: { pattern: "^[A-Za-z0-9+/]{12,96}={0,2}$" },
            message:
              'must match pattern "' + "^[A-Za-z0-9+/]{12,96}={0,2}$" + '"',
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
          instancePath: instancePath + "/signature",
          schemaPath: "#/properties/signature/type",
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
    if (data.action !== undefined) {
      if ("override" !== data.action) {
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
      if (data.text === undefined) {
        const err1 = {
          instancePath,
          schemaPath: "#/then/required",
          keyword: "required",
          params: { missingProperty: "text" },
          message: "must have required property '" + "text" + "'",
        };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    }
    var _valid0 = _errs4 === errors;
    valid0 = _valid0;
    if (valid0) {
      var props0 = {};
      props0.text = true;
      props0.action = true;
    }
  }
  if (!valid0) {
    const err2 = {
      instancePath,
      schemaPath: "#/if",
      keyword: "if",
      params: { failingKeyword: "then" },
      message: 'must match "then" schema',
    };
    if (vErrors === null) {
      vErrors = [err2];
    } else {
      vErrors.push(err2);
    }
    errors++;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.kind === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "kind" },
        message: "must have required property '" + "kind" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.cardId === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "cardId" },
        message: "must have required property '" + "cardId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.decisionId === undefined) {
      const err5 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "decisionId" },
        message: "must have required property '" + "decisionId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.action === undefined) {
      const err6 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "action" },
        message: "must have required property '" + "action" + "'",
      };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.optionId === undefined) {
      const err7 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "optionId" },
        message: "must have required property '" + "optionId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.optionHash === undefined) {
      const err8 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "optionHash" },
        message: "must have required property '" + "optionHash" + "'",
      };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    if (data.presence === undefined) {
      const err9 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "presence" },
        message: "must have required property '" + "presence" + "'",
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
      if ("decision.owner.answered" !== data.kind) {
        const err11 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "decision.owner.answered" },
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
    if (data.cardId !== undefined) {
      let data2 = data.cardId;
      if (typeof data2 === "string") {
        if (!pattern4.test(data2)) {
          const err12 = {
            instancePath: instancePath + "/cardId",
            schemaPath: "#/$defs/id/pattern",
            keyword: "pattern",
            params: { pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$" },
            message:
              'must match pattern "' +
              "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$" +
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
          instancePath: instancePath + "/cardId",
          schemaPath: "#/$defs/id/type",
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
    if (data.decisionId !== undefined) {
      let data3 = data.decisionId;
      if (typeof data3 === "string") {
        if (!pattern4.test(data3)) {
          const err14 = {
            instancePath: instancePath + "/decisionId",
            schemaPath: "#/$defs/id/pattern",
            keyword: "pattern",
            params: { pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$" },
            message:
              'must match pattern "' +
              "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$" +
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
          instancePath: instancePath + "/decisionId",
          schemaPath: "#/$defs/id/type",
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
    if (data.action !== undefined) {
      let data4 = data.action;
      if (!(data4 === "choose" || data4 === "override")) {
        const err16 = {
          instancePath: instancePath + "/action",
          schemaPath: "#/properties/action/enum",
          keyword: "enum",
          params: { allowedValues: schema32.properties.action.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
    }
    if (data.optionId !== undefined) {
      let data5 = data.optionId;
      if (!(data5 === "a" || data5 === "b" || data5 === "c" || data5 === "d")) {
        const err17 = {
          instancePath: instancePath + "/optionId",
          schemaPath: "#/properties/optionId/enum",
          keyword: "enum",
          params: { allowedValues: schema32.properties.optionId.enum },
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
    if (data.optionHash !== undefined) {
      let data6 = data.optionHash;
      if (typeof data6 === "string") {
        if (!pattern6.test(data6)) {
          const err18 = {
            instancePath: instancePath + "/optionHash",
            schemaPath: "#/$defs/sha256/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9a-f]{64}$" },
            message: 'must match pattern "' + "^[0-9a-f]{64}$" + '"',
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
          instancePath: instancePath + "/optionHash",
          schemaPath: "#/$defs/sha256/type",
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
    if (data.text !== undefined) {
      let data7 = data.text;
      const _errs20 = errors;
      const _errs21 = errors;
      if (typeof data7 === "string") {
        if (!pattern7.test(data7)) {
          const err20 = {};
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        }
      }
      var valid6 = _errs21 === errors;
      if (valid6) {
        const err21 = {
          instancePath: instancePath + "/text",
          schemaPath: "#/properties/text/not",
          keyword: "not",
          params: {},
          message: "must NOT be valid",
        };
        if (vErrors === null) {
          vErrors = [err21];
        } else {
          vErrors.push(err21);
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
      if (typeof data7 === "string") {
        if (!pattern8.test(data7)) {
          const err22 = {
            instancePath: instancePath + "/text",
            schemaPath: "#/properties/text/pattern",
            keyword: "pattern",
            params: {
              pattern:
                "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,500}$",
            },
            message:
              'must match pattern "' +
              "^[^\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\p{Cs}]{1,500}$" +
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
          instancePath: instancePath + "/text",
          schemaPath: "#/properties/text/type",
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
    if (data.textHash !== undefined) {
      let data8 = data.textHash;
      if (typeof data8 === "string") {
        if (!pattern6.test(data8)) {
          const err24 = {
            instancePath: instancePath + "/textHash",
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
          instancePath: instancePath + "/textHash",
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
    if (data.presence !== undefined) {
      if (
        !validate22(data.presence, {
          instancePath: instancePath + "/presence",
          parentData: data,
          parentDataProperty: "presence",
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
    if (data.text !== undefined) {
      if (data.textHash === undefined) {
        const err26 = {
          instancePath,
          schemaPath: "#/dependentRequired",
          keyword: "dependentRequired",
          params: {
            property: "text",
            missingProperty: "textHash",
            depsCount: 1,
            deps: "textHash",
          },
          message: "must have property textHash when property text is present",
        };
        if (vErrors === null) {
          vErrors = [err26];
        } else {
          vErrors.push(err26);
        }
        errors++;
      }
    }
    if (data.textHash !== undefined) {
      if (data.text === undefined) {
        const err27 = {
          instancePath,
          schemaPath: "#/dependentRequired",
          keyword: "dependentRequired",
          params: {
            property: "textHash",
            missingProperty: "text",
            depsCount: 1,
            deps: "text",
          },
          message: "must have property text when property textHash is present",
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
const schema39 = {
  title: "OwnerKeyRegistered",
  description:
    "The owner public key was pinned at setup. The log records the key fingerprint and the helper digest that the tamper checks compare. The first registration is signed by the key it registers.",
  type: "object",
  additionalProperties: false,
  required: [
    "kind",
    "keyId",
    "publicKeySpki",
    "fingerprint",
    "helperDigest",
    "mode",
    "presence",
  ],
  properties: {
    kind: { const: "decision.owner.key.registered" },
    keyId: { $ref: "#/$defs/id" },
    publicKeySpki: { $ref: "#/$defs/spki" },
    fingerprint: {
      $ref: "#/$defs/sha256",
      description: "SHA-256 of the SPKI DER bytes.",
    },
    helperDigest: {
      $ref: "#/$defs/sha256",
      description: "SHA-256 of the signing helper's binary.",
    },
    mode: { $ref: "#/$defs/mode" },
    presence: { $ref: "#/$defs/presence" },
  },
};
const schema41 = {
  description:
    "Base64 of the 91-byte SubjectPublicKeyInfo DER of a P-256 public key: the fixed 26-byte header, then the 0x04 uncompressed-point marker and 64 bytes. The first 36 characters are fixed.",
  type: "string",
  pattern: "^MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE[A-Za-z0-9+/]{85}[AQgw]==$",
};
const schema44 = {
  description:
    "`enclave`: a Secure Enclave key. `software`: a key in memory, allowed only in test builds.",
  enum: ["enclave", "software"],
};
const pattern15 = new RegExp(
  "^MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE[A-Za-z0-9+/]{85}[AQgw]==$",
  "u",
);
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
    if (data.keyId === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "keyId" },
        message: "must have required property '" + "keyId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.publicKeySpki === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "publicKeySpki" },
        message: "must have required property '" + "publicKeySpki" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.fingerprint === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "fingerprint" },
        message: "must have required property '" + "fingerprint" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.helperDigest === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "helperDigest" },
        message: "must have required property '" + "helperDigest" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.mode === undefined) {
      const err5 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "mode" },
        message: "must have required property '" + "mode" + "'",
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.presence === undefined) {
      const err6 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "presence" },
        message: "must have required property '" + "presence" + "'",
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
        key0 === "keyId" ||
        key0 === "publicKeySpki" ||
        key0 === "fingerprint" ||
        key0 === "helperDigest" ||
        key0 === "mode" ||
        key0 === "presence"
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
      if ("decision.owner.key.registered" !== data.kind) {
        const err8 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "decision.owner.key.registered" },
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
    if (data.keyId !== undefined) {
      let data1 = data.keyId;
      if (typeof data1 === "string") {
        if (!pattern4.test(data1)) {
          const err9 = {
            instancePath: instancePath + "/keyId",
            schemaPath: "#/$defs/id/pattern",
            keyword: "pattern",
            params: { pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$" },
            message:
              'must match pattern "' +
              "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$" +
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
          instancePath: instancePath + "/keyId",
          schemaPath: "#/$defs/id/type",
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
    if (data.publicKeySpki !== undefined) {
      let data2 = data.publicKeySpki;
      if (typeof data2 === "string") {
        if (!pattern15.test(data2)) {
          const err11 = {
            instancePath: instancePath + "/publicKeySpki",
            schemaPath: "#/$defs/spki/pattern",
            keyword: "pattern",
            params: {
              pattern:
                "^MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE[A-Za-z0-9+/]{85}[AQgw]==$",
            },
            message:
              'must match pattern "' +
              "^MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE[A-Za-z0-9+/]{85}[AQgw]==$" +
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
          instancePath: instancePath + "/publicKeySpki",
          schemaPath: "#/$defs/spki/type",
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
    if (data.fingerprint !== undefined) {
      let data3 = data.fingerprint;
      if (typeof data3 === "string") {
        if (!pattern6.test(data3)) {
          const err13 = {
            instancePath: instancePath + "/fingerprint",
            schemaPath: "#/$defs/sha256/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9a-f]{64}$" },
            message: 'must match pattern "' + "^[0-9a-f]{64}$" + '"',
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
          instancePath: instancePath + "/fingerprint",
          schemaPath: "#/$defs/sha256/type",
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
    if (data.helperDigest !== undefined) {
      let data4 = data.helperDigest;
      if (typeof data4 === "string") {
        if (!pattern6.test(data4)) {
          const err15 = {
            instancePath: instancePath + "/helperDigest",
            schemaPath: "#/$defs/sha256/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9a-f]{64}$" },
            message: 'must match pattern "' + "^[0-9a-f]{64}$" + '"',
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
          instancePath: instancePath + "/helperDigest",
          schemaPath: "#/$defs/sha256/type",
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
    if (data.mode !== undefined) {
      let data5 = data.mode;
      if (!(data5 === "enclave" || data5 === "software")) {
        const err17 = {
          instancePath: instancePath + "/mode",
          schemaPath: "#/$defs/mode/enum",
          keyword: "enum",
          params: { allowedValues: schema44.enum },
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
    if (data.presence !== undefined) {
      if (
        !validate22(data.presence, {
          instancePath: instancePath + "/presence",
          parentData: data,
          parentDataProperty: "presence",
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
  validate25.errors = vErrors;
  return errors === 0;
}
validate25.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
const schema45 = {
  title: "OwnerKeyRotated",
  description:
    "The pinned owner key changed. `presence` is a signature by the current key (`fromKeyId`); `newKeyPresence` is a signature by the new key (`toKeyId`) over the same message bytes except keyId, which proves that the owner holds it. Both bind the new fingerprint, the helper digest, the mode and fromKeyId.",
  type: "object",
  additionalProperties: false,
  required: [
    "kind",
    "fromKeyId",
    "toKeyId",
    "publicKeySpki",
    "fingerprint",
    "helperDigest",
    "mode",
    "presence",
    "newKeyPresence",
  ],
  properties: {
    kind: { const: "decision.owner.key.rotated" },
    fromKeyId: { $ref: "#/$defs/id" },
    toKeyId: { $ref: "#/$defs/id" },
    publicKeySpki: { $ref: "#/$defs/spki" },
    fingerprint: { $ref: "#/$defs/sha256" },
    helperDigest: { $ref: "#/$defs/sha256" },
    mode: { $ref: "#/$defs/mode" },
    presence: { $ref: "#/$defs/presence" },
    newKeyPresence: { $ref: "#/$defs/presence" },
  },
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
    if (data.fromKeyId === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "fromKeyId" },
        message: "must have required property '" + "fromKeyId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.toKeyId === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "toKeyId" },
        message: "must have required property '" + "toKeyId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.publicKeySpki === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "publicKeySpki" },
        message: "must have required property '" + "publicKeySpki" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.fingerprint === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "fingerprint" },
        message: "must have required property '" + "fingerprint" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.helperDigest === undefined) {
      const err5 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "helperDigest" },
        message: "must have required property '" + "helperDigest" + "'",
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.mode === undefined) {
      const err6 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "mode" },
        message: "must have required property '" + "mode" + "'",
      };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.presence === undefined) {
      const err7 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "presence" },
        message: "must have required property '" + "presence" + "'",
      };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.newKeyPresence === undefined) {
      const err8 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "newKeyPresence" },
        message: "must have required property '" + "newKeyPresence" + "'",
      };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func1.call(schema45.properties, key0)) {
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
    if (data.kind !== undefined) {
      if ("decision.owner.key.rotated" !== data.kind) {
        const err10 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/properties/kind/const",
          keyword: "const",
          params: { allowedValue: "decision.owner.key.rotated" },
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
    if (data.fromKeyId !== undefined) {
      let data1 = data.fromKeyId;
      if (typeof data1 === "string") {
        if (!pattern4.test(data1)) {
          const err11 = {
            instancePath: instancePath + "/fromKeyId",
            schemaPath: "#/$defs/id/pattern",
            keyword: "pattern",
            params: { pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$" },
            message:
              'must match pattern "' +
              "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$" +
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
          instancePath: instancePath + "/fromKeyId",
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
    if (data.toKeyId !== undefined) {
      let data2 = data.toKeyId;
      if (typeof data2 === "string") {
        if (!pattern4.test(data2)) {
          const err13 = {
            instancePath: instancePath + "/toKeyId",
            schemaPath: "#/$defs/id/pattern",
            keyword: "pattern",
            params: { pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$" },
            message:
              'must match pattern "' +
              "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$" +
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
          instancePath: instancePath + "/toKeyId",
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
    if (data.publicKeySpki !== undefined) {
      let data3 = data.publicKeySpki;
      if (typeof data3 === "string") {
        if (!pattern15.test(data3)) {
          const err15 = {
            instancePath: instancePath + "/publicKeySpki",
            schemaPath: "#/$defs/spki/pattern",
            keyword: "pattern",
            params: {
              pattern:
                "^MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE[A-Za-z0-9+/]{85}[AQgw]==$",
            },
            message:
              'must match pattern "' +
              "^MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE[A-Za-z0-9+/]{85}[AQgw]==$" +
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
          instancePath: instancePath + "/publicKeySpki",
          schemaPath: "#/$defs/spki/type",
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
    if (data.fingerprint !== undefined) {
      let data4 = data.fingerprint;
      if (typeof data4 === "string") {
        if (!pattern6.test(data4)) {
          const err17 = {
            instancePath: instancePath + "/fingerprint",
            schemaPath: "#/$defs/sha256/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9a-f]{64}$" },
            message: 'must match pattern "' + "^[0-9a-f]{64}$" + '"',
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
          instancePath: instancePath + "/fingerprint",
          schemaPath: "#/$defs/sha256/type",
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
    if (data.helperDigest !== undefined) {
      let data5 = data.helperDigest;
      if (typeof data5 === "string") {
        if (!pattern6.test(data5)) {
          const err19 = {
            instancePath: instancePath + "/helperDigest",
            schemaPath: "#/$defs/sha256/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9a-f]{64}$" },
            message: 'must match pattern "' + "^[0-9a-f]{64}$" + '"',
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
          instancePath: instancePath + "/helperDigest",
          schemaPath: "#/$defs/sha256/type",
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
    if (data.mode !== undefined) {
      let data6 = data.mode;
      if (!(data6 === "enclave" || data6 === "software")) {
        const err21 = {
          instancePath: instancePath + "/mode",
          schemaPath: "#/$defs/mode/enum",
          keyword: "enum",
          params: { allowedValues: schema44.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err21];
        } else {
          vErrors.push(err21);
        }
        errors++;
      }
    }
    if (data.presence !== undefined) {
      if (
        !validate22(data.presence, {
          instancePath: instancePath + "/presence",
          parentData: data,
          parentDataProperty: "presence",
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
    if (data.newKeyPresence !== undefined) {
      if (
        !validate22(data.newKeyPresence, {
          instancePath: instancePath + "/newKeyPresence",
          parentData: data,
          parentDataProperty: "newKeyPresence",
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
    const err22 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err22];
    } else {
      vErrors.push(err22);
    }
    errors++;
  }
  validate28.errors = vErrors;
  return errors === 0;
}
validate28.evaluated = {
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
  /*# sourceURL="https://github.com/shaangill025/helmwright/schemas/owner-event.schema.json" */ let vErrors =
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
      !validate28(data, {
        instancePath,
        parentData,
        parentDataProperty,
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
