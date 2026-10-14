import { describe, expect, it } from "vitest";
import {
  validateFloorEvent as validate,
  type FloorChecked,
  type FloorFinding,
  type FloorSignalled,
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

const signalled: FloorSignalled = {
  kind: "floor.signalled",
  detector: "dependency-1",
  phase: "final",
  baseCommit: "a".repeat(40),
  candidateTree: "b".repeat(64),
  materiality: {
    rubricVersion: "materiality-rubric-1",
    threshold: "runtimeAddOrMajor",
  },
  signals: [
    {
      id: "event-1:0",
      type: "dependency.added",
      path: "app/package.json",
      field: "dependencies",
      name: "@helmwright/fx-duration",
      runtime: true,
      from: null,
      to: "file:vendor/fx-duration",
    },
    {
      id: "event-1:1",
      type: "dependency.majorBump",
      path: "package.json",
      field: "devDependencies",
      name: "a",
      runtime: false,
      from: "^1.0.0",
      to: "latest",
      bump: "unknown",
    },
    { id: "event-1:2", type: "lockfile.only", path: "pnpm-lock.yaml" },
  ],
};
const [add, major, lock] = signalled.signals as [object, object, object];
const withSignal = (signal: object) => ({ ...signalled, signals: [signal] });

describe("floor-event schema floor.signalled", () => {
  it.each([
    ["three signals", signalled],
    ["no signals", { ...signalled, signals: [] }],
    ["an early phase", { ...signalled, phase: "early" }],
    ["256 signals", { ...signalled, signals: Array(256).fill(lock) }],
    ["an empty specifier", withSignal({ ...major, from: "" })],
    ["a major bump", withSignal({ ...major, bump: "major" })],
    ["a dev add", withSignal({ ...add, field: "devDependencies" })],
    ["a long event ID", withSignal({ ...lock, id: "e".repeat(123) + ":255" })],
  ])("accepts %s", (_, event) => {
    expect(validate(JSON.parse(JSON.stringify(event)))).toBe(true);
  });

  it.each([
    ["another detector", { ...signalled, detector: "dependency-2" }],
    ["another phase", { ...signalled, phase: "late" }],
    ["a short commit", { ...signalled, baseCommit: "a".repeat(39) }],
    ["no materiality", without(signalled, "materiality")],
    [
      "another rubric",
      {
        ...signalled,
        materiality: { ...signalled.materiality, rubricVersion: "rubric-1" },
      },
    ],
    [
      "an unknown threshold",
      {
        ...signalled,
        materiality: { ...signalled.materiality, threshold: "never" },
      },
    ],
    [
      "an extra materiality key",
      { ...signalled, materiality: { ...signalled.materiality, x: 1 } },
    ],
    ["257 signals", { ...signalled, signals: Array(257).fill(lock) }],
    ["an extra key", { ...signalled, findings: [] }],
    ["an unknown signal type", withSignal({ ...lock, type: "module.added" })],
    ["an extra signal key", withSignal({ ...lock, name: "a" })],
    ["a signal without an ID", withSignal(without(lock, "id"))],
    ["an ID without an index", withSignal({ ...lock, id: "event-1" })],
    ["an ID with a leading-zero index", withSignal({ ...lock, id: "e:01" })],
    [
      "an event-ID part over 123 code units",
      withSignal({ ...lock, id: "e".repeat(124) + ":255" }),
    ],
    [
      "an ID over 128 code units",
      withSignal({ ...lock, id: "e".repeat(125) + ":255" }),
    ],
    ["a bad candidate tree", { ...signalled, candidateTree: "b".repeat(41) }],
    ["a non-boolean runtime", withSignal({ ...add, runtime: "true" })],
    ["a .. segment in a signal path", withSignal({ ...lock, path: "a/../b" })],
    ["an add without from", withSignal(without(add, "from"))],
    ["an add with a bump", withSignal({ ...add, bump: "major" })],
    ["an add without a target", withSignal(without(add, "to"))],
    ["an add from a specifier", withSignal({ ...add, from: "^1.0.0" })],
    ["a null target", withSignal({ ...add, to: null })],
    ["a bump without a kind", withSignal(without(major, "bump"))],
    ["another bump kind", withSignal({ ...major, bump: "minor" })],
    ["a bump from null", withSignal({ ...major, from: null })],
    ["another field", withSignal({ ...add, field: "bundleDependencies" })],
    ["an empty name", withSignal({ ...add, name: "" })],
    ["a control in a name", withSignal({ ...add, name: "a\u001bb" })],
    ["a newline in a specifier", withSignal({ ...major, to: "1\n2" })],
    ["an absolute path", withSignal({ ...lock, path: "/pnpm-lock.yaml" })],
    ["a lockfile with a field", withSignal({ ...lock, field: "dependencies" })],
  ])("rejects %s", (_, event) => {
    expect(validate(JSON.parse(JSON.stringify(event)))).toBe(false);
  });
});
