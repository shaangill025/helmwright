import { describe, expect, it } from "vitest";
import {
  FLOOR_RULES_VERSION,
  floorChecked,
  floorFindings,
  type FloorChange,
} from "../../src/index.ts";

// Markers, test calls and focus calls are built by concatenation so this file holds none
// (the floor scans helmwright's own diffs).
const DISABLE = "eslint-" + "disable";
const IGNORE = " " + "ignore";
const NOSEM = "no" + "sem";
const MARKERS = [
  "// " + DISABLE + "-next-line no-console",
  "/* " + DISABLE + " */",
  "/* " + "eslint" + "-enable */",
  "/* " + "eslint" + " no-console: off */",
  "/*" + "eslint" + " no-console:off*/",
  "/*   " + "eslint" + " x */",
  "/*\t" + "eslint" + " x */",
  "// " + DISABLE.toUpperCase() + "-LINE",
  "// @ts-" + "ignore",
  "// @ts-" + "expect-error",
  "// @ts-" + "nocheck",
  "x(); // " + NOSEM + "grep",
  "x(); // " + NOSEM,
  "x(); // " + NOSEM.toUpperCase() + ": rule",
  'k = "x"; // gitleaks' + ":allow",
  "/* c8" + IGNORE + " next */",
  "/* c8\t" + IGNORE.trim() + " next */",
  "/* v8 " + IGNORE + " start */",
  "/* istanbul  " + IGNORE + " next */",
  "/* node:" + "coverage" + IGNORE + " next */",
  "/* node:" + "coverage disable */",
  "// prettier-" + IGNORE.trim(),
];
const D = ".";
const TEST_FORMS = [
  "it" + D + "skip" + '("x", () => {});',
  "describe" + D + "only" + '("x", () => {});',
  "test" + D + "todo" + '("x");',
  "it" + D + "fails" + '("x", () => {});',
  "it" + D + "skipIf" + '(ci)("x", () => {});',
  "it" + D + "runIf" + '(ci)("x", () => {});',
  "it" + D + "skip" + D + 'each([1])("x", () => {});',
  "it" + D + "only" + ' ("x", () => {});',
  "it" + '["' + "skip" + '"]("x", () => {});',
  "it" + "[ '" + "only" + "' ]" + '("x", () => {});',
  "const s = it" + D + "skip" + ";",
  ...[
    "x" + "it",
    "x" + "describe",
    "x" + "test",
    "f" + "it",
    "f" + "describe",
  ].map((call) => call + ' ("x", () => {});'),
];
const PROTECTED = [
  "packages/harness/test/permission/**",
  "evals/**",
  "helmwright.config.json",
];
const REGULAR = "100644";
const ABSENT = "000000";
const bytes = (text: string | Uint8Array | undefined) =>
  typeof text === "string" ? Buffer.from(text) : text;

function change(
  path: string,
  base: string | Uint8Array | undefined,
  candidate: string | Uint8Array | undefined,
  modes: Partial<FloorChange> = {},
): FloorChange {
  return {
    path,
    baseMode: base === undefined ? ABSENT : REGULAR,
    candidateMode: candidate === undefined ? ABSENT : REGULAR,
    base: bytes(base),
    candidate: bytes(candidate),
    ...modes,
  };
}
const rules = (...changes: FloorChange[]) =>
  floorFindings(changes, PROTECTED).map((f) => f.rule);
const details = (...changes: FloorChange[]) =>
  floorFindings(changes, PROTECTED).map((f) => [f.rule, f.detail]);
const lines = (...text: string[]) => text.join("\n") + "\n";

