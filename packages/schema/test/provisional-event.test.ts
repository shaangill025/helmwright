import { describe, expect, it } from "vitest";
import { validateProvisionalEvent as validate } from "../src/index.ts";

const opened = {
  kind: "provisional.opened",
  decisionId: "decision-floor-1-0",
  class: "technology",
  commit: "a".repeat(40),
  tree: "b".repeat(40),
  baseCommit: "c".repeat(40),
  ref: "refs/helmwright/provisional/decision-floor-1-0",
};
const refused = {
  kind: "provisional.refused",
  decisionId: "decision-floor-1-0",
  reason: "cap",
};
const without = (event: object, key: string) =>
  Object.fromEntries(Object.entries(event).filter(([k]) => k !== key));

describe("provisional-event schema", () => {
  it.each([
    ["opened", opened],
    [
      "opened with SHA-256 IDs",
      {
        ...opened,
        tree: "b".repeat(64),
        commit: "a".repeat(64),
        baseCommit: "c".repeat(64),
      },
    ],
    ["refused", refused],
    [
      "attached",
      {
        kind: "provisional.attached",
        decisionId: "decision-floor-1-0",
        runId: "run-2",
        commit: "a".repeat(40),
      },
    ],
    [
      "resolved",
      {
        kind: "provisional.resolved",
        decisionId: "decision-floor-1-0",
        outcome: "discarded",
        chosenOption: "b",
        resolvedBy: "owner",
      },
    ],
  ])("accepts %s", (_name, event) => {
    expect(validate(event)).toBe(true);
  });

  it.each([
    [
      "a recommendedOption (Q48: no recommendation in the log)",
      { ...opened, recommendedOption: "a" },
    ],
    ["architecture", { ...opened, class: "architecture" }],
    ["a ref under refs/heads", { ...opened, ref: "refs/heads/main" }],
    ["a missing commit", without(opened, "commit")],
    ["an unknown refusal reason", { ...refused, reason: "other" }],
    ["a refusal with an extra field", { ...refused, commit: "a".repeat(40) }],
  ])("rejects %s", (_name, event) => {
    expect(validate(event)).toBe(false);
  });
});
