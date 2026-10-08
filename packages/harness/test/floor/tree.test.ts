import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
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
import { requireGitVersion } from "../../src/floor/tree.ts";

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
  checkCandidate({ worktree: wt, commonDir: common }, base, [], limits);
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

  it("refuses a base that is not a full object ID", () => {
    expect(() =>
      candidateChanges({ worktree: wt, commonDir: common }, "HEAD"),
    ).toThrow("base commit must be a full object ID");
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
