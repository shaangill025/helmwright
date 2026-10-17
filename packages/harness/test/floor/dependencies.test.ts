import { validateFloorEvent } from "@helmwright/schema";
import { describe, expect, it } from "vitest";
import {
  DEPENDENCY_DETECTOR,
  MAX_SIGNALS,
  dependencySignals,
  detectDependencies,
  type DependencySignal,
} from "../../src/floor/dependencies.ts";
import { FloorError } from "../../src/floor/events.ts";
import type { FloorChange } from "../../src/floor/rules.ts";
import { displayText } from "../../src/permission/policy.ts";

const encoder = new TextEncoder();
const json = (value: object) => JSON.stringify(value, null, 2);

/** A regular-file change; an undefined side is absent. */
function change(
  path: string,
  base: object | string | undefined,
  candidate: object | string | undefined,
): FloorChange {
  const bytes = (side: object | string | undefined) =>
    side === undefined
      ? undefined
      : encoder.encode(typeof side === "string" ? side : json(side));
  return {
    path,
    baseMode: base === undefined ? "000000" : "100644",
    candidateMode: candidate === undefined ? "000000" : "100644",
    base: bytes(base),
    candidate: bytes(candidate),
  };
}

const deps = (from: string, to: string) =>
  dependencySignals(
    { dependencies: { a: from } },
    { dependencies: { a: to } },
    "package.json",
  );
const bump = (from: string, to: string, kind: "major" | "unknown") => [
  {
    type: "dependency.majorBump",
    path: "package.json",
    field: "dependencies",
    name: "a",
    runtime: true,
    from,
    to,
    bump: kind,
  },
];
const added = (
  name: string,
  to: string,
  field = "dependencies",
  path = "package.json",
) => ({
  type: "dependency.added",
  path,
  field,
  name,
  runtime: field !== "devDependencies",
  from: null,
  to,
});

