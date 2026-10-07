import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validatePermissionPolicy,
  type PermissionPolicy,
} from "@helmwright/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ALWAYS_ASK_ACTIONS,
  DEFAULT_PERMISSION_POLICY as BASE,
  PERMISSION_ONLY_ACTIONS,
  RING0_PATHS,
  evaluate,
  isRing0Path,
  resolvePolicy,
} from "../../src/index.ts";

let worktree: string;
beforeAll(() => {
  worktree = join(mkdtempSync(join(tmpdir(), "helmwright-policy-")), "wt");
  mkdirSync(join(worktree, "src", "gh", "workflows"), { recursive: true });
  for (const file of ["a.ts", "pkg.json"]) {
    writeFileSync(join(worktree, "src", file), "");
  }
  symlinkSync("tsconfig.base.json", join(worktree, "to-ring0"));
  // B1: Ring 0 names that are links to ordinary paths (one dangling), and a linked file.
  symlinkSync("src/pkg.json", join(worktree, "package.json"));
  symlinkSync("src/missing.js", join(worktree, "eslint.config.js"));
  symlinkSync("src/gh", join(worktree, ".github"));
  symlinkSync("a.ts", join(worktree, "src", "link.ts"));
  // A link outside the worktree that leads into it.
  symlinkSync("wt", join(worktree, "..", "alias"));
  symlinkSync("src/esc\u001b[2Kname.ts", join(worktree, "to-esc"));
});
afterAll(() => {
  rmSync(join(worktree, ".."), { recursive: true, force: true });
});

const branch = "helmwright/run/run_01";
const p = (path: string) => ({ path });
const x = (...argv: string[]) => ({ argv });
const to = (destination: string, ref = branch) => ({ destination, ref });
const set = (setting: string, value: unknown = 1) => ({ setting, value });
const commit = (ref: string, ...paths: string[]) => ({ ref, paths });
// Policies are unknown on purpose: evaluate re-validates the policy it is given.
const verdict = (action: string, input: unknown, policy: unknown = BASE) => {
  const request = { action, input, worktree, runId: "run_01" };
  const { tier, ruleId } = evaluate(policy as PermissionPolicy, request);
  return { tier, ruleId };
};
const R0_PATH = "always-ask.ring0-path";
const R0_SETTING = "always-ask.ring0-setting";
const EGRESS = ["push", "pr.open", "pr.merge", "comment", "publish", "deploy"];

/** One request per member of the always-ask floor (Q51, owner decisions 2026-10-06). */
const alwaysAsked: [string, unknown][] = [
  ["push", to("origin")],
  ["pr.open", to("origin")],
  ["pr.merge", to("origin")],
  ["comment", { destination: "github.com", body: "done\n" }],
  ["publish", { destination: "registry.npmjs.org" }],
  ["deploy", { destination: "production" }],
  ["spend.raiseCap", { capUsd: 50 }],
  ["config.set", set("permissions.governance", "policy")],
  ["config.set", set("permissions")],
  ["config.set", set("permissions.rules", [])],
  ["config.set", set("permissions.alwaysAsk", [])],
  ["config.set", set("permissions.ring0Paths", [])],
  ["fs.edit", p("helmwright.config.json")],
  ["fs.edit", p(".npmrc")],
  ["fs.edit", p(".pnpmfile.cjs")],
  ["commit", commit(branch, "package.json")],
  ["commit", commit(branch, "eslint.config.js")],
  ["commit", commit(branch, "src/link.ts")],
  ["commit", commit(branch, ".github")],
  ["fs.edit", p("package.json")],
  ["fs.delete", p("/workspace/package.json")],
  ["fs.delete", p("../outside.txt")],
  ["fs.delete", p(".git/config")],
  ["fs.edit", p(".GitHub/workflows/ci.yml")],
  ["fs.edit", p("./tsconfig.json")],
  ["fs.delete", p("/workspace/packages/harness/src/permission/policy.ts")],
  ["commit", commit(branch, "src/a.ts", "eslint.config.js")],
];

