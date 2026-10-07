import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  validatePermissionPolicy,
  type PermissionPolicy,
} from "@helmwright/schema";
import type { PermissionVerdict } from "../../src/index.ts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
} from "../../src/index.ts";

let worktree: string;
beforeAll(() => {
  worktree = join(mkdtempSync(join(tmpdir(), "helmwright-policy-")), "wt");
  mkdirSync(join(worktree, "src", "gh", "workflows"), { recursive: true });
  mkdirSync(join(worktree, "hsrc", "loop"), { recursive: true });
  mkdirSync(join(worktree, "packages", "harness"), { recursive: true });
  mkdirSync(join(worktree, "foo", "evals"), { recursive: true });
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
    ["commit", commit("x/" + "a".repeat(255), "a"), "ask", "default.ask"],
    ["commit", commit("refs/tags/v1", "src/a.ts"), "ask", "default.ask"],
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
    const request = { action: "fs.edit", input: p("/workspace/./src/a.ts") };
    const { target } = evaluate(BASE, { ...request, worktree, runId: "r" });
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
    evaluate(BASE, {
      action: "fs.edit",
      input,
      worktree,
      runId: "run_01",
      ...extra,
    });
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
        const request = { action: "commit", input: { ref: branch, paths } };
        return evaluate(BASE, { ...request, worktree, runId: "run_01" });
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
        const request = { action: "execute", input: { argv }, runId: "r" };
        return evaluate(BASE, { ...request, worktree });
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
    const request = { action: "dep\u202eloy\u0007", input: {}, runId: "r" };
    const { tier, reason } = evaluate(BASE, { ...request, worktree });
    expect(tier).toBe("deny");
    expect(reason).not.toContain("\u202e");
    expect(reason).not.toContain("\u0007");
    expect(reason).toContain("\\u{202e}");
  });

  it("keeps fs error text, which may name the worktree, out of the reason (N3)", () => {
    const request = { action: "fs.read", input: p("a"), runId: "r" };
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
      const request = { action: "push", input, worktree, runId: "r" };
      const { tier, target } = evaluate(BASE, request);
      expect(tier).toBe("alwaysAsk");
      expect(target?.value).toBe("origin refs/heads/main");
    },
  );
});

describe("targets show the payload (S3)", () => {
  const target = (action: string, input: unknown) =>
    evaluate(BASE, { action, input, worktree, runId: "r" }).target;

  it("shows the spend cap", () => {
    expect(target("spend.raiseCap", { capUsd: 50 })).toEqual({
      kind: "setting",
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
    const extraRing0Paths = ring0LinkTargets(worktree, RING0_PATHS);
    expect(extraRing0Paths).toEqual(
      expect.arrayContaining(["hsrc/**", "foo/**"]),
    );
    const run = { worktree, runId: "run_01" };
    for (const [action, input] of [
      ["fs.edit", p("hsrc/loop/x.ts")],
      ["commit", commit(branch, "hsrc/loop/x.ts")],
      ["fs.edit", p("foo/evals/x.json")],
    ] as const) {
      expect(evaluate(BASE, { ...run, action, input }).tier).toBe("allow");
      expect(
        evaluate(BASE, { ...run, action, input, extraRing0Paths }),
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
    const extraRing0Paths = [glob];
    expect(
      evaluate(BASE, { ...request, runId: "r", extraRing0Paths }).tier,
    ).toBe("deny");
  });

  it("accepts a 128-character extra Ring 0 glob", () => {
    const request = { action: "fs.read", input: p("src/a.ts"), worktree };
    const extraRing0Paths = ["a".repeat(128), "**"];
    expect(
      evaluate(BASE, { ...request, runId: "r", extraRing0Paths }).tier,
    ).toBe("allow");
  });

  it("treats the run's extra Ring 0 paths as Ring 0", () => {
    const extraRing0Paths = ring0LinkTargets(worktree, RING0_PATHS);
    const input = commit(branch, "src/pkg.json");
    const request = { action: "commit", input, worktree, runId: "run_01" };
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
  /** A fresh worktree with a config directory and the given links. */
  const tree = (name: string, links: [string, string][]) => {
    const wt = join(dir, name);
    mkdirSync(join(wt, "config"), { recursive: true });
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
    const extraRing0Paths = ring0LinkTargets(wt, RING0_PATHS);
    expect([...extraRing0Paths].sort()).toEqual(["a/**", "config/pkg.json/**"]);
    rmSync(join(wt, "a"));
    writeFileSync(join(wt, "a"), "");
    const request = { action: "commit", input: commit(branch, "a") };
    const run = { ...request, worktree: wt, runId: "run_01" };
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
    const extraRing0Paths = ring0LinkTargets(wt, RING0_PATHS);
    expect([...extraRing0Paths].sort()).toEqual([
      "d/**",
      "sub/config/pkg.json/**",
    ]);
    const run = { worktree: wt, runId: "run_01" };
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

  it("maps an absolute target under /workspace onto the worktree (SF-B)", () => {
    const wt = tree("f", [["packages/harness/src", "/workspace/hsrc"]]);
    mkdirSync(join(wt, "hsrc", "loop"), { recursive: true });
    const extraRing0Paths = ring0LinkTargets(wt, RING0_PATHS);
    expect(extraRing0Paths).toEqual(["hsrc/**"]);
    const input = p("hsrc/loop/x.ts");
    const run = { action: "fs.edit", input, worktree: wt, runId: "run_01" };
    expect(evaluate(BASE, run).tier).toBe("allow");
    expect(evaluate(BASE, { ...run, extraRing0Paths })).toMatchObject({
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

  it("throws on a link loop rather than walking it", () => {
    const wt = tree("d", [
      ["package.json", "l1"],
      ["l1", "l2"],
      ["l2", "l1"],
    ]);
    expect(() => ring0LinkTargets(wt, RING0_PATHS)).toThrow();
  });
});