describe("dependencySignals specifiers", () => {
  it.each([
    ["a caret minor", "^1.2.3", "^1.4.0"],
    ["a tilde minor", "~1.2.3", "~1.3.0"],
    ["reordered alternatives", "^1.0.0 || ^2.0.0", "^2.1.0 || ^1.2.0"],
    ["a caret to a tilde", "^1.2.0", "~1.2.0"],
    ["a bounded range's lower bound", ">=1.0.0 <2.0.0", ">=1.5.0 <2.0.0"],
    ["a spaced upper bound", ">=1.0.0 <2.0.0", ">= 1.0.0 < 2.0.0"],
    ["a 0.x patch", "^0.2.0", "^0.2.5"],
    ["a prerelease", "1.2.3-beta.1", "1.2.3"],
    ["an npm alias minor", "npm:b@^1.0.0", "npm:b@^1.1.0"],
    ["operators with a space", ">= 1.0.0", ">=1.5.0"],
    ["a workspace minor", "workspace:^1.0.0", "workspace:^1.2.0"],
    ["the same specifier", "^1.0.0", "^1.0.0"],
    // OQ-AD-11: an operator change inside one major is syntactic, so no signal.
    ["a tilde to a caret", "~1.2.3", "^1.2.3"],
    ["an exact version to a caret", "1.2.3", "^1.2.3"],
    ["a minor x range to a major one", "1.2.x", "1.x"],
    ["an exact version to an x range", "1.2.3", "1.x"],
    ["a tilde to an x range", "~1.2.3", "1.x"],
  ])("gives no signal for %s", (_, from, to) => {
    expect(deps(from, to)).toEqual([]);
  });

  it.each([
    ["a caret major", "^1.2.3", "^2.0.0"],
    ["a downgrade", "^2.0.0", "^1.9.0"],
    ["a tilde major", "~1.2.3", "~2.0.0"],
    ["a new higher alternative", "^1.0.0", "^1.0.0 || ^2.0.0"],
    ["a hyphen range's lower bound", "1.0.0 - 2.0.0", "2.0.0 - 3.0.0"],
    ["a 0.x minor", "^0.2.0", "^0.3.0"],
    ["a 0.0.x patch", "0.0.1", "0.0.2"],
    ["0.x to 1.x", "0.x", "1.x"],
    ["x ranges", "1.x", "2.X"],
    ["comparators", ">=1.0.0 <2.0.0", ">= 2.0.0"],
    ["v and = prefixes", "v1.0.0", "=2.0.0"],
    ["an npm alias", "npm:@scope/b@^1.0.0", "npm:@scope/b@^2.0.0"],
    ["a workspace range", "workspace:^1.0.0", "workspace:^2.0.0"],
  ])("gives a major bump for %s", (_, from, to) => {
    expect(deps(from, to)).toEqual(bump(from, to, "major"));
  });

  it.each([
    ["a file: path change", "file:vendor/a", "file:vendor/b"],
    ["workspace:^ to workspace:*", "workspace:^", "workspace:*"],
    ["tags", "latest", "next"],
    ["a range to a tag", "^1.0.0", "latest"],
    ["a star", "*", "^1.0.0"],
    ["a git URL", "github:o/a#v1", "github:o/a#v2"],
    ["a URL", "https://x.test/a-1.tgz", "https://x.test/a-2.tgz"],
    ["an alias without a range", "npm:b", "npm:b@^1.0.0"],
    ["an upper bound only", "<2.0.0", "<3.0.0"],
    ["an empty specifier", "", "^1.0.0"],
    ["a specifier over 256 code units", "^1.0.0", "^1.0.0".padEnd(257)],
    ["four components", "1.2.3.4", "1.2.3"],
    // OQ-AD-10a: the source changed, whatever the major keys.
    ["an alias retarget", "npm:left-pad@^1.0.0", "npm:evil-pad@^1.0.0"],
    ["a scoped alias retarget", "npm:@s/b@^1.0.0", "npm:@s/c@^1.0.0"],
    ["an alias retarget across a major", "npm:b@^1.0.0", "npm:c@^2.0.0"],
    ["a range to an alias", "^1.0.0", "npm:b@^1.0.0"],
    ["a workspace range to a registry one", "workspace:^1.0.0", "^1.0.0"],
    ["a registry range to a workspace one", "^1.0.0", "workspace:^1.0.0"],
    // OQ-AD-9: an upper bound or open-endedness changed in the same major.
    ["a raised upper bound", ">=1.0.0 <2.0.0", ">=1.0.0 <3.0.0"],
    ["a caret to an open range", "^1.0.0", ">=1.0.0"],
    ["an x range to an open range", "1.x", ">=1"],
    ["an open range bounded", ">= 1.0.0", ">=1.5.0 <2.0.0"],
    ["a hyphen range's upper bound", "1.0.0 - 1.9.0", "1.2.0 - 2.0.0"],
    ["a dropped alternative", "^1.0.0 || ^2.0.0", "^2.1.0"],
    ["an added open alternative", "^1.0.0", "^1.0.0 || >=1.2.0"],
  ])("gives an unknown bump for %s", (_, from, to) => {
    expect(deps(from, to)).toEqual(bump(from, to, "unknown"));
  });

  it("reads a non-string specifier as its JSON text", () => {
    expect(
      dependencySignals(
        { dependencies: { a: { v: 1 } } },
        { dependencies: { a: { v: 2 } } },
        "package.json",
      ),
    ).toEqual(bump('{"v":1}', '{"v":2}', "unknown"));
  });
});