describe("evaluate with the default policy", () => {
  it("is valid (rule IDs match the schema, none uses the always-ask. prefix)", () => {
    expect(validatePermissionPolicy(BASE)).toBe(true);
    for (const { id } of BASE.rules) expect(id).not.toMatch(/^always-ask\./);
    expect(PERMISSION_ONLY_ACTIONS).not.toContain("execute");
    expect(PERMISSION_ONLY_ACTIONS).toEqual(
      expect.arrayContaining([...ALWAYS_ASK_ACTIONS, "fs.edit", "deps.add"]),
    );
  });

  it.each([
    ["execute", x("pnpm", "test"), "allow", "execute.worktree"],
    ["execute", x("env", "FOO=1", "pnpm", "add", "x"), "ask", "deps.add"],
    ["execute", x("sh", "-c", "npm i x"), "ask", "deps.add"],
    ["deps.add", { packages: ["left-pad"] }, "ask", "deps.add"],
    ["fs.read", p("src/a.ts"), "allow", "fs.read.worktree"],
    ["fs.read", p(".github/workflows/ci.yml"), "allow", "fs.read.worktree"],
    ["fs.edit", p("/workspace/src/a.ts"), "allow", "fs.edit.worktree"],
    ["fs.delete", p("src/a.ts"), "allow", "fs.delete.worktree"],
    ["fs.read", p("../outside.txt"), "ask", "fs.read.outside"],
    ["fs.edit", p(".git/hooks/pre-commit"), "ask", "fs.edit.outside"],
    ["fs.edit", p("src/../../x"), "ask", "fs.edit.outside"],
    ["commit", commit(branch, "src/a.ts"), "allow", "commit.run-branch"],
    ["commit", commit("main", "src/a.ts"), "ask", "default.ask"],
    // Paths that cannot be checked file by file count as Ring 0.
    ["commit", commit(branch, "."), "alwaysAsk", "always-ask.ring0-path"],
    ["commit", commit(branch, "src"), "alwaysAsk", "always-ask.ring0-path"],
    ["commit", commit(branch, "../x"), "alwaysAsk", "always-ask.ring0-path"],
    ["config.set", set("friction.defaultIntensity"), "ask", "default.ask"],
    ["deploy", { destination: "prod" }, "alwaysAsk", "always-ask.deploy"],
    ["fs.delete", p("../x"), "alwaysAsk", "always-ask.delete-outside"],
    ["fs.edit", p(".GitHub/workflows/ci.yml"), "alwaysAsk", R0_PATH],
    ["fs.edit", p("to-ring0"), "alwaysAsk", R0_PATH],
    ["fs.read", p("to-ring0"), "allow", "fs.read.worktree"],
    // B1: a Ring 0 name that is a link (even dangling), or any link, is Ring 0 for writes.
    ["commit", commit(branch, "package.json"), "alwaysAsk", R0_PATH],
    ["commit", commit(branch, "eslint.config.js"), "alwaysAsk", R0_PATH],
    ["commit", commit(branch, "src/link.ts"), "alwaysAsk", R0_PATH],
    ["commit", commit(branch, ".github"), "alwaysAsk", R0_PATH],
    ["fs.edit", p("package.json"), "alwaysAsk", R0_PATH],
    ["fs.delete", p("package.json"), "alwaysAsk", R0_PATH],
    ["fs.edit", p("../alias/package.json"), "alwaysAsk", R0_PATH],
    ["fs.read", p("package.json"), "allow", "fs.read.worktree"],
    ["config.set", set("permissions.rules"), "alwaysAsk", R0_SETTING],
    ["fs.edit", p(".npmrc"), "alwaysAsk", R0_PATH],
    ["config.set", set("security.sensorSet"), "alwaysAsk", R0_SETTING],
    // The worktree root itself: not inside it, and not a Ring 0 path.
    ["fs.read", p("."), "ask", "fs.read.outside"],
    ["fs.edit", p("/workspace"), "ask", "fs.edit.outside"],
    ["fs.delete", p("/workspace/"), "alwaysAsk", "always-ask.delete-outside"],
  ])("%s %j → %s (%s)", (action, input, tier, ruleId) => {
    expect(verdict(action, input)).toEqual({ tier, ruleId });
  });

  it("returns the normalized target", () => {
    const request = { action: "fs.edit", input: p("/workspace/./src/a.ts") };
    const { target } = evaluate(BASE, { ...request, worktree, runId: "r" });
    expect(target?.kind).toBe("path");
    expect(target?.value).toMatch(/\/wt\/src\/a\.ts$/);
  });

  it.each([
    ["shell", x("ls")],
    ["__proto__", {}],
    ["toString", {}],
    ["execute", { argv: [] }],
    ["execute", { argv: "ls" }],
    ["execute", x("ls", "")],
    ["execute", { argv: ["ls"], cwd: "/" }],
    ["execute", null],
    ["fs.edit", p("a\0b")],
    ["fs.edit", p("src/\u001b[2J")],
    ["fs.read", { path: 1 }],
    ["deploy", "production"],
    ["deploy", {}],
    ["config.set", { setting: "permissions.governance" }],
    ["config.set", set("Bad Name")],
    ["spend.raiseCap", { capUsd: -1 }],
    ["spend.raiseCap", { capUsd: Number.POSITIVE_INFINITY }],
    ["commit", commit(branch)],
  ])("denies the unknown action or invalid input %s %j", (action, input) => {
    expect(verdict(action, input).tier).toBe("deny");
  });

  it("denies, without throwing, a path that resolves to a control character", () => {
    const request = { action: "fs.edit", input: p("to-esc"), runId: "run_01" };
    expect(evaluate(BASE, { ...request, worktree })).toEqual({
      tier: "deny",
      ruleId: "schema.invalid-input",
      reason:
        "fs.edit path rejected: resolved path has control or invisible characters",
    });
  });

  it("denies a non-string action without throwing", () => {
    const action = Symbol("deploy") as unknown as string;
    expect(verdict(action, {}).tier).toBe("deny");
  });

  it("denies everything under an invalid policy or a missing worktree", () => {
    const policy = { ...BASE, governance: "autonomous" };
    expect(verdict("fs.read", p("src/a.ts"), policy)).toEqual({
      tier: "deny",
      ruleId: "policy.invalid",
    });
    const request = { action: "fs.read", input: p("a"), runId: "r" };
    const missing = join(worktree, "missing");
    expect(evaluate(BASE, { ...request, worktree: missing })).toEqual({
      tier: "deny",
      ruleId: "schema.invalid-input",
      reason: "fs.read path rejected: ENOENT",
    });
  });

  it.each([
    ["execute", x("ls")],
    ["fs.read", p("src/a.ts")],
    ["fs.edit", p("src/a.ts")],
    ["fs.delete", p("src/a.ts")],
    ["commit", commit(branch, "src/a.ts")],
    ["deps.add", { packages: ["x"] }],
    ["config.set", set("friction.defaultIntensity")],
  ])("asks when no rule matches %s %j", (action, input) => {
    expect(verdict(action, input, { ...BASE, rules: [] })).toEqual({
      tier: "ask",
      ruleId: "default.ask",
    });
  });
});

