// Generated from schemas/helmwright-config.schema.json by scripts/generate.ts. Do not edit.
"use strict";
export const validate = validate20;
export default validate20;
const schema31 = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/shaangill025/helmwright/schemas/helmwright-config.schema.json",
  title: "HelmwrightConfig",
  description:
    "The project's helmwright.config.json (08, Q51). Every key is optional and a missing key takes its default. Each setting lists its default and the alternatives of design 08; the loader admits only the default until an alternative has its own fixture (07 rule 1). Changing a Ring 0 setting is always-ask (08, Q51).",
  $comment:
    "The `$comment` of each setting gives its default, whether it is Ring 0, the consumer slice and the design 08 row. RING0_CONFIG_KEYS in src/index.ts must name the Ring 0 settings as the permission policy floor does.",
  type: "object",
  additionalProperties: false,
  properties: {
    intake: {
      type: "object",
      additionalProperties: false,
      properties: {
        classification: {
          description:
            "Who classifies a task at intake: the deterministic rubric with owner override, logged (default); the owner by hand; or the model.",
          $comment:
            'Default "rubric". Ring 0: yes. Consumer: B10. 08 row Intake / Task classification.',
          enum: ["rubric", "owner", "model"],
          default: "rubric",
        },
      },
    },
    friction: {
      type: "object",
      additionalProperties: false,
      properties: {
        defaultIntensity: {
          description:
            "Default friction: moderate (a brief at each architectural decision, sparring opt-in); minimal (stop only for permissions); low (one brief before work); high (sparring on for non-trivial work).",
          $comment:
            'Default "moderate". Ring 0: no. Consumer: A3, A5. 08 row Friction / Default intensity.',
          enum: ["moderate", "minimal", "low", "high"],
          default: "moderate",
        },
        choreDowngrade: {
          description: "Whether chores drop to minimal friction automatically.",
          $comment:
            'Default "on". Ring 0: no. Consumer: B10. 08 row Friction / Chore downgrade.',
          enum: ["on", "off"],
          default: "on",
        },
      },
    },
    decisions: {
      type: "object",
      additionalProperties: false,
      properties: {
        detection: {
          description:
            "Decision detection: the structural floor plus model self-flagging, plan-time pass first (default); the floor only; self-flagging only; or at execution time only.",
          $comment:
            'Default "floorAndSelfFlag". Ring 0: no. Consumer: A2, A4. 08 row Decisions / Detection.',
          enum: [
            "floorAndSelfFlag",
            "floorOnly",
            "selfFlagOnly",
            "executionTimeOnly",
          ],
          default: "floorAndSelfFlag",
        },
        pendingWork: {
          description:
            "Dependent work while an owned decision is pending: a provisional branch for technology and scope, a hard stop for architecture (default); a hard stop for all; or provisional for all.",
          $comment:
            'Default "provisionalExceptArchitecture". Ring 0: no. Consumer: PB. 08 row Decisions / Pending dependent work.',
          enum: [
            "provisionalExceptArchitecture",
            "hardStopAll",
            "provisionalAll",
          ],
          default: "provisionalExceptArchitecture",
        },
        briefFormat: {
          description:
            "Brief format: terse and expandable (default); a full memo; or the recommendation only.",
          $comment:
            'Default "terse". Ring 0: no. Consumer: A3. 08 row Decisions / Brief format.',
          enum: ["terse", "fullMemo", "recommendationOnly"],
          default: "terse",
        },
        briefThreshold: {
          description:
            "Which floor signals open an owner Brief; the rest become a harness Ruling: a runtime dependency add or any major bump (default); every signal (stricter); or a runtime dependency add only (looser). The value used is logged in floor.signalled.materiality.",
          $comment:
            'Default "runtimeAddOrMajor". Ring 0: no. Consumer: A-dep. 08 row Decisions / Materiality thresholds; Q53.',
          enum: ["runtimeAddOrMajor", "everySignal", "runtimeAddOnly"],
          default: "runtimeAddOrMajor",
        },
        evaluator: {
          description:
            "Who decides done: a fresh-context evaluator that only reads and runs, whose verdict flips criteria (default); or generator self-reports (not recommended).",
          $comment:
            'Default "freshContext". Ring 0: no. Consumer: B15. 08 row Decisions / Evaluator.',
          enum: ["freshContext", "generatorSelfReports"],
          default: "freshContext",
        },
      },
    },
    permissions: {
      type: "object",
      additionalProperties: false,
      properties: {
        policy: {
          description:
            "A permission policy override. It may only make the harness's default policy stricter; resolvePolicy validates it against permission-policy.schema.json and the floor. Absent means the default policy.",
          $comment:
            "Default: the harness's DEFAULT_PERMISSION_POLICY. Ring 0: yes. Consumer: B9 (resolvePolicy), loaded in B6-3. 08 row Permissions / Governance; the governance modes are in permission-policy.schema.json.",
          type: "object",
          additionalProperties: true,
        },
        untrustedContent: {
          type: "object",
          additionalProperties: false,
          properties: {
            mode: {
              description:
                "How third-party content is read: an explore-role session returns a bounded, screened hint to the acting engine (default); or a single engine reads everything (not recommended).",
              $comment:
                'Default "exploreSplit". Ring 0: yes. Consumer: B14. 08 row Permissions / Untrusted content; Q58.',
              enum: ["exploreSplit", "singleEngine"],
              default: "exploreSplit",
            },
            hintBytes: {
              description:
                "The cap, in bytes, on the explore session's hint. A config may lower it, never raise it above Q58's 1024.",
              $comment:
                "Default 1024. Ring 0: yes. Consumer: B14. 08 row Permissions / Untrusted content; Q58.",
              type: "integer",
              minimum: 1,
              maximum: 1024,
              default: 1024,
            },
          },
        },
      },
    },
    ownerLoop: {
      type: "object",
      additionalProperties: false,
      properties: {
        preCommitment: {
          description:
            "Pre-commitment: on for every owned decision, revision allowed after the reveal (default); on in sparring mode only; or off.",
          $comment:
            'Default "everyOwnedDecision". Ring 0: no. Consumer: A3. 08 row Owner loop / Pre-commitment.',
          enum: ["everyOwnedDecision", "sparringOnly", "off"],
          default: "everyOwnedDecision",
        },
        consequences: {
          description:
            "Consequence loop: automatic signals and scheduled reviews, null outcomes recorded (default); signals only; or reviews only.",
          $comment:
            'Default "signalsAndReviews". Ring 0: no. Consumer: A7, C3. 08 row Owner loop / Consequence loop.',
          enum: ["signalsAndReviews", "signalsOnly", "reviewsOnly"],
          default: "signalsAndReviews",
        },
        tutor: {
          description:
            "Tutor: just-in-time explanations and a concept map (default); just-in-time only; or both with spaced follow-ups (M2).",
          $comment:
            'Default "justInTimeAndConceptMap". Ring 0: no. Consumer: C2. 08 row Owner loop / Tutor.',
          enum: [
            "justInTimeAndConceptMap",
            "justInTimeOnly",
            "withSpacedFollowUps",
          ],
          default: "justInTimeAndConceptMap",
        },
      },
    },
    topology: {
      description:
        "Process topology: session and harness in one process, the sandbox out of process (default); all in one process; or all separate. Moves to a deployment file in M5.",
      $comment:
        'Default "sessionHarnessOneProcess". Ring 0: no. Consumer: none in M1 (only the default is admitted, owner OQ3 2026-10-07); deployment file in M5 (T-06-35). 08 row Architecture / Topology; 06.',
      enum: ["sessionHarnessOneProcess", "allInOneProcess", "allSeparate"],
      default: "sessionHarnessOneProcess",
    },
  },
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
  /*# sourceURL="https://github.com/shaangill025/helmwright/schemas/helmwright-config.schema.json" */ let vErrors =
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
    for (const key0 in data) {
      if (!(
        key0 === "intake" ||
        key0 === "friction" ||
        key0 === "decisions" ||
        key0 === "permissions" ||
        key0 === "ownerLoop" ||
        key0 === "topology"
      )) {
        const err0 = {
          instancePath,
          schemaPath: "#/additionalProperties",
          keyword: "additionalProperties",
          params: { additionalProperty: key0 },
          message: "must NOT have additional properties",
        };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
    }
    if (data.intake !== undefined) {
      let data0 = data.intake;
      if (data0 && typeof data0 == "object" && !Array.isArray(data0)) {
        for (const key1 in data0) {
          if (!(key1 === "classification")) {
            const err1 = {
              instancePath: instancePath + "/intake",
              schemaPath: "#/properties/intake/additionalProperties",
              keyword: "additionalProperties",
              params: { additionalProperty: key1 },
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
        if (data0.classification !== undefined) {
          let data1 = data0.classification;
          if (!(data1 === "rubric" || data1 === "owner" || data1 === "model")) {
            const err2 = {
              instancePath: instancePath + "/intake/classification",
              schemaPath: "#/properties/intake/properties/classification/enum",
              keyword: "enum",
              params: {
                allowedValues:
                  schema31.properties.intake.properties.classification.enum,
              },
              message: "must be equal to one of the allowed values",
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
          instancePath: instancePath + "/intake",
          schemaPath: "#/properties/intake/type",
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
    }
    if (data.friction !== undefined) {
      let data2 = data.friction;
      if (data2 && typeof data2 == "object" && !Array.isArray(data2)) {
        for (const key2 in data2) {
          if (!(key2 === "defaultIntensity" || key2 === "choreDowngrade")) {
            const err4 = {
              instancePath: instancePath + "/friction",
              schemaPath: "#/properties/friction/additionalProperties",
              keyword: "additionalProperties",
              params: { additionalProperty: key2 },
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
        if (data2.defaultIntensity !== undefined) {
          let data3 = data2.defaultIntensity;
          if (!(
            data3 === "moderate" ||
            data3 === "minimal" ||
            data3 === "low" ||
            data3 === "high"
          )) {
            const err5 = {
              instancePath: instancePath + "/friction/defaultIntensity",
              schemaPath:
                "#/properties/friction/properties/defaultIntensity/enum",
              keyword: "enum",
              params: {
                allowedValues:
                  schema31.properties.friction.properties.defaultIntensity.enum,
              },
              message: "must be equal to one of the allowed values",
            };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data2.choreDowngrade !== undefined) {
          let data4 = data2.choreDowngrade;
          if (!(data4 === "on" || data4 === "off")) {
            const err6 = {
              instancePath: instancePath + "/friction/choreDowngrade",
              schemaPath:
                "#/properties/friction/properties/choreDowngrade/enum",
              keyword: "enum",
              params: {
                allowedValues:
                  schema31.properties.friction.properties.choreDowngrade.enum,
              },
              message: "must be equal to one of the allowed values",
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
          instancePath: instancePath + "/friction",
          schemaPath: "#/properties/friction/type",
          keyword: "type",
          params: { type: "object" },
          message: "must be object",
        };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.decisions !== undefined) {
      let data5 = data.decisions;
      if (data5 && typeof data5 == "object" && !Array.isArray(data5)) {
        for (const key3 in data5) {
          if (!(
            key3 === "detection" ||
            key3 === "pendingWork" ||
            key3 === "briefFormat" ||
            key3 === "briefThreshold" ||
            key3 === "evaluator"
          )) {
            const err8 = {
              instancePath: instancePath + "/decisions",
              schemaPath: "#/properties/decisions/additionalProperties",
              keyword: "additionalProperties",
              params: { additionalProperty: key3 },
              message: "must NOT have additional properties",
            };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data5.detection !== undefined) {
          let data6 = data5.detection;
          if (!(
            data6 === "floorAndSelfFlag" ||
            data6 === "floorOnly" ||
            data6 === "selfFlagOnly" ||
            data6 === "executionTimeOnly"
          )) {
            const err9 = {
              instancePath: instancePath + "/decisions/detection",
              schemaPath: "#/properties/decisions/properties/detection/enum",
              keyword: "enum",
              params: {
                allowedValues:
                  schema31.properties.decisions.properties.detection.enum,
              },
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
        if (data5.pendingWork !== undefined) {
          let data7 = data5.pendingWork;
          if (!(
            data7 === "provisionalExceptArchitecture" ||
            data7 === "hardStopAll" ||
            data7 === "provisionalAll"
          )) {
            const err10 = {
              instancePath: instancePath + "/decisions/pendingWork",
              schemaPath: "#/properties/decisions/properties/pendingWork/enum",
              keyword: "enum",
              params: {
                allowedValues:
                  schema31.properties.decisions.properties.pendingWork.enum,
              },
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
        if (data5.briefFormat !== undefined) {
          let data8 = data5.briefFormat;
          if (!(
            data8 === "terse" ||
            data8 === "fullMemo" ||
            data8 === "recommendationOnly"
          )) {
            const err11 = {
              instancePath: instancePath + "/decisions/briefFormat",
              schemaPath: "#/properties/decisions/properties/briefFormat/enum",
              keyword: "enum",
              params: {
                allowedValues:
                  schema31.properties.decisions.properties.briefFormat.enum,
              },
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
        if (data5.briefThreshold !== undefined) {
          let data9 = data5.briefThreshold;
          if (!(
            data9 === "runtimeAddOrMajor" ||
            data9 === "everySignal" ||
            data9 === "runtimeAddOnly"
          )) {
            const err12 = {
              instancePath: instancePath + "/decisions/briefThreshold",
              schemaPath:
                "#/properties/decisions/properties/briefThreshold/enum",
              keyword: "enum",
              params: {
                allowedValues:
                  schema31.properties.decisions.properties.briefThreshold.enum,
              },
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
        if (data5.evaluator !== undefined) {
          let data10 = data5.evaluator;
          if (!(
            data10 === "freshContext" || data10 === "generatorSelfReports"
          )) {
            const err13 = {
              instancePath: instancePath + "/decisions/evaluator",
              schemaPath: "#/properties/decisions/properties/evaluator/enum",
              keyword: "enum",
              params: {
                allowedValues:
                  schema31.properties.decisions.properties.evaluator.enum,
              },
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
          instancePath: instancePath + "/decisions",
          schemaPath: "#/properties/decisions/type",
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
    }
    if (data.permissions !== undefined) {
      let data11 = data.permissions;
      if (data11 && typeof data11 == "object" && !Array.isArray(data11)) {
        for (const key4 in data11) {
          if (!(key4 === "policy" || key4 === "untrustedContent")) {
            const err15 = {
              instancePath: instancePath + "/permissions",
              schemaPath: "#/properties/permissions/additionalProperties",
              keyword: "additionalProperties",
              params: { additionalProperty: key4 },
              message: "must NOT have additional properties",
            };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
        if (data11.policy !== undefined) {
          let data12 = data11.policy;
          if (data12 && typeof data12 == "object" && !Array.isArray(data12)) {
          } else {
            const err16 = {
              instancePath: instancePath + "/permissions/policy",
              schemaPath: "#/properties/permissions/properties/policy/type",
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
        }
        if (data11.untrustedContent !== undefined) {
          let data13 = data11.untrustedContent;
          if (data13 && typeof data13 == "object" && !Array.isArray(data13)) {
            for (const key5 in data13) {
              if (!(key5 === "mode" || key5 === "hintBytes")) {
                const err17 = {
                  instancePath: instancePath + "/permissions/untrustedContent",
                  schemaPath:
                    "#/properties/permissions/properties/untrustedContent/additionalProperties",
                  keyword: "additionalProperties",
                  params: { additionalProperty: key5 },
                  message: "must NOT have additional properties",
                };
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
                }
                errors++;
              }
            }
            if (data13.mode !== undefined) {
              let data14 = data13.mode;
              if (!(data14 === "exploreSplit" || data14 === "singleEngine")) {
                const err18 = {
                  instancePath:
                    instancePath + "/permissions/untrustedContent/mode",
                  schemaPath:
                    "#/properties/permissions/properties/untrustedContent/properties/mode/enum",
                  keyword: "enum",
                  params: {
                    allowedValues:
                      schema31.properties.permissions.properties
                        .untrustedContent.properties.mode.enum,
                  },
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
            if (data13.hintBytes !== undefined) {
              let data15 = data13.hintBytes;
              if (!(
                typeof data15 == "number" &&
                !(data15 % 1) &&
                !isNaN(data15) &&
                isFinite(data15)
              )) {
                const err19 = {
                  instancePath:
                    instancePath + "/permissions/untrustedContent/hintBytes",
                  schemaPath:
                    "#/properties/permissions/properties/untrustedContent/properties/hintBytes/type",
                  keyword: "type",
                  params: { type: "integer" },
                  message: "must be integer",
                };
                if (vErrors === null) {
                  vErrors = [err19];
                } else {
                  vErrors.push(err19);
                }
                errors++;
              }
              if (typeof data15 == "number" && isFinite(data15)) {
                if (data15 > 1024 || isNaN(data15)) {
                  const err20 = {
                    instancePath:
                      instancePath + "/permissions/untrustedContent/hintBytes",
                    schemaPath:
                      "#/properties/permissions/properties/untrustedContent/properties/hintBytes/maximum",
                    keyword: "maximum",
                    params: { comparison: "<=", limit: 1024 },
                    message: "must be <= 1024",
                  };
                  if (vErrors === null) {
                    vErrors = [err20];
                  } else {
                    vErrors.push(err20);
                  }
                  errors++;
                }
                if (data15 < 1 || isNaN(data15)) {
                  const err21 = {
                    instancePath:
                      instancePath + "/permissions/untrustedContent/hintBytes",
                    schemaPath:
                      "#/properties/permissions/properties/untrustedContent/properties/hintBytes/minimum",
                    keyword: "minimum",
                    params: { comparison: ">=", limit: 1 },
                    message: "must be >= 1",
                  };
                  if (vErrors === null) {
                    vErrors = [err21];
                  } else {
                    vErrors.push(err21);
                  }
                  errors++;
                }
              }
            }
          } else {
            const err22 = {
              instancePath: instancePath + "/permissions/untrustedContent",
              schemaPath:
                "#/properties/permissions/properties/untrustedContent/type",
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
        }
      } else {
        const err23 = {
          instancePath: instancePath + "/permissions",
          schemaPath: "#/properties/permissions/type",
          keyword: "type",
          params: { type: "object" },
          message: "must be object",
        };
        if (vErrors === null) {
          vErrors = [err23];
        } else {
          vErrors.push(err23);
        }
        errors++;
      }
    }
    if (data.ownerLoop !== undefined) {
      let data16 = data.ownerLoop;
      if (data16 && typeof data16 == "object" && !Array.isArray(data16)) {
        for (const key6 in data16) {
          if (!(
            key6 === "preCommitment" ||
            key6 === "consequences" ||
            key6 === "tutor"
          )) {
            const err24 = {
              instancePath: instancePath + "/ownerLoop",
              schemaPath: "#/properties/ownerLoop/additionalProperties",
              keyword: "additionalProperties",
              params: { additionalProperty: key6 },
              message: "must NOT have additional properties",
            };
            if (vErrors === null) {
              vErrors = [err24];
            } else {
              vErrors.push(err24);
            }
            errors++;
          }
        }
        if (data16.preCommitment !== undefined) {
          let data17 = data16.preCommitment;
          if (!(
            data17 === "everyOwnedDecision" ||
            data17 === "sparringOnly" ||
            data17 === "off"
          )) {
            const err25 = {
              instancePath: instancePath + "/ownerLoop/preCommitment",
              schemaPath:
                "#/properties/ownerLoop/properties/preCommitment/enum",
              keyword: "enum",
              params: {
                allowedValues:
                  schema31.properties.ownerLoop.properties.preCommitment.enum,
              },
              message: "must be equal to one of the allowed values",
            };
            if (vErrors === null) {
              vErrors = [err25];
            } else {
              vErrors.push(err25);
            }
            errors++;
          }
        }
        if (data16.consequences !== undefined) {
          let data18 = data16.consequences;
          if (!(
            data18 === "signalsAndReviews" ||
            data18 === "signalsOnly" ||
            data18 === "reviewsOnly"
          )) {
            const err26 = {
              instancePath: instancePath + "/ownerLoop/consequences",
              schemaPath: "#/properties/ownerLoop/properties/consequences/enum",
              keyword: "enum",
              params: {
                allowedValues:
                  schema31.properties.ownerLoop.properties.consequences.enum,
              },
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
        if (data16.tutor !== undefined) {
          let data19 = data16.tutor;
          if (!(
            data19 === "justInTimeAndConceptMap" ||
            data19 === "justInTimeOnly" ||
            data19 === "withSpacedFollowUps"
          )) {
            const err27 = {
              instancePath: instancePath + "/ownerLoop/tutor",
              schemaPath: "#/properties/ownerLoop/properties/tutor/enum",
              keyword: "enum",
              params: {
                allowedValues:
                  schema31.properties.ownerLoop.properties.tutor.enum,
              },
              message: "must be equal to one of the allowed values",
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
          instancePath: instancePath + "/ownerLoop",
          schemaPath: "#/properties/ownerLoop/type",
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
    }
    if (data.topology !== undefined) {
      let data20 = data.topology;
      if (!(
        data20 === "sessionHarnessOneProcess" ||
        data20 === "allInOneProcess" ||
        data20 === "allSeparate"
      )) {
        const err29 = {
          instancePath: instancePath + "/topology",
          schemaPath: "#/properties/topology/enum",
          keyword: "enum",
          params: { allowedValues: schema31.properties.topology.enum },
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
  } else {
    const err30 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err30];
    } else {
      vErrors.push(err30);
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
