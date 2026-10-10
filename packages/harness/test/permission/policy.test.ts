import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validatePermissionPolicy,
  type PermissionPolicy,
} from "@helmwright/schema";
import type {
  PermissionRequest,
  PermissionVerdict,
  RunRing0,
} from "../../src/index.ts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { displayText } from "../../src/permission/policy.ts";
import {
  ALWAYS_ASK_ACTIONS,
  DEFAULT_PERMISSION_POLICY as BASE,
  PERMISSION_ONLY_ACTIONS,
  RING0_PATHS,
  RING0_SETTINGS,
  evaluate,
  isRing0Path,
  resolvePolicy,
  ring0LinkTargets,
  runRing0,
} from "../../src/index.ts";

let worktree: string;
/** The run's Ring 0 links of the worktree, taken before its links were made. */
let NONE: RunRing0;
/** The run's Ring 0 links of the worktree, with its links. */
let LINKED: RunRing0;
beforeAll(() => {
  worktree = join(mkdtempSync(join(tmpdir(), "helmwright-policy-")), "wt");
  mkdirSync(join(worktree, "src", "gh", "workflows"), { recursive: true });
  mkdirSync(join(worktree, "hsrc", "loop"), { recursive: true });
  mkdirSync(join(worktree, "packages", "harness"), { recursive: true });
  mkdirSync(join(worktree, "foo", "evals"), { recursive: true });
  NONE = runRing0(worktree, BASE);
  // SF1: links at a leading part of a Ring 0 glob.
  symlinkSync("../../hsrc", join(worktree, "packages", "harness", "src"));
  symlinkSync("../foo", join(worktree, "packages", "foo"));
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
  LINKED = runRing0(worktree, BASE);
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
/** A request in the shared worktree, with no extra Ring 0 links. */
const req = (action: string, input: unknown, runId = "r") => {
  return { action, input, worktree, runId, extraRing0Paths: NONE };
};
/** NONE, or for a valid policy with its own Ring 0 paths, its `runRing0` (SF-1). */
const ring0For = (policy: unknown): RunRing0 => {
  const own = (policy as Partial<PermissionPolicy>).ring0Paths ?? [];
  if (own.every((glob) => RING0_PATHS.includes(glob))) return NONE;
  return validatePermissionPolicy(policy) ? runRing0(worktree, policy) : NONE;
};
// Policies are unknown on purpose: evaluate re-validates the policy it is given.
const verdict = (action: string, input: unknown, policy: unknown = BASE) => {
  const extraRing0Paths = ring0For(policy);
  const request = { ...req(action, input, "run_01"), extraRing0Paths };
  const { tier, ruleId } = evaluate(policy as PermissionPolicy, request);
  return { tier, ruleId };
};
const R0_PATH = "always-ask.ring0-path";
/** helmwright's own committed config (B6-5, OQ2); it holds only `permissions.policy`. */
const OWN_CONFIG = fileURLToPath(
  new URL("../../../../helmwright.config.json", import.meta.url),
);
/** helmwright's own policy, resolved over the default as the config loader does. */
const helmwrightPolicy = (): PermissionPolicy => {
  const parsed = JSON.parse(readFileSync(OWN_CONFIG, "utf8")) as {
    permissions: { policy: unknown };
  };
  return resolvePolicy(BASE, parsed.permissions.policy);
};
/** Ring 0 in helmwright's repository only, so its own config lists them, not the floor. */
const HELMWRIGHT_GLOBS = [
  "packages/harness/src/loop/**",
  "packages/harness/src/log/**",
  "packages/harness/src/permission/**",
  "packages/harness/src/sandbox/**",
  "packages/harness/src/ledger/**",
  "packages/harness/src/scorer/**",
  "packages/harness/src/broker/**",
  "packages/harness/src/config/**",
  "packages/harness/sandbox/**",
  "packages/schema/schemas/**",
  "packages/*/evals/**",
  "rot-register.json",
  // S1 (B6-5 review): the run-start check, presence, Ring 0 data and its generator.
  "packages/harness/src/run/**",
  // B10-1: the intake rubric is a Ring 0 step (03 Intake).
  "packages/harness/src/intake/**",
  "packages/harness/src/cli.ts",
  "packages/schema/src/index.ts",
  "packages/schema/generated/**",
  "packages/schema/scripts/**",
  "packages/*/package.json",
  // B3-1: the sensor floor and the tests that guard the Ring 0 lists.
  "packages/harness/src/floor/**",
  "packages/harness/test/floor/**",
  "packages/harness/test/permission/**",
  "packages/harness/test/config/config.test.ts",
  // B5-2b (OD-7): the object model code and tests, and the ledger tests (src/ledger is above).
  "packages/harness/src/objects/**",
  "packages/harness/test/objects/**",
  "packages/harness/test/ledger/**",
  // FX (OQ-FX-3, 2026-10-09): the seeded fixture repo feeds the acceptance and baseline runs.
  "packages/harness/test/e2e/fixtures/fx-*",
];
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
    ["commit", commit("x/" + "a".repeat(255), "a"), "ask", "default.ask"],
    ["commit", commit("refs/tags/v1", "src/a.ts"), "ask", "default.ask"],
    // Paths that cannot be checked file by file count as Ring 0.
    ["commit", commit(branch, "."), "alwaysAsk", "always-ask.ring0-path"],
    ["commit", commit(branch, "src"), "alwaysAsk", "always-ask.ring0-path"],
    // SF-5: a commit stages worktree paths only.
    ["commit", commit(branch, "../x"), "deny", "schema.invalid-input"],
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
    ["fs.delete", p("/workspace/"), "alwaysAsk", "always-ask.delete-outside"],
    // S5: an existing directory cannot be checked file by file, so it counts as Ring 0.
    ["fs.edit", p("/workspace"), "alwaysAsk", R0_PATH],
    ["fs.delete", p("packages/harness/src"), "alwaysAsk", R0_PATH],
    ["fs.edit", p("src"), "alwaysAsk", R0_PATH],
    [
      "spend.raiseCap",
      { capUsd: 1000 },
      "alwaysAsk",
      "always-ask.spend.raiseCap",
    ],
  ])("%s %j → %s (%s)", (action, input, tier, ruleId) => {
    expect(verdict(action, input)).toEqual({ tier, ruleId });
  });

  it("returns the normalized target", () => {
    const request = req("fs.edit", p("/workspace/./src/a.ts"));
    const { target } = evaluate(BASE, request);
    expect(target?.kind).toBe("path");
    expect(target?.value).toMatch(/\/wt\/src\/a\.ts$/);
  });

  it.each<[string, unknown]>([
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
    ["spend.raiseCap", { capUsd: 1000.01 }],
    ["commit", commit(branch)],
    // S4: invisible characters, whitespace, and refs that are not plain branch names.
    ["push", to("git\u202ehub.com")],
    ["push", to("origin main")],
    ["deps.add", { packages: ["left\u202epad"] }],
    ["config.set", set("permissions\u200b")],
    ...[
      "+main:main",
      "--force",
      "a..b",
      "main.lock",
      "main/",
      "main.",
      "ma\tin",
      "a@" + "{1}",
      "a\\b",
      "a~1",
      "a^",
      "a?",
      "a*",
      "a[b",
      "refs/heads/.x",
      "a//b",
      "/main",
      "@",
      "main:x",
      // SF6c and the ASCII-only nit.
      ...["HEAD", "FETCH_HEAD", "ORIG_HEAD", "MERGE_HEAD", "CHERRY_PICK_HEAD"],
      "head",
      "m\u00e4in",
      "a\u00a0b",
      "x/" + "a".repeat(256),
    ].flatMap((ref) => [
      ["push", to("origin", ref)] as [string, unknown],
      ["commit", commit(ref, "src/a.ts")] as [string, unknown],
    ]),
    ["push", to("origin", "refs/remotes/origin/main")],
    ["push", to("origin", "refs/tags/v1")],
    ["push", to("origin", "Refs/Tags/v1")],
    // SF-C: only branches are pushed.
    ...`tags/v1 remotes/origin/main refs/meta/config refs/for/main refs/notes/x
      stash REBASE_HEAD AUTO_MERGE heads/x`
      .split(/\s+/)
      .map((ref) => ["push", to("origin", ref)] as [string, unknown]),
    // SF5: an option where a destination or package name belongs.
    ["push", to("--receive-pack=x")],
    ["comment", { destination: "-x", body: "b" }],
    ["publish", { destination: "--registry=x" }],
    ["deploy", { destination: "-x" }],
    ["deps.add", { packages: ["--config.registry=x"] }],
    ["deps.add", { packages: ["left-pad", "-x"] }],
    ["fs.edit", p("src/\ud800")],
  ])("denies the unknown action or invalid input %s %j", (action, input) => {
    expect(verdict(action, input).tier).toBe("deny");
  });

  it("denies, without throwing, a path that resolves to a control character", () => {
    const request = req("fs.edit", p("to-esc"), "run_01");
    expect(evaluate(BASE, request)).toEqual({
      kind: "rejected",
      tier: "deny",
      ruleId: "schema.invalid-input",
      reason:
        "fs.edit path rejected: resolved path has control or invisible characters",
      guard: "schema",
      requestedName: "fs.edit",
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
    const request = req("fs.read", p("a"));
    const missing = join(worktree, "missing");
    expect(evaluate(BASE, { ...request, worktree: missing })).toEqual({
      kind: "rejected",
      tier: "deny",
      ruleId: "schema.invalid-input",
      reason: "fs.read path rejected: ENOENT",
      guard: "schema",
      requestedName: "fs.read",
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

/** Paths that only helmwright's own Ring 0 paths match (B6-5, OQ2). */
const HELMWRIGHT_ONLY = `packages/harness/src/permission/policy.ts
  packages/harness/src/Loop/x.ts packages/harness/src/log/a.ts
  packages/harness/src/sandbox/docker.ts packages/harness/src/ledger/a.ts
  packages/harness/src/scorer/a.ts packages/harness/src/broker/broker.ts
  packages/harness/src/config/config.ts packages/harness/sandbox/Dockerfile
  packages/schema/schemas/a.schema.json packages/harness/evals/x.json
  rot-register.json packages/harness/package.json
  packages/harness/src/run/run.ts packages/harness/src/cli.ts
  packages/schema/src/index.ts packages/schema/generated/x.ts
  packages/schema/scripts/generate.ts packages/harness/src/intake/rubric.ts
  packages/harness/src/floor/rules.ts packages/harness/test/floor/tree.test.ts
  packages/harness/test/permission/policy.test.ts
  packages/harness/test/config/config.test.ts`.split(/\s+/);

describe("isRing0Path with RING0_PATHS", () => {
  it.each(
    `.github/workflows/ci.yml .GitHub/workflows/ci.yml .github
    eslint.config.js tsconfig.base.json TSCONFIG.json vitest.config.ts
    .prettierrc.json package.json pnpm-workspace.yaml .node-version
    helmwright.config.json .npmrc .pnpmfile.cjs evals/ac8.json`.split(/\s+/),
  )("matches %j, case-folded", (path) => {
    expect(isRing0Path(path, RING0_PATHS)).toBe(true);
    expect(isRing0Path(path, helmwrightPolicy().ring0Paths)).toBe(true);
  });

  it.each(
    `packages/harness/src/engine/x.ts packages/harness/src/runs/x.ts
    packages/harness/src/loopy/x.ts src/tsconfig.json docs/decisions.md
    .githubx/a`.split(/\s+/),
  )("does not match %j", (path) => {
    expect(isRing0Path(path, RING0_PATHS)).toBe(false);
    expect(isRing0Path(path, helmwrightPolicy().ring0Paths)).toBe(false);
  });

  it.each(HELMWRIGHT_ONLY)(
    "matches %j in helmwright's own policy only (OQ2)",
    (path) => {
      expect(isRing0Path(path, RING0_PATHS)).toBe(false);
      expect(isRing0Path(path, helmwrightPolicy().ring0Paths)).toBe(true);
    },
  );
});

describe("per-project Ring 0 paths (B6-5, OQ2)", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "helmwright-own-"));
    for (const sub of ["loop", "broker", "config", "run", "engine"]) {
      mkdirSync(join(dir, "packages", "harness", "src", sub), {
        recursive: true,
      });
    }
    for (const sub of ["src", "generated", "scripts"]) {
      mkdirSync(join(dir, "packages", "schema", sub), { recursive: true });
    }
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const edit = (policy: PermissionPolicy, path: string) => {
    const run = { worktree: dir, runId: "run_01" };
    const extraRing0Paths = runRing0(dir, policy);
    const request = { ...run, action: "fs.edit", input: p(path) };
    const { tier, ruleId } = evaluate(policy, { ...request, extraRing0Paths });
    return { tier, ruleId };
  };

  it("keeps only the generic paths in the floor", () => {
    for (const glob of HELMWRIGHT_GLOBS) {
      expect(RING0_PATHS).not.toContain(glob);
      expect(BASE.ring0Paths).not.toContain(glob);
    }
    expect([...RING0_PATHS]).toEqual(BASE.ring0Paths);
    expect(RING0_PATHS).toEqual(
      expect.arrayContaining([
        "evals/**",
        ".github/**",
        "helmwright.config.json",
      ]),
    );
  });

  it.each([
    "packages/harness/src/loop/x.ts",
    "packages/harness/src/broker/x.ts",
  ])("follows the normal rules for %j in a repo with no config", (path) => {
    expect(edit(BASE, path)).toEqual({
      tier: "allow",
      ruleId: "fs.edit.worktree",
    });
  });

  it("lists every helmwright-source glob in helmwright's own policy", () => {
    const own = helmwrightPolicy();
    expect(own.version).toBe("helmwright-1");
    expect(own.ring0Paths).toEqual([...BASE.ring0Paths, ...HELMWRIGHT_GLOBS]);
    expect({
      ...own,
      version: BASE.version,
      ring0Paths: BASE.ring0Paths,
    }).toEqual(BASE);
  });

  it.each([
    "packages/harness/src/loop/x.ts",
    "packages/harness/src/broker/x.ts",
    "packages/harness/src/config/x.ts",
    "rot-register.json",
    "packages/harness/src/run/x.ts",
    "packages/harness/src/intake/rubric.ts",
    "packages/harness/src/cli.ts",
    "packages/schema/src/index.ts",
    "packages/schema/generated/x.ts",
    "packages/schema/scripts/generate.ts",
    "packages/harness/package.json",
  ])("always asks to edit %j under helmwright's own policy", (path) => {
    expect(edit(helmwrightPolicy(), path)).toEqual({
      tier: "alwaysAsk",
      ruleId: R0_PATH,
    });
  });

  it("allows an edit outside helmwright's Ring 0 paths under its policy", () => {
    expect(
      edit(helmwrightPolicy(), "packages/harness/src/engine/x.ts"),
    ).toEqual({
      tier: "allow",
      ruleId: "fs.edit.worktree",
    });
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
    const override = { ...BASE, version: "p-2", [key]: [...BASE[key], item] };
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

describe("evaluate on hostile requests (B9a-4)", () => {
  const rule = (input: unknown, extra: Record<string, unknown> = {}) =>
    evaluate(BASE, { ...req("fs.edit", input, "run_01"), ...extra });
  const hostile = {
    toString(): string {
      throw new Error("hostile toString");
    },
  };

  it.each([
    [
      "a throwing getter",
      () =>
        rule({
          get path(): string {
            throw new Error("getter");
          },
        }),
    ],
    [
      "a Proxy whose ownKeys throws",
      () =>
        rule(
          new Proxy(p("src/a.ts"), {
            ownKeys() {
              throw new Error("ownKeys");
            },
          }),
        ),
    ],
    [
      "a sparse array in paths",
      () => {
        const paths = ["src/a.ts"];
        paths[2] = "src/a.ts";
        const input = { ref: branch, paths };
        return evaluate(BASE, req("commit", input, "run_01"));
      },
    ],
    [
      "a thrown object with a hostile toString",
      () => {
        // The value thrown has a toString that throws too.
        const request = {
          action: "fs.edit",
          input: p("src/a.ts"),
          worktree,
          extraRing0Paths: NONE,
          get runId(): string {
            throw hostile as unknown as Error;
          },
        };
        return evaluate(BASE, request);
      },
    ],
    ["a Symbol runId", () => rule(p("src/a.ts"), { runId: Symbol("r") })],
    ["a non-string worktree", () => rule(p("src/a.ts"), { worktree: 1 })],
    ["a BigInt in the input", () => rule({ path: 1n })],
    [
      "an input over 256 KiB (N4)",
      () => {
        const argv = ["echo", ...Array<string>(5).fill("a".repeat(60_000))];
        return evaluate(BASE, req("execute", { argv }));
      },
    ],
  ])("denies %s without throwing", (_, run) => {
    let result: PermissionVerdict | undefined;
    expect(() => (result = run())).not.toThrow();
    expect(result?.tier).toBe("deny");
    expect(result?.reason).not.toMatch(/hostile|getter|ownKeys/);
  });

  it("reads the input once and returns what it ruled on", () => {
    let count = 0;
    const input = {
      get path() {
        count += 1;
        return count === 1 ? "src/a.ts" : "package.json";
      },
    };
    const result = rule(input);
    expect(count).toBe(1);
    expect(result.tier).toBe("allow");
    expect(result.input).toEqual({ path: "src/a.ts" });
    expect(Object.isFrozen(result.input)).toBe(true);
    expect(input.path).toBe("package.json");
  });

  it("escapes an unknown action name and never returns its raw characters", () => {
    const result = evaluate(BASE, req("dep\u202eloy\u0007", {}));
    expect(result).toMatchObject({ kind: "rejected", tier: "deny" });
    const { reason, requestedName } = result;
    expect(requestedName).toBe("dep\\u{202e}loy\\u{7}");
    for (const text of [reason, requestedName]) {
      expect(text).not.toContain("\u202e");
      expect(text).not.toContain("\u0007");
    }
  });

  it("keeps fs error text, which may name the worktree, out of the reason (N3)", () => {
    const request = req("fs.read", p("a"));
    const bad = join(worktree, "x\0y");
    const { tier, reason } = evaluate(BASE, { ...request, worktree: bad });
    expect(tier).toBe("deny");
    expect(reason).not.toContain(worktree);
    expect(reason).toMatch(/^fs\.read path rejected(: [A-Z_]+)?$/);
  });

  it("never allows an edit through an upper-cased worktree path", () => {
    const path = `${worktree.toUpperCase()}/package.json`;
    // The tier depends on the filesystem's case handling. Case-insensitive (this macOS
    // APFS checkout, observed 2026-10-07): it resolves to the Ring 0 link package.json.
    // Case-sensitive (Linux): a missing path outside the worktree.
    const folds = (() => {
      try {
        const upper = realpathSync.native(worktree.toUpperCase());
        return upper === realpathSync.native(worktree);
      } catch {
        return false;
      }
    })();
    expect(verdict("fs.edit", p(path))).toEqual(
      folds
        ? { tier: "alwaysAsk", ruleId: R0_PATH }
        : { tier: "ask", ruleId: "fs.edit.outside" },
    );
  });
});

describe("push refs (SF-C)", () => {
  it.each(["main", "refs/heads/main"])(
    "asks to push %j and shows refs/heads/main",
    (ref) => {
      const input = to("origin", ref);
      const { tier, target } = evaluate(BASE, req("push", input));
      expect(tier).toBe("alwaysAsk");
      expect(target?.value).toBe("origin refs/heads/main");
    },
  );
});

describe("targets show the payload (S3)", () => {
  const target = (action: string, input: unknown) =>
    evaluate(BASE, req(action, input)).target;

  it("shows the spend cap", () => {
    expect(target("spend.raiseCap", { capUsd: 50 })).toEqual({
      kind: "amount",
      value: "spend.cap",
      detail: "50 USD",
    });
  });

  it("shows a bounded, escaped config value and comment body", () => {
    expect(target("config.set", set("ui.theme", "dark"))?.detail).toBe(
      '"dark"',
    );
    const long = target("config.set", set("ui.theme", { a: "x".repeat(900) }));
    expect(long?.detail).toBe('{"a":"' + "x".repeat(506) + "…[truncated]");
    const body = {
      destination: "github.com",
      body: `ok\u202e\n${"y".repeat(900)}`,
    };
    const shown = target("comment", body);
    expect(shown?.value).toBe("github.com");
    expect(shown?.detail).toBe(
      "ok\\u{202e}\\u{a}" + "y".repeat(508) + "…[truncated]",
    );
  });

  const comment = (body: string) =>
    target("comment", { destination: "github.com", body })?.detail;

  it("escapes default-ignorable code points and non-ASCII spaces", () => {
    expect(comment("a\u3164b\ufe0fc\u2003d e")).toBe(
      "a\\u{3164}b\\u{fe0f}c\\u{2003}d e",
    );
  });

  it("shows literal \\u{202e} text unlike a real U+202E", () => {
    expect(comment("\\u{202e}")).toBe("\\\\u{202e}");
    expect(comment("\u202e")).toBe("\\u{202e}");
  });

  it("cuts the raw text to 512 code points before escaping", () => {
    const body = "y".repeat(511) + "\u202e" + "z".repeat(10);
    expect(comment(body)).toBe("y".repeat(511) + "\\u{202e}…[truncated]");
    expect(comment("\u202e".repeat(512))).toBe("\\u{202e}".repeat(512));
    expect(comment("\u{1f600}".repeat(513))).toBe(
      "\u{1f600}".repeat(512) + "…[truncated]",
    );
  });
});

describe("Ring 0 exports are frozen (S2)", () => {
  it("freezes the floor sets and the default policy, and a mutation cannot drop push", () => {
    for (const list of [ALWAYS_ASK_ACTIONS, RING0_PATHS, RING0_SETTINGS]) {
      expect(Object.isFrozen(list)).toBe(true);
    }
    expect(Object.isFrozen(BASE)).toBe(true);
    expect(Object.isFrozen(BASE.rules)).toBe(true);
    for (const r of BASE.rules) expect(Object.isFrozen(r)).toBe(true);
    expect(() => (ALWAYS_ASK_ACTIONS as unknown as string[]).splice(0)).toThrow(
      TypeError,
    );
    expect(() => (BASE.alwaysAsk as string[]).splice(0)).toThrow(TypeError);
    expect(() => (BASE.rules as unknown[]).unshift({})).toThrow(TypeError);
    expect(verdict("push", to("origin")).tier).toBe("alwaysAsk");
  });

  it("freezes PERMISSION_ONLY_ACTIONS and resolvePolicy's result", () => {
    expect(Object.isFrozen(PERMISSION_ONLY_ACTIONS)).toBe(true);
    const resolved = resolvePolicy(BASE, BASE);
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved.rules[0])).toBe(true);
    expect(Object.isFrozen(resolved.ring0Paths)).toBe(true);
  });
});

describe("pre-existing Ring 0 symlinks (#26)", () => {
  it("lists the worktree paths that Ring 0 links resolve to", () => {
    const targets = ring0LinkTargets(worktree, RING0_PATHS);
    expect(targets).toEqual(
      expect.arrayContaining([
        "src/pkg.json/**",
        "src/missing.js/**",
        "src/gh/**",
      ]),
    );
    expect(targets).not.toContain("src/a.ts/**");
  });

  it("adds the target of a link at a leading part of a Ring 0 glob (SF1)", () => {
    // packages/harness/src and packages/foo lead to helmwright's own Ring 0 globs.
    const own = helmwrightPolicy();
    const extraRing0Paths = runRing0(worktree, own);
    expect(extraRing0Paths).toEqual(
      expect.arrayContaining(["hsrc/**", "foo/**"]),
    );
    expect(LINKED).not.toEqual(expect.arrayContaining(["hsrc/**"]));
    const run = { worktree, runId: "run_01", extraRing0Paths: NONE };
    for (const [action, input] of [
      ["fs.edit", p("hsrc/loop/x.ts")],
      ["commit", commit(branch, "hsrc/loop/x.ts")],
      ["fs.edit", p("foo/evals/x.json")],
    ] as const) {
      expect(evaluate(BASE, { ...run, action, input }).tier).toBe("allow");
      expect(
        evaluate(own, { ...run, action, input, extraRing0Paths }),
      ).toMatchObject({ tier: "alwaysAsk", ruleId: R0_PATH });
    }
  });

  it.each([
    "a".repeat(129),
    "café/**",
    "a b",
    "/abs",
    "a//b",
    "a/",
    "../x",
    "a/./b",
    "**/x",
    "a**",
    "a/**b",
  ])("denies an invalid extra Ring 0 glob %j", (glob) => {
    const request = { action: "fs.read", input: p("src/a.ts"), worktree };
    const extraRing0Paths = [glob] as unknown as RunRing0;
    expect(
      evaluate(BASE, { ...request, runId: "r", extraRing0Paths }).tier,
    ).toBe("deny");
  });

  it("treats the run's extra Ring 0 paths as Ring 0", () => {
    const extraRing0Paths = LINKED;
    const input = commit(branch, "src/pkg.json");
    const request = req("commit", input, "run_01");
    expect(evaluate(BASE, request).tier).toBe("allow");
    expect(evaluate(BASE, { ...request, extraRing0Paths })).toMatchObject({
      tier: "alwaysAsk",
      ruleId: R0_PATH,
    });
    const workflow = { ...request, input: p("src/gh/workflows/ci.yml") };
    expect(
      evaluate(BASE, { ...workflow, action: "fs.edit", extraRing0Paths }).tier,
    ).toBe("alwaysAsk");
  });
});

describe("resolvePolicy (B9a-4)", () => {
  it("rejects an override with the base's version but other content (N2)", () => {
    const change = { alwaysAsk: [...BASE.alwaysAsk, "execute"] };
    expect(() => resolvePolicy(BASE, { ...BASE, ...change })).toThrow(
      /same version/,
    );
    const reordered = Object.fromEntries(Object.entries(BASE).reverse());
    expect(resolvePolicy(BASE, reordered)).toEqual(BASE);
  });

  it("rejects an override that trades a deny rule for always-ask", () => {
    const deny = {
      id: "deps.deny",
      action: "deps.add",
      scope: "any",
      tier: "deny",
    };
    const base = { ...BASE, rules: [deny, ...BASE.rules] } as PermissionPolicy;
    const override = {
      ...BASE,
      version: "project-2",
      alwaysAsk: [...BASE.alwaysAsk, "deps.add"],
    };
    expect(() => resolvePolicy(base, override)).toThrow(RangeError);
    expect(() => resolvePolicy(base, override)).toThrow(/relaxes deps\.add/);
  });
});

describe("Ring 0 link chains (SF2)", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "helmwright-chain-"));
    mkdirSync(join(dir, "outside"));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  /** Each tree's `runRing0`, taken before its links were made. */
  const before = new Map<string, RunRing0>();
  const fresh = (wt: string) => before.get(wt) ?? NONE;
  /** A fresh worktree with a config directory and the given links. */
  const tree = (name: string, links: [string, string][]) => {
    const wt = join(dir, name);
    mkdirSync(join(wt, "config"), { recursive: true });
    before.set(wt, runRing0(wt, BASE));
    for (const [from, target] of links) {
      mkdirSync(dirname(join(wt, from)), { recursive: true });
      symlinkSync(target, join(wt, from));
    }
    return wt;
  };

  it("records each link in the chain, so a link later replaced by a file asks", () => {
    const wt = tree("a", [
      ["package.json", "a"],
      ["a", "config/pkg.json"],
    ]);
    const extraRing0Paths = runRing0(wt, BASE);
    expect([...extraRing0Paths].sort()).toEqual(["a/**", "config/pkg.json/**"]);
    rmSync(join(wt, "a"));
    writeFileSync(join(wt, "a"), "");
    const request = req("commit", commit(branch, "a"), "run_01");
    const run = { ...request, worktree: wt, extraRing0Paths: fresh(wt) };
    expect(evaluate(BASE, run).tier).toBe("allow");
    expect(evaluate(BASE, { ...run, extraRing0Paths })).toMatchObject({
      tier: "alwaysAsk",
      ruleId: R0_PATH,
    });
  });

  it("keeps the links inside the worktree when the last hop leaves it", () => {
    const outside = join(dir, "outside", "x");
    const wt = tree("b", [
      ["package.json", "b"],
      ["b", outside],
    ]);
    expect(ring0LinkTargets(wt, RING0_PATHS)).toEqual(["b/**"]);
  });

  it("refuses the run when a link target's name is not a valid Ring 0 glob", () => {
    const wt = tree("odd", [["package.json", "my pkg.json"]]);
    expect(() => ring0LinkTargets(wt, RING0_PATHS)).toThrow(
      /unsupported names.*my pkg\.json/,
    );
  });

  it("records a symlinked directory along the way", () => {
    const wt = tree("c", [
      ["d", "config"],
      ["package.json", "d/pkg.json"],
    ]);
    expect([...ring0LinkTargets(wt, RING0_PATHS)].sort()).toEqual([
      "config/pkg.json/**",
      "d/**",
    ]);
  });

  it("resolves a dangling target one component at a time (SF-A)", () => {
    const wt = tree("e", [
      ["d", "sub/inner"],
      ["package.json", "d/../config/pkg.json"],
    ]);
    mkdirSync(join(wt, "sub", "inner"), { recursive: true });
    const extraRing0Paths = runRing0(wt, BASE);
    expect([...extraRing0Paths].sort()).toEqual([
      "d/**",
      "sub/config/pkg.json/**",
    ]);
    const run = { worktree: wt, runId: "run_01", extraRing0Paths: fresh(wt) };
    for (const [action, input] of [
      ["fs.edit", p("sub/config/pkg.json")],
      ["commit", commit(branch, "sub/config/pkg.json")],
    ] as const) {
      expect(evaluate(BASE, { ...run, action, input }).tier).toBe("allow");
      expect(
        evaluate(BASE, { ...run, action, input, extraRing0Paths }),
      ).toMatchObject({ tier: "alwaysAsk", ruleId: R0_PATH });
    }
  });

  it("refuses the run when a link target's .. climbs above the worktree (SF-D)", () => {
    // In the sandbox this reaches /workspace/hsrc again; on the host it leaves the tree.
    const up = `${"../".repeat(12)}workspace/hsrc`;
    const wt = tree("up", [["packages/harness/src", up]]);
    const own = helmwrightPolicy();
    expect(() => runRing0(wt, own)).toThrow();
  });

  it("maps an absolute target under /workspace onto the worktree (SF-B)", () => {
    const wt = tree("f", [["packages/harness/src", "/workspace/hsrc"]]);
    mkdirSync(join(wt, "hsrc", "loop"), { recursive: true });
    const own = helmwrightPolicy();
    const extraRing0Paths = runRing0(wt, own);
    expect(extraRing0Paths).toEqual(["hsrc/**"]);
    const input = p("hsrc/loop/x.ts");
    const run = {
      action: "fs.edit",
      input,
      worktree: wt,
      runId: "run_01",
      extraRing0Paths: fresh(wt),
    };
    expect(evaluate(BASE, run).tier).toBe("allow");
    expect(evaluate(own, { ...run, extraRing0Paths })).toMatchObject({
      tier: "alwaysAsk",
      ruleId: R0_PATH,
    });
    const chain = tree("g", [
      ["package.json", "b"],
      ["b", "/workspace/config/pkg.json"],
    ]);
    expect([...ring0LinkTargets(chain, RING0_PATHS)].sort()).toEqual([
      "b/**",
      "config/pkg.json/**",
    ]);
  });

  it("finds the links of the policy's Ring 0 paths and the floor's (SF3)", () => {
    const wt = tree("own", [
      ["custom.json", "config/own.json"],
      ["package.json", "config/pkg.json"],
    ]);
    const ring0Paths: [string] = ["custom.json"];
    const policy = { ...BASE, version: "own-1", ring0Paths };
    expect([...runRing0(wt, policy)].sort()).toEqual([
      "config/own.json/**",
      "config/pkg.json/**",
    ]);
    expect(runRing0(wt, BASE)).toEqual(["config/pkg.json/**"]);
    const invalid = { ...BASE, ring0Paths: ["../x"] } as PermissionPolicy;
    expect(() => runRing0(wt, invalid)).toThrow(TypeError);
  });

  it("refuses a run with over 1024 link targets or 64 levels (SF-7)", () => {
    const links = Array.from({ length: 1025 }, (_, i): [string, string] => [
      `.github/l${String(i)}`,
      `../t${String(i)}`,
    ]);
    expect(() => runRing0(tree("many", links), BASE)).toThrow(/over 1024/);
    const deep = `.github/${"d/".repeat(65)}l`;
    const wt = tree("deep", [[deep, join(dir, "outside", "y")]]);
    expect(() => runRing0(wt, BASE)).toThrow(/deeper than 64/);
  });

  it("throws TypeError for a policy whose getter throws (SF-7)", () => {
    const hostile = Object.defineProperty({ ...BASE }, "ring0Paths", {
      get: () => {
        throw new Error("getter");
      },
      enumerable: true,
    });
    const wt = tree("hostile", []);
    expect(() => runRing0(wt, hostile)).toThrow(TypeError);
    expect(() => runRing0(wt, hostile)).toThrow("invalid permission policy");
  });

  it("accepts a 128-character link target glob", () => {
    const wt = tree("long", [["package.json", "a".repeat(125)]]);
    expect(runRing0(wt, BASE)).toEqual(["a".repeat(125) + "/**"]);
  });

  it("throws on a link loop rather than walking it", () => {
    const wt = tree("d", [
      ["package.json", "l1"],
      ["l1", "l2"],
      ["l2", "l1"],
    ]);
    expect(() => ring0LinkTargets(wt, RING0_PATHS)).toThrow();
  });
});

describe("verdicts carry what the event writer needs (B9b-2a)", () => {
  const rule = (action: string, input: unknown, policy: unknown = BASE) =>
    evaluate(policy as PermissionPolicy, req(action, input, "run_01"));

  it("rules an install through execute as deps.add (S1)", () => {
    expect(rule("execute", x("pnpm", "add", "x"))).toMatchObject({
      kind: "evaluated",
      tier: "ask",
      ruleId: "deps.add",
      action: "deps.add",
      requested: "execute",
      guard: "policy",
      policyVersion: "default-2",
    });
  });

  it("takes the policy version from the checked snapshot", () => {
    let reads = 0;
    const policy = {
      ...BASE,
      get version() {
        reads += 1;
        return reads === 1 ? "v-1" : "v-2";
      },
    };
    expect(rule("fs.read", p("src/a.ts"), policy)).toMatchObject({
      kind: "evaluated",
      policyVersion: "v-1",
    });
  });

  it.each([
    ["an unknown action", "shell", x("ls"), BASE, "schema.unknown-action"],
    ["invalid input", "fs.edit", { path: 1 }, BASE, "schema.invalid-input"],
    ["a bad policy", "fs.read", p("a"), { governance: "x" }, "policy.invalid"],
    // N7: a policy that cannot be snapshot is a policy failure, not a schema one.
    ["a non-JSON policy", "fs.read", p("a"), { version: 1n }, "policy.invalid"],
  ])("rejects %s and names the guard", (_, action, input, change, ruleId) => {
    const result = rule(action, input, { ...BASE, ...change });
    expect(result).toMatchObject({
      kind: "rejected",
      tier: "deny",
      guard: ruleId.startsWith("policy.") ? "policy" : "schema",
      ruleId,
      requestedName: action,
    });
    expect(result.target).toBeUndefined();
    expect(result.input).toBeUndefined();
  });

  it("shows a rejected name cut to 64 code points, then escaped", () => {
    const name = "\u202e" + "\u{1f600}".repeat(70);
    expect(rule(name, {})).toMatchObject({
      kind: "rejected",
      requestedName: "\\u{202e}" + "\u{1f600}".repeat(63) + "…[truncated]",
    });
  });

  it("carries the unescaped resolved path; target.value is display only (SF4)", () => {
    const real = join(realpathSync.native(worktree), "src", "back\\slash.ts");
    expect(rule("fs.edit", p("src/back\\slash.ts"))).toMatchObject({
      kind: "evaluated",
      tier: "allow",
      path: real,
      target: { kind: "path", value: real.replace("\\", "\\\\") },
    });
    expect(rule("execute", x("ls")).path).toBeUndefined();
  });

  it("denies a request without the run's Ring 0 links (SF3)", () => {
    const request = { action: "fs.read", input: p("src/a.ts"), worktree };
    const missing = { ...request, runId: "r" } as unknown as PermissionRequest;
    expect(evaluate(BASE, missing)).toMatchObject({
      kind: "rejected",
      guard: "schema",
      ruleId: "schema.invalid-input",
    });
  });
});

describe("security review of B9b-2a", () => {
  const run = (action: string, input: unknown) =>
    evaluate(BASE, req(action, input, "run_01"));
  const read = (extra: unknown, policy: unknown = BASE) =>
    evaluate(policy as PermissionPolicy, {
      ...req("fs.read", p("src/a.ts")),
      extraRing0Paths: extra as RunRing0,
    });
  const invalid = { kind: "rejected", ruleId: "schema.invalid-input" };

  it("accepts only runRing0 of this worktree and a policy it covers (SF-1)", () => {
    const other = join(worktree, "..", "other");
    mkdirSync(other);
    const ring0Paths = [...BASE.ring0Paths, "docs/**"];
    const own = resolvePolicy(BASE, { ...BASE, version: "own-2", ring0Paths });
    const linked = ring0LinkTargets(worktree, RING0_PATHS);
    for (const forged of [[], linked, runRing0(other, BASE)]) {
      expect(read(forged)).toMatchObject(invalid);
    }
    expect(read(LINKED, own)).toMatchObject(invalid);
    const issued = runRing0(worktree, own);
    expect(read(issued, own).kind).toBe("evaluated");
    expect(read(issued).kind).toBe("evaluated");
  });

  it("denies a config value nested over 64 deep (SF-3)", () => {
    const nest = (depth: number): unknown =>
      depth === 0 ? 1 : [nest(depth - 1)];
    const deep = run("config.set", set("ui.theme", nest(100)));
    expect(deep).toMatchObject(invalid);
    expect(run("config.set", set("ui.theme", nest(64))).kind).toBe("evaluated");
  });

  it.each([
    [{ "10": 1, "9": 2 }, '{"10":1,"9":2}'],
    [
      JSON.parse('{"b":[{"__proto__":1,"a":[2,{"z":0,"10":3}]}],"a":null}'),
      '{"a":null,"b":[{"__proto__":1,"a":[2,{"10":3,"z":0}]}]}',
    ],
  ])("shows %j with keys in UTF-16 order (SF-4)", (value, json) => {
    expect(run("config.set", set("ui.theme", value)).target?.detail).toBe(json);
  });

  it.each(["*", ":(glob)**", ":!x", "src/a?.ts", "src/[a].ts", "src\\a.ts"])(
    "denies committing %j, which git reads as pathspec magic (SF-5)",
    (path) => {
      const result = run("commit", commit(branch, "src/a.ts", path));
      expect(result).toMatchObject(invalid);
      expect(result.reason).toMatch(/pathspec magic/);
    },
  );

  it("carries a commit's resolved worktree-relative paths, frozen (SF-5, N1)", () => {
    const input = commit(branch, "src/a.ts", "/workspace/src/pkg.json", ".");
    const committed = run("commit", input);
    expect(committed.paths).toEqual(["src/a.ts", "src/pkg.json", "."]);
    expect(run("fs.edit", p("src/a.ts")).paths).toBeUndefined();
    const { target, paths, input: ruled } = committed;
    for (const part of [committed, target, paths, ruled, run("shell", {})]) {
      expect(Object.isFrozen(part)).toBe(true);
    }
  });
});

// N-4: private-use and unassigned code points, and stacked combining marks, are escaped.
describe("displayText", () => {
  it.each([
    ["a\u{e000}b", "a\\u{e000}b"],
    ["\u{10fffd}\u0378", "\\u{10fffd}\\u{378}"],
    ["e\u0301\u0302", "e\u0301\u0302"],
    [
      "e\u0301\u0302\u0303\u0304 o\u0308",
      "e\u0301\u0302\\u{303}\\u{304} o\u0308",
    ],
  ])("shows %j as %j", (text, shown) => {
    expect(displayText(text)).toBe(shown);
  });
});