describe("isRing0Path with RING0_PATHS", () => {
  it.each(
    `.github/workflows/ci.yml .GitHub/workflows/ci.yml .github
    packages/harness/src/permission/policy.ts packages/harness/src/Loop/x.ts
    packages/harness/src/log/a.ts packages/harness/src/sandbox/docker.ts
    packages/harness/src/ledger/a.ts packages/harness/src/scorer/a.ts
    packages/harness/sandbox/Dockerfile packages/schema/schemas/a.schema.json
    eslint.config.js tsconfig.base.json TSCONFIG.json vitest.config.ts
    .prettierrc.json package.json pnpm-workspace.yaml .node-version
    helmwright.config.json .npmrc .pnpmfile.cjs
    evals/ac8.json packages/harness/evals/x.json`.split(/\s+/),
  )("matches %j, case-folded", (path) => {
    expect(isRing0Path(path, RING0_PATHS)).toBe(true);
  });

  it.each(
    `packages/harness/package.json packages/harness/src/run/run.ts
    packages/harness/src/loopy/x.ts src/tsconfig.json docs/decisions.md
    .githubx/a`.split(/\s+/),
  )("does not match %j", (path) => {
    expect(isRing0Path(path, RING0_PATHS)).toBe(false);
  });
});

describe("the always-ask floor", () => {
  const scopes = ["worktree", "runBranch", "any"] as const;
  const modes = ["tiered", "policy", "autonomous", "alwaysAsk", undefined];
  const hostile = (action: string): Record<string, unknown>[] => {
    const relax = (scope: string) => ({
      id: "r",
      action,
      scope,
      tier: "allow",
    });
    // Every action allowed in every scope, under valid unique IDs.
    const allowAll = [...PERMISSION_ONLY_ACTIONS, "execute"]
      .flatMap((a) => scopes.map((scope) => ({ action: a, scope })))
      .map((r, i) => ({ ...r, id: `allow-${String(i)}`, tier: "allow" }));
    return [
      ...scopes.map((s) => ({ ...BASE, rules: [relax(s), ...BASE.rules] })),
      { ...BASE, rules: allowAll },
      // Valid policies that drop the built-in floor: the floor still applies.
      { ...BASE, rules: allowAll, alwaysAsk: ["execute"], ring0Paths: ["x"] },
      { ...BASE, rules: [relax("any")], alwaysAsk: ["fs.read"] },
      { ...BASE, rules: allowAll, ring0Settings: ["x"] },
    ].flatMap((policy) =>
      modes.map((governance) => ({ ...policy, governance })),
    );
  };

  it.each(EGRESS)("always asks %s, before any rule", (action) => {
    const input = alwaysAsked.find(([a]) => a === action)?.[1];
    const first = { id: "first", action, scope: "any", tier: "allow" };
    const policy = { ...BASE, rules: [first, ...BASE.rules] };
    expect(ALWAYS_ASK_ACTIONS).toContain(action);
    expect(verdict(action, input, policy)).toEqual({
      tier: "alwaysAsk",
      ruleId: `always-ask.${action}`,
    });
  });

  it("has a request for every always-ask action", () => {
    const actions = alwaysAsked.map(([action]) => action);
    expect(actions).toEqual(expect.arrayContaining([...ALWAYS_ASK_ACTIONS]));
  });

  it.each(alwaysAsked)(
    "never allows %s %j, whatever the governance mode, rules or override",
    (action, input) => {
      expect(verdict(action, input).tier).toBe("alwaysAsk");
      for (const policy of hostile(action)) {
        // A valid hostile policy still reaches the floor; an invalid one is denied.
        const expected = validatePermissionPolicy(policy)
          ? "alwaysAsk"
          : "deny";
        expect(verdict(action, input, policy).tier).toBe(expected);
        let resolved: PermissionPolicy | undefined;
        try {
          resolved = resolvePolicy(BASE, policy);
        } catch {
          continue;
        }
        expect(verdict(action, input, resolved).tier).not.toBe("allow");
      }
    },
  );
});

