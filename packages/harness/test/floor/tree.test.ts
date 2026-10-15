import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FloorError,
  candidateChanges,
  checkCandidate,
  type FloorLimits,
} from "../../src/index.ts";
import type { FloorChange } from "../../src/floor/rules.ts";
import {
  changedLockfiles,
  floorSignalled,
  requireGitVersion,
} from "../../src/floor/tree.ts";

// Real git in temp repos; the candidate is a linked worktree, as in a run.
const MARK = "// @ts-" + "ignore\n";
let root: string;
let repo: string;
let common: string;
let wt: string;
let base: string;
let writer: ChildProcess | undefined;

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}
const user = ["-c", "user.name=t", "-c", "user.email=t@example.com"];
const commit = (cwd: string, ...paths: string[]) => {
  git(cwd, "add", ...(paths.length ? paths : ["-A"]));
  git(cwd, ...user, "-c", "commit.gpgsign=false", "commit", "-qm", "c");
};
function write(path: string, text: string) {
  mkdirSync(dirname(join(wt, path)), { recursive: true });
  writeFileSync(join(wt, path), text);
}

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "hw-floor-")));
  repo = join(root, "repo");
  mkdirSync(join(repo, "src"), { recursive: true });
  git(repo, "init", "--quiet");
  writeFileSync(join(repo, ".gitignore"), "ignored/\n*.log\n");
  writeFileSync(join(repo, "src", "a.ts"), "export const a = 1;\n");
  commit(repo);
  base = git(repo, "rev-parse", "HEAD");
  common = realpathSync(join(repo, ".git"));
  wt = join(root, "wt");
  git(repo, "worktree", "add", "--quiet", "--detach", wt, base);
});