describe("suppression.added", () => {
  it.each([...MARKERS, ...TEST_FORMS])("finds an added %j", (marker) => {
    const findings = floorFindings(
      [change("src/a.test.ts", lines("a", "b"), lines("a", marker, "b"))],
      PROTECTED,
    );
    expect(findings).toEqual([
      expect.objectContaining({
        rule: "suppression.added",
        path: "src/a.test.ts",
        line: 2,
      }),
    ]);
  });

  it.each([
    "const " + NOSEM + "bly = 1;",
    "it" + D + "skipped" + "(1);",
    "pro" + "fit" + '("x");',
    "this" + D + "fit" + '("x");',
  ])("ignores %j", (line) => {
    expect(rules(change("test/a.ts", "", lines(line)))).toEqual([]);
  });

  it("finds a marker in a new file and a second copy of an existing one", () => {
    const m = MARKERS[0] ?? "";
    expect(rules(change("src/new.ts", undefined, lines(m)))).toEqual([
      "suppression.added",
    ]);
    expect(rules(change("src/a.ts", lines(m), lines(m, "x", m)))).toEqual([
      "suppression.added",
    ]);
  });

  it("ignores a removed, moved, reindented or respaced marker line", () => {
    const [m = "", n = ""] = MARKERS;
    expect(rules(change("src/a.ts", lines(m, "x"), lines("x")))).toEqual([]);
    expect(
      rules(change("src/a.ts", lines(m, "x", n), lines("x", n, m))),
    ).toEqual([]);
    const respaced = "    " + m.split(" ").join("\t ") + "\r\n";
    expect(rules(change("src/a.ts", lines(m), respaced))).toEqual([]);
  });

  it("finds test-only forms in test files only", () => {
    const skip = TEST_FORMS[0] ?? "";
    expect(rules(change("src/a.ts", "", lines(skip)))).toEqual([]);
    const tests = `test/a.ts x/__tests__/a.js src/a.spec.ts src/a.test-d.ts
      e2e/a.e2e-spec.ts py/test_a.py go/a_test.go`.split(/\s+/);
    for (const path of tests) {
      expect(rules(change(path, "", lines(skip)))).toEqual([
        "suppression.added",
      ]);
    }
  });
});

describe("config.changed", () => {
  it.each(
    `eslint.config.js src/vitest.config.ts a/b/.eslintrc.json a/.eslintignore
    pkg/tsconfig.build.json TSCONFIG.json vite.config.mjs .prettierrc a/.prettierrc.yaml
    .prettierignore .editorconfig .npmrc x/.pnpmfile.cjs pnpm-workspace.yaml .semgrepignore
    a/.semgrep.yml .gitleaks.toml osv-scanner.toml .grype.yaml x/.gitattributes .gitignore
    deep/.gitignore .github/workflows/ci.yml a/.github/x .husky/pre-commit deep/.githooks/x
    lefthook.yml .pre-commit-config.yaml .node-version a/.yarnrc.yml package.yaml
    zizmor.yml .github/actionlint.yaml .gitleaksignore .gitmodules Dockerfile
    a/Dockerfile.dev .c8rc.json .nycrc jest.config.js babel.config.cjs a/.babelrc
    biome.json biome.jsonc Makefile a/justfile`.split(/\s+/),
  )("finds %j added, changed or deleted", (path) => {
    expect(rules(change(path, undefined, "x"))).toEqual(["config.changed"]);
    expect(rules(change(path, "x", "y"))).toEqual(["config.changed"]);
    expect(rules(change(path, "x", undefined))).toEqual(["config.changed"]);
  });

  it.each(
    `src/a.ts docs/tsconfig.md src/github/x.ts src/eslint.ts my.gitignore.md`.split(
      " ",
    ),
  )("ignores %j", (path) => {
    expect(rules(change(path, "x", "y"))).toEqual([]);
  });
});

describe("package.changed", () => {
  const pkg = (value: object) => JSON.stringify(value, null, 2);
  const base = { name: "a", scripts: { test: "vitest run", lint: "eslint ." } };
  const check = (before: object | undefined, after: string | undefined) =>
    details(change("packages/x/package.json", before && pkg(before), after));

  it("finds a changed script by name", () => {
    const after = { ...base, scripts: { ...base.scripts, test: "exit 0" } };
    expect(check(base, pkg(after))).toEqual([
      ["package.changed", "scripts.test changed"],
    ]);
  });

  it.each(
    `pnpm overrides resolutions devEngines packageManager eslintConfig prettier vitest
    imports exports main types typings typesVersions type workspaces engines c8 nyc
    jest mocha ava lint-staged simple-git-hooks husky`.split(/\s+/),
  )("finds a change to %j", (key) => {
    expect(check(base, pkg({ ...base, [key]: { a: "1" } }))).toEqual([
      ["package.changed", key + " changed"],
    ]);
  });

  it("ignores dependency, order and format changes", () => {
    const deps = { dependencies: { a: "^2.0.0" }, ...base, version: "2.0.0" };
    expect(check(base, pkg(deps))).toEqual([]);
    const reordered = { scripts: { lint: "eslint .", test: "vitest run" } };
    expect(check(base, JSON.stringify({ ...reordered, name: "a" }))).toEqual(
      [],
    );
  });

  it("finds scripts in a new or deleted package.json", () => {
    expect(check(undefined, pkg(base)).length).toBe(2);
    expect(check(base, undefined).length).toBe(2);
    expect(check(undefined, pkg({ name: "a" }))).toEqual([]);
  });

  it.each(["{", "[]", "null", '{"a":1} x'])(
    "finds an unparseable candidate %j",
    (text) => {
      expect(check(base, text)).toEqual([
        ["package.changed", "package.json is not a JSON object"],
      ]);
    },
  );
});