describe("resolvePolicy", () => {
  const rules = BASE.rules;
  const loose = { id: "x", scope: "any", tier: "allow" };
  it.each([
    ["drops an always-ask action", { alwaysAsk: ["push"] }],
    ["drops a Ring 0 path", { ring0Paths: [".github/**"] }],
    ["keeps one Ring 0 setting", { ring0Settings: ["spend.cap"] }],
    [
      "loosens a rule",
      { rules: rules.map((r) => ({ ...r, tier: "allow" as const })) },
    ],
    ["puts a looser rule first", { rules: [{ ...loose, action: "fs.edit" }] }],
    [
      "allows what no rule matched",
      { rules: [...rules, { ...loose, action: "config.set" }] },
    ],
  ])("rejects an override that %s", (_, change) => {
    expect(() => resolvePolicy(BASE, { ...BASE, ...change })).toThrow(
      RangeError,
    );
  });

  it.each(["default.ask", "policy.invalid", "schema.invalid-input"])(
    "rejects a rule that reuses the guard rule id %j",
    (id) => {
      const override = {
        ...BASE,
        rules: [...rules, { ...loose, id, action: "deploy", tier: "ask" }],
      };
      expect(() => resolvePolicy(BASE, override)).toThrow(TypeError);
    },
  );

  it.each([
    ["is not an object", "tiered"],
    ["has another governance mode", { ...BASE, governance: "policy" }],
    ["has an unknown field", { ...BASE, mode: "yolo" }],
    ["repeats a rule id", { ...BASE, rules: [...rules, rules[0]] }],
  ])("rejects an override that %s", (_, override) => {
    expect(() => resolvePolicy(BASE, override)).toThrow(TypeError);
  });

  const lists = ["alwaysAsk", "ring0Paths", "ring0Settings"] as const;
  it.each(
    lists.flatMap((key) => BASE[key].map((item) => [key, item] as const)),
  )("rejects an override whose %s drops %j", (key, item) => {
    const kept = BASE[key].filter((other) => other !== item);
    expect(() => resolvePolicy(BASE, { ...BASE, [key]: kept })).toThrow(
      new RangeError(`override relaxes ${key}: removes ${item}`),
    );
  });

  it.each([
    ["alwaysAsk", "execute"],
    ["ring0Paths", "docs/**"],
    ["ring0Settings", "friction.defaultIntensity"],
  ] as const)("accepts an override whose %s adds %j", (key, item) => {
    const override = { ...BASE, [key]: [...BASE[key], item] };
    expect(resolvePolicy(BASE, override)[key]).toContain(item);
  });

  it("accepts additions and tightenings, and evaluates with them", () => {
    const resolved = resolvePolicy(BASE, {
      ...BASE,
      version: "project-2",
      alwaysAsk: [...BASE.alwaysAsk, "execute"],
      ring0Paths: [...BASE.ring0Paths, "docs/**"],
      rules: [
        { id: "deploy.never", action: "deploy", scope: "any", tier: "deny" },
        { id: "read.ask", action: "fs.read", scope: "worktree", tier: "ask" },
        ...rules,
      ],
    });
    expect(resolved.version).toBe("project-2");
    expect(verdict("execute", x("ls"), resolved).tier).toBe("alwaysAsk");
    expect(verdict("fs.edit", p("docs/x.md"), resolved).tier).toBe("alwaysAsk");
    expect(verdict("fs.read", p("src/a.ts"), resolved).tier).toBe("ask");
    expect(verdict("deploy", { destination: "prod" }, resolved)).toEqual({
      tier: "deny",
      ruleId: "deploy.never",
    });
  });
});