afterEach(() => {
  writer?.kill("SIGKILL");
  writer = undefined;
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

const changes = (limits?: FloorLimits) =>
  candidateChanges({ worktree: wt, commonDir: common }, base, limits);
const checked = (limits?: FloorLimits) =>
  checkCandidate({ worktree: wt, commonDir: common }, base, [], limits).checked;
const paths = () => changes().changes.map((c) => c.path);
const rules = () => checked().findings.map((f) => [f.rule, f.path]);

// Each check runs about 12 git processes; the suite runs files in parallel.
describe("candidateChanges", { timeout: 30_000 }, () => {
  it("passes an unchanged worktree with the base's tree", () => {
    const result = checked();
    expect(result.candidateTree).toBe(git(repo, "rev-parse", "HEAD^{tree}"));
    expect([result.verdict, result.findings]).toEqual(["pass", []]);
  });

  it("includes untracked and committed files, not ignored ones", () => {
    write("src/new.ts", MARK);
    write("ignored/x.ts", MARK);
    write("ignored/sub/.gitignore", "*\n");
    write("src/a.log", MARK);
    write("src/c.ts", "c\n");
    commit(wt, "src/c.ts");
    expect(paths()).toEqual(["src/c.ts", "src/new.ts"]);
    expect(rules()).toEqual([["suppression.added", "src/new.ts"]]);
    git(wt, "switch", "--quiet", "-c", "run");
    write("src/d.ts", "d\n");
    commit(wt, "src/d.ts");
    expect(paths()).toEqual(["src/c.ts", "src/d.ts", "src/new.ts"]);
  });

  it("reports a symlink from its git object, without following it", () => {
    symlinkSync("/etc/passwd", join(wt, "src", "link"));
    const [change] = changes().changes;
    expect(change).toMatchObject({ path: "src/link", candidateMode: "120000" });
    expect(change?.candidate).toBeUndefined();
    expect(rules()).toEqual([["symlink.added", "src/link"]]);
  });

  it("finds a changed .gitignore and an ignored one, also in a new directory", () => {
    write(".gitignore", "ignored/\n*.log\nsrc/new.ts\n");
    write("src/new.ts", MARK);
    expect(rules()).toEqual([["config.changed", ".gitignore"]]);
    write(".gitignore", "ignored/\n*.log\n");
    write("src/.gitignore", "*\n");
    expect(paths()).toEqual([]);
    expect(rules()).toEqual([["config.changed", "src/.gitignore"]]);
    for (const name of [".gitignore", "new.ts"]) rmSync(join(wt, "src", name));
    write("d/.gitignore", "*\n");
    write("d/e/x.ts", MARK);
    expect(paths()).toEqual([]);
    expect(rules()).toEqual([["config.changed", "d/.gitignore"]]);
    // R1: a name that is pathspec magic is matched literally, not parsed.
    rmSync(join(wt, "d"), { recursive: true });
    write(":(top)x/.gitignore", "*\n");
    write(":(top)x/e/y.ts", MARK);
    write(":(attr:a)y/.gitignore", "*\n");
    expect(paths()).toEqual([]);
    expect(rules()).toEqual([
      ["config.changed", ":(attr:a)y/.gitignore"],
      ["config.changed", ":(top)x/.gitignore"],
    ]);
  });

  it.each([
    [{ files: 1, bytes: 1_000_000 }, "over 1 changed files"],
    [{ files: 10, bytes: 600 }, "over 600 bytes read"],
  ])("fails closed past %j", (limits, detail) => {
    write("src/b.ts", "b".repeat(400));
    write("src/c.ts", "c".repeat(400));
    const result = checked(limits);
    expect(result.verdict).toBe("reject");
    expect(result.findings).toEqual([
      { rule: "floor.limits", path: "src/c.ts", detail },
    ]);
  });

  it("fails closed when the change list is over the byte limit", () => {
    write("src/b.ts", "b\n");
    expect(checked({ files: 10, bytes: 50 }).findings).toEqual([
      { rule: "floor.limits", detail: "change list over the byte limit" },
    ]);
  });

  it("runs no hook, fsmonitor or candidate-selected filter", () => {
    const marker = join(root, "marker");
    const script = join(root, "touch.sh");
    writeFileSync(script, `#!/bin/sh\ntouch '${marker}'\ncat\n`);
    chmodSync(script, 0o755);
    const hooks = join(root, "hooks");
    mkdirSync(hooks);
    for (const hook of ["post-index-change", "pre-commit"]) {
      writeFileSync(join(hooks, hook), `#!/bin/sh\ntouch '${marker}'\n`);
      chmodSync(join(hooks, hook), 0o755);
    }
    const trap = [
      ["core.hooksPath", hooks],
      ["core.fsmonitor", script],
      ["filter.trap.clean", script],
    ];
    // In both the repo's and the user's global config.
    vi.stubEnv("HOME", root);
    for (const [key = "", value = ""] of trap) {
      git(repo, "config", key, value);
      git(root, "config", "--file", join(root, ".gitconfig"), key, value);
    }
    write(".gitattributes", "* filter=trap\n");
    write("src/b.ts", "b\n");
    expect(rules()).toEqual([["config.changed", ".gitattributes"]]);
    expect(existsSync(marker)).toBe(false);
    // Control: the same tree through plain git runs the trap.
    git(wt, "add", "-A");
    expect(existsSync(marker)).toBe(true);
  });

  it("reads only manifests and lockfiles with select (A-dep-4, OQ-AD4-3)", () => {
    write("app/package.json", '{"dependencies":{"a":"1"}}\n');
    write("pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
    write("node_modules/x/package.json", "{}\n");
    write("d/.gitignore", "*\n");
    write("d/e/x.ts", MARK);
    write("src/big.ts", "x".repeat(4000));
    const repoOf = { worktree: wt, commonDir: common };
    const small = { files: 2000, bytes: 2000 };
    const select = { select: true };
    const picked = candidateChanges(repoOf, base, small, select);
    expect(picked.changes.map((c) => c.path)).toEqual([
      "app/package.json",
      "pnpm-lock.yaml",
    ]);
    // No blob but those is read, and no ignored-file or config-chain finding is made.
    expect([picked.findings, [...picked.chain]]).toEqual([[], []]);
    const all = changes();
    expect(picked.candidateTree).toBe(all.candidateTree);
    const kept = new Set(["app/package.json", "pnpm-lock.yaml"]);
    expect(picked.changes).toEqual(all.changes.filter((c) => kept.has(c.path)));
    expect(all.findings.map((f) => f.rule)).toContain("config.changed");
    expect(changes(small).findings.map((f) => f.rule)).toContain(
      "floor.limits",
    );
    // Every changed path still counts toward the file limit.
    const one = candidateChanges(repoOf, base, { ...small, files: 1 }, select);
    expect(one.findings).toEqual([
      {
        rule: "floor.limits",
        path: "node_modules/x/package.json",
        detail: "over 1 changed files",
      },
    ]);
  });

  it("refuses a base that is not a full object ID", () => {
    expect(() =>
      candidateChanges({ worktree: wt, commonDir: common }, "HEAD"),
    ).toThrow("base commit must be a full object ID");
  });
});

/** Commits `files` in the repo as the new base and moves the worktree to it. */
function rebase(files: Record<string, string>) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  }
  commit(repo);
  base = git(repo, "rev-parse", "HEAD");
  git(wt, "checkout", "--quiet", "--detach", base);
}
const details = () => checked().findings.map((f) => [f.rule, f.path, f.detail]);

describe("config chains from the base commit (S3)", { timeout: 30_000 }, () => {
  it("finds a change to a file a base tsconfig extends or references", () => {
    rebase({
      "tsconfig.json": [
        "{",
        '  // a comment with "extends": "./not/this.json"',
        '  "extends": ["./cfg/base.json"], /* and "./nor/this.json" */',
        '  "include": ["./src"],',
        '  "references": [{ "path": "./pkg" }, { "path": "../outside" },],',
        "}",
      ].join("\n"),
      "cfg/base.json": '{ "extends": "../cfg2/root", "files": ["./x.ts"] }',
      "cfg2/root.json": "{}",
      "pkg/tsconfig.json": "{}",
      "not/this.json": "{}",
    });
    write("src/a.ts", "export const a = 2;\n");
    write("not/this.json", "{ }");
    expect(details()).toEqual([]);
    write("cfg/base.json", '{ "extends": "../cfg2/root" }');
    write("cfg2/root.json", "{ }");
    expect(details()).toEqual([
      ["config.changed", "cfg/base.json", "config chain"],
      ["config.changed", "cfg2/root.json", "config chain"],
    ]);
  });

  it("finds a change to a module a base eslint or vitest config imports", () => {
    rebase({
      "eslint.config.js": 'import rules from "./lint/rules.js";\n',
      "lint/rules.js": "export * from '../lint2/more.mjs';\n",
      "lint2/more.mjs": "export const x = 1;\n",
      "pkg/vitest.config.ts":
        'export default { setupFiles: ["./setup.ts"] };\n',
    });
    write("lint/rules.js", "export const rules = {};\n");
    write("lint2/more.mjs", "export const x = 2;\n");
    write("pkg/setup.ts", "export {};\n");
    expect(details()).toEqual([
      ["config.changed", "lint/rules.js", "config chain"],
      ["config.changed", "lint2/more.mjs", "config chain"],
      ["config.changed", "pkg/setup.ts", "config chain"],
    ]);
  });
});

describe("config chain review fixes", { timeout: 30_000 }, () => {
  it("finds a change to an extensionless module a base config imports (F3)", () => {
    const more = ["a", "b", "c", "d", "e"];
    rebase({
      "vitest.config.ts":
        'import shared from "./vitest.shared";\nexport default shared;\n',
      "vitest.shared.ts": "export default {};\n",
      "eslint.config.js": [
        'export { default } from "./eslint/base";',
        ...more.map((m) => `import "./lint/${m}";`),
      ].join("\n"),
      "eslint/base/index.js": "export default [];\n",
      ...Object.fromEntries(more.map((m) => [`lint/${m}.ts`, "export {};\n"])),
    });
    write("vitest.shared.ts", "export default { x: 1 };\n");
    write("eslint/base/index.js", "export default [1];\n");
    // A file Vite would resolve before the base's own is in the chain too.
    write("vitest.shared.mjs", "export default {};\n");
    expect(details()).toEqual([
      ["config.changed", "eslint/base/index.js", "config chain"],
      ["config.changed", "vitest.shared.mjs", "config chain"],
      ["config.changed", "vitest.shared.ts", "config chain"],
    ]);
  });

  it("follows no link from a tsconfig that extends a directory (F6c)", () => {
    rebase({
      "tsconfig.json": '{ "extends": "./" }',
      "pkg/tsconfig.json": '{ "extends": "../" }',
    });
    write("src/a.ts", "export const a = 2;\n");
    expect(details()).toEqual([]);
  });

  it("fails closed past the chain's path and read bounds (F6d)", () => {
    const many = Array.from({ length: 65 }, (_, i) => `"./c/${String(i)}.js"`);
    rebase({
      "eslint.config.js": "export default [" + many.join(",") + "];\n",
    });
    expect(details()).toEqual([
      ["floor.limits", undefined, "config chain over 64 paths"],
    ]);
    rebase({
      "eslint.config.js": "export default [];\n",
      ...Object.fromEntries(
        Array.from({ length: 129 }, (_, i) => [
          `p${String(i)}/tsconfig.json`,
          "{}",
        ]),
      ),
    });
    expect(details()).toEqual([
      ["floor.limits", undefined, "config chain over 128 files read"],
    ]);
  });
});

describe("config chain second review fixes", { timeout: 30_000 }, () => {
  it.each([
    ["./shared.js", "shared.ts", "shared.ts"],
    ["./shared.js", "shared.js", "shared.ts"],
    ["./data", "data.json", "data.json"],
  ])("finds a change chained by %j with base %j: %j", (rel, inBase, edit) => {
    rebase({
      "vitest.config.ts": `import s from "${rel}";\n`,
      [inBase]: "export default {};\n",
    });
    write(edit, "export default { x: 1 };\n");
    expect(details()).toEqual([["config.changed", edit, "config chain"]]);
  });

  it("counts no guess toward the path bound", () => {
    const names = ["a", "b", "c", "d", "e"];
    rebase({
      "eslint.config.js": names.map((n) => `import "./lint/${n}";`).join("\n"),
      ...Object.fromEntries(names.map((n) => [`lint/${n}.ts`, "export {};\n"])),
    });
    expect(changes().chain.size).toBe(90);
    expect(details()).toEqual([]);
  });
});

describe("floor-4 config chain fixes", { timeout: 30_000 }, () => {
  it.each([
    ["./shared.JS", "shared.ts"],
    ["./Shared.Mjs", "Shared.mts"],
  ])("finds a change chained by %j with base %j", (rel, inBase) => {
    rebase({
      "vitest.config.ts": `import s from "${rel}";\n`,
      [inBase]: "export default {};\n",
    });
    write(inBase, "export default { x: 1 };\n");
    expect(details()).toEqual([["config.changed", inBase, "config chain"]]);
  });

  it("counts a .js literal whose TS sibling is in the base as a guess", () => {
    const names = Array.from({ length: 40 }, (_, i) => "n" + String(i));
    rebase({
      "eslint.config.js": names
        .map((n) => `import "./lint/${n}.js";`)
        .join("\n"),
      ...Object.fromEntries(names.map((n) => [`lint/${n}.ts`, "export {};\n"])),
    });
    expect(details()).toEqual([]);
    write("lint/n0.ts", "export const x = 1;\n");
    expect(details()).toEqual([
      ["config.changed", "lint/n0.ts", "config chain"],
    ]);
  });
});

describe("ignored agent and config files (S4)", { timeout: 30_000 }, () => {
  it("finds ignored agent files and config-named files, not build caches", () => {
    writeFileSync(
      join(common, "info", "exclude"),
      [".claude/", "CLAUDE.md", "AGENTS.md", ".npmrc", "node_modules/"]
        .concat(["*.tsbuildinfo", ".eslintcache", "local/"])
        .join("\n") + "\n",
    );
    write("node_modules/.bin/tsc", "x");
    write("node_modules/x/tsconfig.json", "{}");
    write("pkg/a.tsbuildinfo", "x");
    write(".eslintcache", "x");
    expect(details()).toEqual([]);
    write(".claude/settings.json", "{}");
    write("CLAUDE.md", "x");
    write("pkg/AGENTS.md", "x");
    write(".npmrc", "x");
    write("local/tsconfig.json", "{}");
    expect(paths()).toEqual([]);
    expect(details()).toEqual([
      ["config.changed", ".claude", "ignored"],
      ["config.changed", ".npmrc", "ignored"],
      ["config.changed", "CLAUDE.md", "ignored"],
      ["config.changed", "pkg/AGENTS.md", "ignored"],
    ]);
  });
});

describe("trusted git dirs (B1)", { timeout: 30_000 }, () => {
  it("refuses a gitfile that points elsewhere", () => {
    // A crafted git dir inside the worktree whose info/exclude hides a file.
    const crafted = join(wt, "node_modules", ".x");
    git(root, "init", "--quiet", "--bare", crafted);
    writeFileSync(
      join(crafted, "objects", "info", "alternates"),
      join(common, "objects") + "\n",
    );
    mkdirSync(join(crafted, "info"), { recursive: true });
    writeFileSync(
      join(crafted, "info", "exclude"),
      "src/hidden.ts\nnode_modules/\n",
    );
    writeFileSync(join(crafted, "HEAD"), base + "\n");
    write("src/hidden.ts", MARK);
    write(".git", "gitdir: node_modules/.x\n");
    expect(changes).toThrow(FloorError);
  });

  it("refuses a .git that is a symlink", () => {
    const gitfile = join(root, "gitfile");
    writeFileSync(gitfile, "gitdir: " + join(common, "worktrees", "wt") + "\n");
    rmSync(join(wt, ".git"));
    symlinkSync(gitfile, join(wt, ".git"));
    expect(changes).toThrow(FloorError);
  });

  it("refuses a worktree that is not linked to the common dir", () => {
    const other = join(root, "other");
    git(root, "init", "--quiet", other);
    const call = () =>
      candidateChanges({ worktree: wt, commonDir: join(other, ".git") }, base);
    expect(call).toThrow(FloorError);
  });

  it("refuses a relative worktree path (N3)", () => {
    const call = () =>
      candidateChanges({ worktree: "wt", commonDir: common }, base);
    expect(call).toThrow("worktree and common git dir must be absolute paths");
  });

  it("refuses an info/exclude that is a FIFO, without waiting", () => {
    const exclude = join(common, "info", "exclude");
    rmSync(exclude, { force: true });
    spawnSync("mkfifo", [exclude]);
    // A writer that ends a blocking read after 2 s, so an unsafe reader cannot hang the test.
    writer = spawn("sh", ["-c", "sleep 2; : > '" + exclude + "'"], {
      stdio: "ignore",
    });
    const start = Date.now();
    expect(changes).toThrow(FloorError);
    expect(Date.now() - start).toBeLessThan(1500);
  }, 10_000);

  it.each([
    ["a regular file", "regular"],
    ["/dev/zero", "/dev/zero"],
  ])("refuses an info/exclude that is a symlink to %s", (_, target) => {
    const exclude = join(common, "info", "exclude");
    const file = join(root, "exclude");
    writeFileSync(file, "src/hidden.ts\n");
    rmSync(exclude, { force: true });
    symlinkSync(target === "regular" ? file : target, exclude);
    expect(changes).toThrow(FloorError);
  });

  it("requires git 2.40 or later (N2)", () => {
    const check = (text: string) => () => {
      requireGitVersion(text);
    };
    expect(check("git version 2.39.5")).toThrow(
      "git 2.40 or later is required",
    );
    expect(check("version unknown")).toThrow(FloorError);
    expect(check("git version 2.40.0")).not.toThrow();
    expect(check("git version 3.0.1 (x)")).not.toThrow();
  });
});

describe("git failures (SF-3)", { timeout: 30_000 }, () => {
  it("names only the git subcommand and exit status, never a path", () => {
    const [id = ""] = readdirSync(join(common, "worktrees"));
    writeFileSync(join(common, "worktrees", id, "HEAD"), "1".repeat(40) + "\n");
    let error: unknown;
    try {
      checked();
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(FloorError);
    expect((error as Error).message).toBe("git rev-parse failed (exit 128)");
  });
});

// A-dep: the final floor.signalled and the Brief's lockfiles, over plain changes.
const bytes = (text: string) => new TextEncoder().encode(text);
const manifest = (path: string, from: object, to: object): FloorChange => ({
  ...{ path, baseMode: "100644", candidateMode: "100644" },
  base: bytes(JSON.stringify(from)),
  candidate: bytes(JSON.stringify(to)),
});
const lockfile = (path: string): FloorChange => ({
  ...{ path, baseMode: "100644", candidateMode: "100644" },
  ...{ base: bytes("a"), candidate: bytes("b") },
});
const OID = "a".repeat(40);
const signalsOf = (changes: readonly FloorChange[]) =>
  floorSignalled("evt-1", OID, OID, "runtimeAddOrMajor", changes).signals;

describe("floorSignalled and changedLockfiles (A-dep)", () => {
  it("gives lockfile.only for a manifest change that touches no dependency field", () => {
    const changes = [
      manifest("package.json", { name: "a" }, { name: "b" }),
      lockfile("pnpm-lock.yaml"),
    ];
    const payload = floorSignalled(
      "evt-1",
      OID,
      "b".repeat(40),
      "runtimeAddOrMajor",
      changes,
    );
    expect(payload).toMatchObject({
      ...{ kind: "floor.signalled", detector: "dependency-1", phase: "final" },
      ...{ baseCommit: OID, candidateTree: "b".repeat(40) },
      materiality: {
        rubricVersion: "materiality-rubric-1",
        threshold: "runtimeAddOrMajor",
      },
    });
    expect(payload.signals).toEqual([
      { id: "evt-1:0", type: "lockfile.only", path: "pnpm-lock.yaml" },
    ]);
    expect(changedLockfiles(changes)).toEqual(["pnpm-lock.yaml"]);
    expect(payload.lockfiles).toEqual(["pnpm-lock.yaml"]);
  });

  it("gives each of several lockfiles, sorted, with IDs in signal order", () => {
    const changes = ["web/yarn.lock", "app/package-lock.json", "bun.lock"].map(
      lockfile,
    );
    expect(signalsOf(changes)).toEqual([
      { id: "evt-1:0", type: "lockfile.only", path: "app/package-lock.json" },
      { id: "evt-1:1", type: "lockfile.only", path: "bun.lock" },
      { id: "evt-1:2", type: "lockfile.only", path: "web/yarn.lock" },
    ]);
  });

  it("skips a lockfile under node_modules", () => {
    const changes = [
      lockfile("node_modules/x/package-lock.json"),
      lockfile("a/node_modules/yarn.lock"),
      lockfile("pnpm-lock.yaml"),
    ];
    expect(signalsOf(changes).map((s) => s.path)).toEqual(["pnpm-lock.yaml"]);
    expect(changedLockfiles(changes)).toEqual(["pnpm-lock.yaml"]);
  });

  it("names the lockfiles of a dependency change, which give no lockfile.only", () => {
    const changes = [
      manifest("package.json", {}, { dependencies: { "left-pad": "^1.0.0" } }),
      lockfile("pnpm-lock.yaml"),
      lockfile("docs/\u001b/yarn.lock"),
    ];
    expect(signalsOf(changes).map((s) => s.type)).toEqual(["dependency.added"]);
    const shown = ["docs/\\u{1b}/yarn.lock", "pnpm-lock.yaml"];
    expect(changedLockfiles(changes)).toEqual(shown);
    // Logged, so replay recomputes each Brief's lockfile footprints.
    const payload = floorSignalled("e", OID, OID, "everySignal", changes);
    expect(payload.lockfiles).toEqual(shown);
  });

  it("logs the lockfiles sorted, and none for a change without one", () => {
    const changes = [
      manifest("package.json", {}, { dependencies: { a: "1" } }),
    ];
    const payload = floorSignalled("e", OID, OID, "everySignal", changes);
    expect(payload.lockfiles).toEqual([]);
    const several = ["web/yarn.lock", "bun.lock"].map(lockfile);
    const logged = floorSignalled("e", OID, OID, "everySignal", several);
    expect(logged.lockfiles).toEqual(["bun.lock", "web/yarn.lock"]);
  });

  it("gives an early payload, valid and otherwise the final one's (A-dep-4)", () => {
    const changes = [
      manifest("package.json", {}, { dependencies: { a: "1" } }),
    ];
    const final = floorSignalled("e", OID, OID, "everySignal", changes);
    // floorSignalled throws unless the payload is a valid floor event.
    const phase = "early";
    const early = floorSignalled("e", OID, OID, "everySignal", changes, phase);
    expect(early).toEqual({ ...final, phase: "early" });
  });

  it("fails closed past 256 changed lockfiles, with its own text", () => {
    const many = Array.from({ length: 257 }, (_, i) =>
      lockfile(String(i) + "/yarn.lock"),
    );
    const text = "more than 256 changed lockfiles";
    expect(() => changedLockfiles(many)).toThrow(new FloorError(text));
    // A dependency change gives no lockfile.only, so only the lockfiles' bound fires.
    const add = manifest("package.json", {}, { dependencies: { a: "1" } });
    const signalled = () =>
      floorSignalled("e", OID, OID, "everySignal", [add, ...many]);
    expect(signalled).toThrow(new FloorError(text));
    expect(changedLockfiles(many.slice(1))).toHaveLength(256);
  });
});
