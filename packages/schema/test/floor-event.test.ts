import { describe, expect, it } from "vitest";
import {
  validateFloorEvent as validate,
  type FloorChecked,
  type FloorFinding,
} from "../src/index.ts";

const finding: FloorFinding = {
  rule: "suppression.added",
  path: "src/a.ts",
  line: 3,
  detail: "an added marker",
};
const checked: FloorChecked = {
  kind: "floor.checked",
  rules: "floor-1",
  baseCommit: "a".repeat(40),
  candidateTree: "b".repeat(64),
  verdict: "reject",
  findings: [finding],
  truncated: false,
};
const pass: FloorChecked = { ...checked, verdict: "pass", findings: [] };
const withFinding = (change: object) => ({
  ...checked,
  findings: [{ ...finding, ...change }],
});
const without = (event: object, key: string) =>
  Object.fromEntries(Object.entries(event).filter(([k]) => k !== key));

describe("floor-event schema", () => {
  it.each([
    ["a reject", checked],
    ["a pass", pass],
    ["256 findings", { ...checked, findings: Array(256).fill(finding) }],
    [
      "a whole-change limit without a path",
      withFinding({ rule: "floor.limits", path: undefined }),
    ],
    ["an escaped path", withFinding({ path: "src/a\\\\b\\u{1b}.ts" })],
    ["rule protected.changed", withFinding({ rule: "protected.changed" })],
    ["rule gitlink.added", withFinding({ rule: "gitlink.added" })],
    ["rule encoding.unreadable", withFinding({ rule: "encoding.unreadable" })],
    ["a floor-2 check", { ...checked, rules: "floor-2" }],
  ])("accepts %s", (_, event) => {
    expect(validate(JSON.parse(JSON.stringify(event)))).toBe(true);
  });

  it.each([
    ["an unknown kind", { ...checked, kind: "floor.done" }],
    ["another rules version", { ...checked, rules: "floor-0" }],
    ["a short commit", { ...checked, baseCommit: "a".repeat(39) }],
    ["an uppercase tree", { ...checked, candidateTree: "B".repeat(40) }],
    ["another verdict", { ...checked, verdict: "warn" }],
    ["257 findings", { ...checked, findings: Array(257).fill(finding) }],
    ["no truncated flag", without(checked, "truncated")],
    ["an extra key", { ...checked, extra: 1 }],
    ["an unknown rule", withFinding({ rule: "dependency.added" })],
    ["a rule finding without a path", withFinding({ path: undefined })],
    ["line 0", withFinding({ line: 0 })],
    ["a fractional line", withFinding({ line: 1.5 })],
    ["an empty detail", withFinding({ detail: "" })],
    ["a control in detail", withFinding({ detail: "a\u001bb" })],
    ["a newline in detail", withFinding({ detail: "a\nb" })],
    ["a bidi control in a path", withFinding({ path: "src/a‮.ts" })],
    ["an absolute path", withFinding({ path: "/etc/passwd" })],
    ["a .. segment", withFinding({ path: "src/../a.ts" })],
    ["an empty segment", withFinding({ path: "src//a.ts" })],
    ["an extra finding key", withFinding({ fix: "x" })],
    ["a pass with a finding", { ...checked, verdict: "pass" }],
    ["a truncated pass", { ...pass, truncated: true }],
    ["a reject without findings", { ...pass, verdict: "reject" }],
  ])("rejects %s", (_, event) => {
    expect(validate(JSON.parse(JSON.stringify(event)))).toBe(false);
  });
});
