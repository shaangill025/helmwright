import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { CONFIG_DEFAULTS, type IntakeClass } from "@helmwright/schema";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PERMISSION_POLICY,
  INTAKE_RUBRIC_VERSION,
  IntakeError,
  RING0_PATHS,
  classify,
  overrideDirection,
  resolvePolicy,
  upgradeOnly,
} from "../../src/index.ts";
import { hasControl } from "../../src/permission/normalize.ts";

const NONE = {
  newDependencies: [],
  newModules: [],
  surfaceChanges: [],
  newProcessBoundary: false,
};
/** helmwright's own Ring 0 paths: its config's policy, resolved as the loader does, plus the floor. */
const OWN_RING0 = (() => {
  const url = new URL("../../../../helmwright.config.json", import.meta.url);
  const { permissions } = JSON.parse(readFileSync(url, "utf8")) as {
    permissions: { policy: unknown };
  };
  const own = resolvePolicy(DEFAULT_PERMISSION_POLICY, permissions.policy);
  return [...own.ring0Paths, ...RING0_PATHS];
})();
const input = (scope: string[] | undefined, change: object = {}) => ({
  ...(scope === undefined ? {} : { scope }),
  declared: NONE,
  ring0Paths: OWN_RING0,
  friction: { ...CONFIG_DEFAULTS.friction },
  ...change,
});
/** U+202E RIGHT-TO-LEFT OVERRIDE, built so that the source has no bidi character. */
const RLO = String.fromCodePoint(0x202e);
const sha256 = (text: string) =>
  createHash("sha256").update(text).digest("hex");
const words = (text = "") => text.split(" ").filter((w) => w !== "");

/**
 * The rubric table (intake-rubric-1): `scope | class | rule:entry,entry …`, where `-` is no
 * scope and `[]` an empty one. Reason entries are sorted, as the rubric sorts the scope.
 */
const TABLE = `
- | architectural | noDeclaredScope
[] | architectural | noDeclaredScope
docs/** | chore | docsOnly:docs/**
docs/guide/intro.ts | chore | docsOnly:docs/guide/intro.ts
README.md | chore | docsOnly:README.md
src/**/*.md | chore | docsOnly:src/**/*.md
docs/*.mdx a/b.md | chore | docsOnly:a/b.md,docs/*.mdx
packages/x/test/** | chore | testsOnly:packages/x/test/**
tests/fixtures/package.json | chore | testsOnly:tests/fixtures/package.json
src/__tests__/a.ts | chore | testsOnly:src/__tests__/a.ts
src/a.test.ts src/*.spec.tsx | chore | testsOnly:src/*.spec.tsx,src/a.test.ts
docs/a.md src/a.test.ts | chore | docsOnly:docs/a.md testsOnly:src/a.test.ts
src/a.ts | bounded | notDocsOrTests:src/a.ts
src/** | bounded | notDocsOrTests:src/**
docs | bounded | notDocsOrTests:docs
packages/x/test | bounded | notDocsOrTests:packages/x/test
Docs/a.ts | bounded | notDocsOrTests:Docs/a.ts
README.MD | bounded | notDocsOrTests:README.MD
notes.txt | bounded | notDocsOrTests:notes.txt
src/*md | bounded | notDocsOrTests:src/*md
src/*.md* | bounded | notDocsOrTests:src/*.md*
do*/a.ts | bounded | notDocsOrTests:do*/a.ts
src/*.test | bounded | notDocsOrTests:src/*.test
src/latest/a.ts | bounded | notDocsOrTests:src/latest/a.ts
docs/a.md src/a.ts | bounded | notDocsOrTests:src/a.ts
** | bounded | ring0Path:** notDocsOrTests:**
.github/README.md | bounded | ring0Path:.github/README.md
.GitHub/README.md | bounded | ring0Path:.GitHub/README.md
**/*.md | bounded | ring0Path:**/*.md
**/__tests__/** | bounded | ring0Path:**/__tests__/**
evals/a.test.ts | bounded | ring0Path:evals/a.test.ts
packages/h/evals/** | bounded | ring0Path:packages/h/evals/** notDocsOrTests:packages/h/evals/**
*.json | bounded | ring0Path:*.json notDocsOrTests:*.json
packages/harness/src | bounded | ring0Path:packages/harness/src notDocsOrTests:packages/harness/src
docs/** package.json | bounded | ring0Path:package.json notDocsOrTests:package.json`
  .split("\n")
  .filter((line) => line !== "")
  .map((line) => {
    const [scope = "", cls = "", fired] = line.split(" | ");
    const why = words(fired).map((r) => {
      const [rule = "", entries = ""] = r.split(":");
      return { rule, entries: entries.split(",").filter((e) => e !== "") };
    });
    const list = words(scope).filter((e) => e !== "[]");
    return [scope, scope === "-" ? undefined : list, cls, why] as const;
  });