describe("dependencySignals fields", () => {
  it("adds every kind of specifier, runtime or dev", () => {
    const after = {
      dependencies: { fx: "file:vendor/fx-duration", w: "workspace:*" },
      optionalDependencies: { o: "^1.0.0" },
      peerDependencies: { p: "jsr:@x/p" },
      devDependencies: { d: "catalog:" },
    };
    expect(dependencySignals({}, after, "package.json")).toEqual([
      added("d", "catalog:", "devDependencies"),
      added("fx", "file:vendor/fx-duration"),
      added("o", "^1.0.0", "optionalDependencies"),
      added("p", "jsr:@x/p", "peerDependencies"),
      added("w", "workspace:*"),
    ]);
  });

  it("counts a move from dev to runtime as an add", () => {
    const before = { devDependencies: { a: "^1.0.0" } };
    const after = { dependencies: { a: "^1.0.0" } };
    expect(dependencySignals(before, after, "package.json")).toEqual([
      added("a", "^1.0.0"),
    ]);
  });

  it("compares a move between runtime fields with the base field (OQ-AD-10b)", () => {
    const before = { dependencies: { a: "^1.0.0", b: "^1.0.0", c: "^1.0.0" } };
    const after = {
      peerDependencies: { a: "^2.0.0", b: "^1.5.0" },
      optionalDependencies: { c: "npm:d@^1.0.0" },
    };
    expect(dependencySignals(before, after, "package.json")).toEqual([
      { ...bump("^1.0.0", "^2.0.0", "major")[0], field: "peerDependencies" },
      {
        ...bump("^1.0.0", "npm:d@^1.0.0", "unknown")[0],
        field: "optionalDependencies",
        name: "c",
      },
    ]);
  });

  it("compares a move with the same field only, if it held the name", () => {
    const before = {
      dependencies: { a: "^1.0.0", b: "^1.0.0" },
      peerDependencies: { a: "^2.0.0", b: "^2.0.0" },
    };
    const after = {
      peerDependencies: { a: "^2.1.0" },
      optionalDependencies: { b: "^2.0.0" },
    };
    expect(dependencySignals(before, after, "package.json")).toEqual([
      {
        ...bump("^1.0.0", "^2.0.0", "major")[0],
        field: "optionalDependencies",
        name: "b",
      },
    ]);
  });

  it("compares a move from runtime to dev with the base field (OQ-AD-12)", () => {
    const before = { dependencies: { a: "^1.0.0", b: "^1.0.0" } };
    const after = { devDependencies: { a: "^2.0.0", b: "^1.5.0" } };
    expect(dependencySignals(before, after, "package.json")).toEqual([
      {
        ...bump("^1.0.0", "^2.0.0", "major")[0],
        field: "devDependencies",
        runtime: false,
      },
    ]);
  });

  it("compares a move with every base runtime field that held the name", () => {
    const before = {
      dependencies: { a: "^1.0.0", b: "^1.0.0", c: "^2.0.0" },
      peerDependencies: { a: "^2.0.0", b: "^2.0.0", c: "^1.0.0" },
    };
    const after = {
      optionalDependencies: { a: "^1.0.0", c: "^2.0.0" },
      devDependencies: { b: "^1.0.0" },
    };
    expect(dependencySignals(before, after, "package.json")).toEqual([
      {
        ...bump("^2.0.0", "^1.0.0", "major")[0],
        field: "optionalDependencies",
      },
      {
        ...bump("^2.0.0", "^1.0.0", "major")[0],
        field: "devDependencies",
        name: "b",
        runtime: false,
      },
      {
        ...bump("^1.0.0", "^2.0.0", "major")[0],
        field: "optionalDependencies",
        name: "c",
      },
    ]);
  });

  it("breaks a tie between bumping base fields by field order", () => {
    const candidate = { optionalDependencies: { a: "^2.0.0" } };
    expect(
      dependencySignals(
        { dependencies: { a: "^1.0.0" }, peerDependencies: { a: "latest" } },
        candidate,
        "package.json",
      ),
    ).toEqual([
      {
        ...bump("^1.0.0", "^2.0.0", "major")[0],
        field: "optionalDependencies",
      },
    ]);
    expect(
      dependencySignals(
        { dependencies: { a: "latest" }, peerDependencies: { a: "^1.0.0" } },
        candidate,
        "package.json",
      ),
    ).toEqual([
      {
        ...bump("latest", "^2.0.0", "unknown")[0],
        field: "optionalDependencies",
      },
    ]);
  });

  it("compares a new dev entry with an unchanged runtime entry", () => {
    const before = { dependencies: { a: "^1.0.0" } };
    const after = {
      dependencies: { a: "^1.0.0" },
      devDependencies: { a: "^2.0.0" },
    };
    expect(dependencySignals(before, after, "package.json")).toEqual([
      {
        ...bump("^1.0.0", "^2.0.0", "major")[0],
        field: "devDependencies",
        runtime: false,
      },
    ]);
  });

  it("keeps a runtime add over a dev major bump of the same name", () => {
    const before = { devDependencies: { a: "^1.0.0" } };
    const after = {
      dependencies: { a: "^2.0.0" },
      devDependencies: { a: "^2.0.0" },
    };
    expect(dependencySignals(before, after, "package.json")).toEqual([
      added("a", "^2.0.0"),
    ]);
  });

  it("throws for a signal of an empty name, which cannot be logged", () => {
    const after = { dependencies: { "": "^1.0.0" } };
    expect(() => dependencySignals({}, after, "package.json")).toThrow(
      new FloorError("a dependency name is empty"),
    );
    expect(dependencySignals(after, after, "package.json")).toEqual([]);
  });

  it("gives no signal for a move from runtime to dev or a removal", () => {
    const before = { dependencies: { a: "^1.0.0", b: "^1.0.0" } };
    const after = { devDependencies: { a: "^1.0.0" } };
    expect(dependencySignals(before, after, "package.json")).toEqual([]);
  });

  it("keeps the most material signal of a name across fields", () => {
    const after = {
      devDependencies: { a: "^1.0.0", b: "^2.0.0" },
      peerDependencies: { a: "^1.0.0", b: "^2.0.0" },
      dependencies: { a: "^1.0.0" },
    };
    const before = {
      devDependencies: { b: "^1.0.0" },
      peerDependencies: { b: "^1.0.0" },
    };
    expect(dependencySignals(before, after, "package.json")).toEqual([
      added("a", "^1.0.0"),
      {
        ...bump("^1.0.0", "^2.0.0", "major")[0],
        field: "peerDependencies",
        name: "b",
      },
    ]);
  });

  it("gives a dev major bump with runtime false", () => {
    const before = { devDependencies: { a: "^1.0.0" } };
    const after = { devDependencies: { a: "^2.0.0" } };
    expect(dependencySignals(before, after, "package.json")).toEqual([
      {
        ...bump("^1.0.0", "^2.0.0", "major")[0],
        field: "devDependencies",
        runtime: false,
      },
    ]);
  });

  it("ignores fields that are not dependency fields", () => {
    const after = {
      bundleDependencies: ["a"],
      peerDependenciesMeta: { b: { optional: true } },
      overrides: { c: "^1.0.0" },
      resolutions: { d: "^1.0.0" },
    };
    expect(dependencySignals({}, after, "package.json")).toEqual([]);
  });

  describe("a dependency field that is not an object (L8)", () => {
    const odd: readonly [string, unknown][] = [
      ["a string", "a"],
      ["an array", ["left-pad"]],
      ["a number", 1],
      ["null", null],
    ];
    const fields = ["dependencies", "devDependencies"] as const;
    const cases = fields.flatMap((field) =>
      odd.map(([kind, value]) => [field, kind, value] as const),
    );

    it.each(cases)("throws for %s changed to %s", (field, _, value) => {
      const before = { [field]: { a: "^1.0.0" } };
      expect(() =>
        dependencySignals(before, { [field]: value }, "package.json"),
      ).toThrow(new FloorError("a dependency field is not an object"));
    });

    it.each(cases)("gives no signal for %s left as %s", (field, _, value) => {
      const manifest = { [field]: value };
      expect(dependencySignals(manifest, manifest, "package.json")).toEqual([]);
    });

    it.each(fields)("throws for a new manifest whose %s is a string", (f) => {
      const changes = [change("package.json", undefined, { [f]: "a" })];
      expect(() => detectDependencies(changes)).toThrow(
        new FloorError("a dependency field is not an object"),
      );
    });

    it("keeps an absent or empty field and an unchanged odd one", () => {
      const lock = change("pnpm-lock.yaml", "a", "b");
      const manifest = { dependencies: "a", devDependencies: {} };
      expect(
        detectDependencies([change("package.json", manifest, manifest), lock]),
      ).toEqual([{ type: "lockfile.only", path: "pnpm-lock.yaml" }]);
      expect(dependencySignals({}, { dependencies: {} }, "x")).toEqual([]);
    });

    it("lets a field with no base become null, keeping a lockfile signal", () => {
      const lock = change("pnpm-lock.yaml", "a", "b");
      expect(dependencySignals({}, { dependencies: null }, "x")).toEqual([]);
      expect(
        detectDependencies([
          change("package.json", {}, { dependencies: null }),
          lock,
        ]),
      ).toEqual([{ type: "lockfile.only", path: "pnpm-lock.yaml" }]);
    });

    it("signals a string field turned into an object as adds", () => {
      const lock = change("pnpm-lock.yaml", "a", "b");
      const before = { dependencies: "a" };
      const after = { dependencies: { a: "^1.0.0" } };
      expect(
        detectDependencies([change("package.json", before, after), lock]),
      ).toEqual([added("a", "^1.0.0")]);
    });
  });

  it("reads own keys only, __proto__ included", () => {
    const text = '{"dependencies": {"__proto__": "^1.0.0", "toString": "1"}}';
    const after = JSON.parse(text) as object;
    expect(dependencySignals({}, after, "package.json")).toEqual([
      added("__proto__", "^1.0.0"),
      added("toString", "1"),
    ]);
  });

  it("escapes names, specifiers and paths for display", () => {
    const after = { dependencies: { "a\u001b": "^1‮" } };
    expect(dependencySignals({}, after, "x\u0007/package.json")).toEqual([
      added(
        displayText("a\u001b"),
        displayText("^1‮"),
        "dependencies",
        displayText("x\u0007/package.json"),
      ),
    ]);
  });

  it(`throws past ${String(MAX_SIGNALS)} signals`, () => {
    const many = (n: number) => ({
      dependencies: Object.fromEntries(
        Array.from({ length: n }, (_, i) => ["d" + String(i), "1.0.0"]),
      ),
    });
    expect(dependencySignals({}, many(256), "package.json")).toHaveLength(256);
    expect(() => dependencySignals({}, many(257), "package.json")).toThrow(
      FloorError,
    );
  });
});