describe("protected.changed (OQ-B3-3)", () => {
  const path = "packages/harness/test/permission/policy.test.ts";
  const two = lines("expect(a).toBe(1);", "assert.ok(b);");

  it.each([
    ["added", undefined, two],
    ["modified", two, lines("expect(a).toBe(2);", "assert.ok(b);")],
    ["deleted", two, undefined],
  ])("finds a protected test %s", (what, before, after) => {
    expect(details(change(path, before, after))).toEqual([
      ["protected.changed", what],
    ]);
  });

  it("finds any protected path, not only tests", () => {
    expect(rules(change("helmwright.config.json", "{}", "{ }"))).toEqual([
      "protected.changed",
    ]);
    expect(rules(change("evals/data.json", "a", "b"))).toEqual([
      "protected.changed",
    ]);
    expect(rules(change("test/a.test.ts", two, ""))).toEqual([]);
  });
});

describe("symlink.added, gitlink.added and encoding.unreadable", () => {
  it("finds a symlink in the candidate, not a removed one", () => {
    const link = { candidateMode: "120000", candidate: undefined };
    expect(rules(change("src/a", undefined, "x", link))).toEqual([
      "symlink.added",
    ]);
    const gone = { baseMode: "120000", base: undefined };
    expect(rules(change("src/a", "x", undefined, gone))).toEqual([]);
  });

  it("finds a gitlink (nested repo) in the candidate", () => {
    const gitlink = { candidateMode: "160000", candidate: undefined };
    expect(rules(change("vendor/x", undefined, "x", gitlink))).toEqual([
      "gitlink.added",
    ]);
  });

  it.each([
    ["a UTF-16 BOM", Uint8Array.of(0xff, 0xfe, 0x61, 0)],
    ["a NUL byte", "a\u0000b"],
    ["invalid UTF-8", Uint8Array.of(0x61, 0xc3, 0x28)],
  ])("finds a candidate with %s", (_, candidate) => {
    expect(rules(change("src/a.ts", "a", candidate))).toEqual([
      "encoding.unreadable",
    ]);
  });

  it("reads a UTF-8 BOM candidate and a binary base", () => {
    expect(rules(change("src/a.ts", "a", "﻿a\n"))).toEqual([]);
    const m = MARKERS[8] ?? "";
    expect(rules(change("src/a.ts", Uint8Array.of(0, 1), lines(m)))).toEqual([
      "suppression.added",
    ]);
  });
});

describe("findings", () => {
  it("sorts findings and escapes paths and details", () => {
    const m = MARKERS[8] ?? "";
    const findings = floorFindings(
      [
        change("b.ts", "", lines(m)),
        change("a\u001b.ts", "", lines("x", m, m)),
        change(".npmrc", "", "x"),
      ],
      PROTECTED,
    );
    expect(findings.map((f) => [f.path, f.line])).toEqual([
      [".npmrc", undefined],
      ["a\\u{1b}.ts", 2],
      ["a\\u{1b}.ts", 3],
      ["b.ts", 1],
    ]);
  });

  it("builds a valid floor.checked, truncated past 256 findings", () => {
    const tree = "c".repeat(40);
    expect(FLOOR_RULES_VERSION).toBe("floor-2");
    expect(floorChecked("a".repeat(40), tree, [])).toEqual({
      kind: "floor.checked",
      rules: FLOOR_RULES_VERSION,
      baseCommit: "a".repeat(40),
      candidateTree: tree,
      verdict: "pass",
      findings: [],
      truncated: false,
    });
    const many = floorFindings(
      [
        change(
          "src/a.ts",
          "",
          lines(...Array<string>(300).fill(MARKERS[8] ?? "")),
        ),
      ],
      PROTECTED,
    );
    const reject = floorChecked("a".repeat(40), tree, many);
    expect([reject.verdict, reject.findings.length, reject.truncated]).toEqual([
      "reject",
      256,
      true,
    ]);
    expect(() => floorChecked("HEAD", tree, [])).toThrow(
      "floor.checked cannot be logged",
    );
  });
});