describe("classify", () => {
  it.each(TABLE)("classifies %s", (_scope, scope, cls, why) => {
    const result = classify(input(scope));
    expect({ class: result.class, reasons: result.reasons }).toEqual({
      class: cls,
      reasons: why,
    });
    expect(result.rubricVersion).toBe(INTAKE_RUBRIC_VERSION);
    expect(INTAKE_RUBRIC_VERSION).toBe("intake-rubric-1");
    expect(result.sparring).toBe("optIn");
  });

  it.each(["**/*.md", "**/*.mdx", "**/*.test.ts", "**/test/**"])(
    "puts %j in a category when no Ring 0 path can overlap it",
    (entry) => {
      const ring0Paths = ["package.json"];
      expect(classify(input([entry], { ring0Paths })).class).toBe("chore");
    },
  );

  it.each<[object, string, string[]]>([
    [{ newDependencies: ["left-pad"] }, "newDependencies", ["left-pad"]],
    [{ newModules: ["packages/intake"] }, "newModules", ["packages/intake"]],
    [
      { surfaceChanges: ["schema", "wire"] },
      "surfaceChanges",
      ["schema", "wire"],
    ],
    [{ newProcessBoundary: true }, "newProcessBoundary", []],
  ])("makes the declared fact %j architectural", (fact, rule, entries) => {
    const declared = { ...NONE, ...fact };
    const result = classify(input(["docs/a.md"], { declared }));
    expect(result.class).toBe("architectural");
    expect(result.reasons).toEqual([{ rule, entries }]);
  });

  it("gives every architectural reason, in rule order", () => {
    const declared = {
      newDependencies: ["b", "a"],
      newModules: ["m"],
      surfaceChanges: ["publicApi", "storage"],
      newProcessBoundary: true,
    };
    expect(classify(input(undefined, { declared })).reasons).toEqual([
      { rule: "noDeclaredScope", entries: [] },
      { rule: "newDependencies", entries: ["b", "a"] },
      { rule: "newModules", entries: ["m"] },
      { rule: "surfaceChanges", entries: ["publicApi", "storage"] },
      { rule: "newProcessBoundary", entries: [] },
    ]);
  });

  it.each<[string, object, string, string]>([
    ["docs/a.md", { choreDowngrade: "on" }, "minimal", "choreDowngrade"],
    [
      "docs/a.md",
      { choreDowngrade: "off", defaultIntensity: "low" },
      "low",
      "default",
    ],
    ["src/a.ts", { defaultIntensity: "high" }, "high", "default"],
    ["-", {}, "moderate", "default"],
  ])(
    "sets the friction for %j under %j",
    (entry, change, intensity, source) => {
      const friction = { ...CONFIG_DEFAULTS.friction, ...change };
      const scope = entry === "-" ? undefined : [entry];
      expect(classify(input(scope, { friction })).friction).toEqual({
        intensity,
        source,
      });
    },
  );

  it("binds the result to the sorted scope, independent of its order", () => {
    const a = classify(input(["src/b.ts", "docs/a.md", "src/a.ts"]));
    expect(classify(input(["src/a.ts", "src/b.ts", "docs/a.md"]))).toEqual(a);
    expect(a.scopeSha256).toBe(
      sha256(JSON.stringify(["docs/a.md", "src/a.ts", "src/b.ts"])),
    );
    expect(classify(input(["src/a.ts"])).scopeSha256).not.toBe(a.scopeSha256);
    expect(classify(input(undefined)).scopeSha256).toBe(sha256("[]"));
    expect(classify(input([])).scopeSha256).toBe(sha256("[]"));
  });

  it("returns a deeply frozen result and leaves the input alone", () => {
    const scope = ["src/b.ts", "src/a.ts"];
    const result = classify(input(scope));
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.reasons[0]?.entries)).toBe(true);
    expect(Object.isFrozen(result.friction)).toBe(true);
    expect(scope).toEqual(["src/b.ts", "src/a.ts"]);
    expect(Object.isFrozen(scope)).toBe(false);
  });

  it.each(
    words(`/etc/passwd a//b docs/ ./docs/a.md docs/../src/x.ts .. docs\\a.md
      docs/a**.md`).concat([
      "",
      "docs/a\nb.md",
      `docs/a${RLO}b.md`,
      `docs/${"a".repeat(1020)}`,
    ]),
  )("rejects the scope entry %j", (entry) => {
    expect(() => classify(input([entry]))).toThrow(IntakeError);
  });

  const declared = (change: object) => ({ declared: { ...NONE, ...change } });
  it.each<unknown>([
    null,
    [],
    { ...input(["a"]), extra: 1 },
    input(undefined, { scope: "src/**" }),
    input(undefined, { scope: null }),
    input(undefined, { scope: [1] }),
    input(Array.from({ length: 257 }, (_, i) => `docs/${String(i)}.md`)),
    { ...input(["a"]), declared: undefined },
    input(["a"], declared({ extra: [] })),
    input(["a"], declared({ newProcessBoundary: undefined })),
    input(["a"], declared({ newDependencies: [1] })),
    input(["a"], declared({ newDependencies: [""] })),
    input(["a"], declared({ newDependencies: ["a\u0000"] })),
    input(["a"], declared({ newModules: "m" })),
    input(["a"], declared({ surfaceChanges: ["ui"] })),
    input(["a"], declared({ newProcessBoundary: "yes" })),
    input(["a"], { ring0Paths: [] }),
    input(["a"], { ring0Paths: [1] }),
    input(["a"], { ring0Paths: [""] }),
    { ...input(["a"]), friction: undefined },
    input(["a"], { friction: { defaultIntensity: "x", choreDowngrade: "on" } }),
    input(["a"], {
      friction: { defaultIntensity: "low", choreDowngrade: "x" },
    }),
    input(["a"], { friction: { ...CONFIG_DEFAULTS.friction, extra: 1 } }),
  ])("rejects the input %j", (value) => {
    expect(() => classify(value)).toThrow(IntakeError);
  });

  it.each([`a${RLO}\u0007`, RLO, "a\u001b[31m"])(
    "escapes the entry %j in its error message",
    (entry) => {
      expect(() => classify(input([entry]))).toThrow(/^intake\.scope\[0\] "/);
      try {
        classify(input([entry]));
      } catch (error) {
        const { message } = error as Error;
        expect(hasControl(message) || message.includes(RLO)).toBe(false);
        if (entry.startsWith("a")) expect(message).toMatch(/^\S+ "a\\u\{/);
      }
    },
  );
});

describe("upgradeOnly and overrideDirection", () => {
  it.each<[IntakeClass, IntakeClass, string]>([
    ["chore", "chore", "same"],
    ["chore", "bounded", "up"],
    ["chore", "architectural", "up"],
    ["bounded", "bounded", "same"],
    ["bounded", "architectural", "up"],
    ["architectural", "architectural", "same"],
    ["bounded", "chore", "down"],
    ["architectural", "chore", "down"],
    ["architectural", "bounded", "down"],
  ])("rates %s to %s as %s and allows it unless down", (from, to, way) => {
    expect(overrideDirection(from, to)).toBe(way);
    if (way === "down") {
      expect(() => upgradeOnly(from, to)).toThrow(IntakeError);
    } else {
      expect(upgradeOnly(from, to)).toBe(to);
    }
  });

  it.each<[IntakeClass, IntakeClass]>([
    ["trivial" as IntakeClass, "chore"],
    ["chore", "trivial" as IntakeClass],
  ])("rejects the unknown class in %s to %s", (from, to) => {
    expect(() => overrideDirection(from, to)).toThrow(IntakeError);
    expect(() => upgradeOnly(from, to)).toThrow(IntakeError);
  });
});