describe("detectDependencies", () => {
  const pkg = { name: "fx", dependencies: { a: "^1.0.0" } };

  it("reads manifests at any depth and skips node_modules", () => {
    const after = { ...pkg, dependencies: { a: "^1.0.0", b: "^1.0.0" } };
    expect(
      detectDependencies([
        change("app/package.json", pkg, after),
        change("node_modules/x/package.json", undefined, after),
        change("app/node_modules/y/package.json", pkg, after),
        change("app/node_modules/y/yarn.lock", undefined, "x"),
        change("app/package.json.bak", pkg, after),
      ]),
    ).toEqual([added("b", "^1.0.0", "dependencies", "app/package.json")]);
  });

  it("adds every dependency of a new manifest", () => {
    const after = { devDependencies: { d: "^1.0.0" }, ...pkg };
    expect(
      detectDependencies([change("package.json", undefined, after)]),
    ).toEqual([added("a", "^1.0.0"), added("d", "^1.0.0", "devDependencies")]);
  });

  it("gives no signal for a deleted, unreadable or non-object manifest", () => {
    const binary = { ...change("b/package.json", pkg, undefined) };
    expect(
      detectDependencies([
        change("a/package.json", pkg, undefined),
        { ...binary, candidateMode: "100644", candidate: Uint8Array.of(0) },
        change("c/package.json", pkg, "[]"),
        change("d/package.json", undefined, "{"),
      ]),
    ).toEqual([]);
  });

  it("reads an unreadable base as an empty manifest", () => {
    const base = {
      ...change("package.json", pkg, pkg),
      base: Uint8Array.of(0),
    };
    expect(detectDependencies([base])).toEqual([added("a", "^1.0.0")]);
  });

  it("sorts by path, name and type whatever the input order", () => {
    const after = { dependencies: { b: "1.0.0", a: "1.0.0" } };
    const changes = [
      change("z/package.json", undefined, after),
      change("package.json", undefined, after),
      change("m/package.json", undefined, after),
    ];
    const signals = detectDependencies(changes);
    expect(signals.map((s) => [s.path, "name" in s ? s.name : ""])).toEqual([
      ["m/package.json", "a"],
      ["m/package.json", "b"],
      ["package.json", "a"],
      ["package.json", "b"],
      ["z/package.json", "a"],
      ["z/package.json", "b"],
    ]);
    expect(detectDependencies([...changes].reverse())).toEqual(signals);
  });

  it(`throws past ${String(MAX_SIGNALS)} manifests or signals`, () => {
    const manifests = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        change(String(i) + "/package.json", undefined, { name: "x" }),
      );
    expect(detectDependencies(manifests(256))).toEqual([]);
    expect(() => detectDependencies(manifests(257))).toThrow(FloorError);
    const one = (i: number) =>
      change(String(i) + "/package.json", undefined, {
        dependencies: Object.fromEntries(
          Array.from({ length: 129 }, (_, j) => ["d" + String(j), "1.0.0"]),
        ),
      });
    expect(() => detectDependencies([one(1), one(2)])).toThrow(FloorError);
  });

  it("reads a deleted manifest as a removal, a non-object one as no change", () => {
    const lock = change("pnpm-lock.yaml", "a", "b");
    expect(
      detectDependencies([change("package.json", pkg, undefined), lock]),
    ).toEqual([]);
    expect(
      detectDependencies([change("package.json", pkg, "[]"), lock]),
    ).toEqual([{ type: "lockfile.only", path: "pnpm-lock.yaml" }]);
  });

  describe("lockfile.only", () => {
    const lockfiles =
      `pnpm-lock.yaml package-lock.json npm-shrinkwrap.json yarn.lock
      bun.lock bun.lockb app/pnpm-lock.yaml`.split(/\s+/);

    it.each(lockfiles)("finds a change to %j alone", (path) => {
      expect(detectDependencies([change(path, "a", "b")])).toEqual([
        { type: "lockfile.only", path },
      ]);
    });

    it("lists each changed lockfile, a deleted one too", () => {
      expect(
        detectDependencies([
          change("yarn.lock", "a", undefined),
          change("pnpm-lock.yaml", undefined, "b"),
          change("pnpm-lock.yml", "a", "b"),
        ]),
      ).toEqual([
        { type: "lockfile.only", path: "pnpm-lock.yaml" },
        { type: "lockfile.only", path: "yarn.lock" },
      ]);
    });

    it("keeps it beside a manifest change outside the dependency fields", () => {
      const after = { ...pkg, scripts: { test: "vitest" }, version: "2.0.0" };
      expect(
        detectDependencies([
          change("package.json", pkg, after),
          change("pnpm-lock.yaml", "a", "b"),
        ]),
      ).toEqual([{ type: "lockfile.only", path: "pnpm-lock.yaml" }]);
    });

    it.each([
      ["a minor bump", { dependencies: { a: "^1.1.0" } }],
      ["a removal", { dependencies: {} }],
      ["a dev add", { ...pkg, devDependencies: { d: "1.0.0" } }],
    ])("is suppressed by %s in any manifest", (_, after) => {
      const signals = detectDependencies([
        change("app/package.json", pkg, { name: "fx", ...after }),
        change("pnpm-lock.yaml", "a", "b"),
      ]);
      expect(signals.filter((s) => s.type === "lockfile.only")).toEqual([]);
    });
  });

  it("gives signals a floor.signalled event accepts", () => {
    const after = { dependencies: { a: "^2.0.0", b: "file:b" } };
    const signals: readonly DependencySignal[] = detectDependencies([
      change("package.json", pkg, after),
      change("pnpm-lock.yaml", "a", undefined),
    ]);
    expect(signals).toHaveLength(2);
    const event = {
      kind: "floor.signalled",
      detector: DEPENDENCY_DETECTOR,
      phase: "final",
      baseCommit: "a".repeat(40),
      candidateTree: "b".repeat(40),
      materiality: {
        rubricVersion: "materiality-rubric-2",
        threshold: "runtimeAddOrMajor",
      },
      signals: signals.map((s, i) => ({ id: "e1:" + String(i), ...s })),
    };
    expect(validateFloorEvent(event)).toBe(true);
  });
});
