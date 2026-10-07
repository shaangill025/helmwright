import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  isDependencyInstall,
  isInsideWorktree,
  isRing0Path,
  normalizeArgv,
  normalizeHost,
  normalizePath,
} from "../../src/index.ts";

let base: string;
let worktree: string;

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), "helmwright-normalize-"));
  worktree = join(base, "wt");
  mkdirSync(join(worktree, "src"), { recursive: true });
  mkdirSync(join(worktree, ".github", "workflows"), { recursive: true });
  mkdirSync(join(base, "outside"));
  const link = (target: string, name: string) => {
    symlinkSync(target, join(worktree, name));
  };
  link(join(base, "outside"), "escape");
  link(join(base, "outside", "new.txt"), "dangling");
  link(".github/workflows/new.yml", "to-ring0");
  link("loop-b", "loop-a");
  link("loop-a", "loop-b");
});

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

describe("normalizePath", () => {
  it.each([
    ["src/a.ts", true, "src/a.ts"],
    ["./src/../src/a.ts", true, "src/a.ts"],
    ["/workspace/src/a.ts", true, "src/a.ts"],
    ["/workspace/../workspace/src/a.ts", true, "src/a.ts"],
    ["//workspace/src", true, "src"],
    ["/workspace", false, ""],
    [".", false, ""],
    ["../outside/secret.txt", false, undefined],
    ["src/../../outside", false, undefined],
    ["/workspace/../etc/passwd", false, undefined],
    ["escape/secret.txt", false, undefined],
    ["dangling", false, undefined],
    [".git/config", false, ".git/config"],
    [".GIT/hooks/pre-commit", false, ".GIT/hooks/pre-commit"],
    ["src/.git/HEAD", false, "src/.git/HEAD"],
    ["to-ring0", true, ".github/workflows/new.yml"],
  ])("maps %j to inside %s, relative %j", (input, inside, relative) => {
    const n = normalizePath(input, worktree);
    expect({ inside: n.inside, relative: n.relative }).toEqual({
      inside,
      relative,
    });
  });

  it("composes NFC, so a decomposed name is the same file", () => {
    const { relative } = normalizePath("src/café.ts", worktree);
    expect(relative).toBe("src/café.ts");
  });

  it.each(["", "a\0b", "a\nb", "src/\u001b[31m", "a\u007fb", "a\u0085b"])(
    "rejects %j (empty, NUL or control characters)",
    (input) => {
      expect(() => normalizePath(input, worktree)).toThrow(TypeError);
    },
  );

  it("rejects a symlink loop", () => {
    expect(() => normalizePath("loop-a/x", worktree)).toThrow(TypeError);
  });
});

describe("isInsideWorktree", () => {
  it("is strict: the worktree itself and .git are not inside", () => {
    const inside = ["/w/a", "/w/.github/x"];
    const not = ["/w", "/w2/a", "/w/.git", "/w/.Git/config", "/w/a/.git/x"];
    for (const path of inside) expect(isInsideWorktree(path, "/w")).toBe(true);
    for (const path of not) expect(isInsideWorktree(path, "/w")).toBe(false);
  });
});

// Glob semantics only; the default Ring 0 list is tested with the policy (B9a-3).
describe("isRing0Path", () => {
  const globs = [
    ".github/**",
    "packages/harness/src/loop/**",
    "tsconfig*.json",
  ];

  it.each(
    `.github .GitHub/workflows/ci.yml packages/harness/src/Loop/x.ts
    TSCONFIG.base.json tsconfig.json`.split(/\s+/),
  )("matches %j, case-folded", (path) => {
    expect(isRing0Path(path, globs)).toBe(true);
  });

  it.each(
    `.githubx/a packages/harness/src/loopy/x.ts src/tsconfig.json
    packages/harness/src`.split(/\s+/),
  )("does not match %j", (path) => {
    expect(isRing0Path(path, globs)).toBe(false);
  });
});

describe("normalizeHost", () => {
  it.each([
    ["2852039166", "169.254.169.254"],
    ["0xA9FEA9FE", "169.254.169.254"],
    ["0251.0376.0251.0376", "169.254.169.254"],
    ["169.254.43518", "169.254.169.254"],
    ["0x7f.1", "127.0.0.1"],
    ["API.Anthropic.COM.", "api.anthropic.com"],
    ["bücher.de", "xn--bcher-kva.de"],
    ["[0:0:0:0:0:0:0:1]", "[::1]"],
  ])("normalizes %j to %j", (host, expected) => {
    expect(normalizeHost(host)).toBe(expected);
  });

  it.each([
    "",
    "evil.com/api.anthropic.com",
    "user@evil.com",
    "evil.com:443",
    "evil.com?x",
    "127%2E0%2E0%2E1",
    "exa mple.com",
    "a\0b",
    "256.1.1.1",
  ])("rejects %j", (host) => {
    expect(normalizeHost(host)).toBeUndefined();
  });
});

describe("argv normalization", () => {
  it.each([
    ...[
      "pnpm add x",
      "/usr/local/bin/npm install",
      "yarn",
      "bun add x",
      "pnpm --filter harness add x",
      "env FOO=1 pnpm add x",
      "env -i -u HOME -- npm ci",
      "FOO=1 BAR=2 yarn add x",
      "command -p nice -n 5 timeout -s KILL 30 pnpm i",
      "exec -a name npm install",
    ].map((line) => line.split(" ")),
    ["sh", "-c", "npm i x"],
    ["bash", "-lc", "cd sub && pnpm add x"],
    ["sh", "-c", "echo ok; 'npm' install|cat"],
    ["sh", "-c", "sh -c 'env A=1 npm i x'"],
  ])("treats %j as a dependency install", (...argv) => {
    expect(isDependencyInstall(argv)).toBe(true);
  });

  it.each([
    ["pnpm", "test"],
    ["npm", "run", "build"],
    ["grep", "-r", "npm install", "."],
    ["sh", "-c", "grep -r 'npm install' ."],
    ["echo", "pnpm", "add"],
    ["node", "install.js"],
  ])("does not treat %j as a dependency install", (...argv) => {
    expect(isDependencyInstall(argv)).toBe(false);
  });

  it("strips wrappers and splits shell scripts into commands", () => {
    const argv = ["env", "FOO=1", "/bin/sh", "-c", "a 1; b && c"];
    expect(normalizeArgv(argv)).toEqual([["a", "1"], ["b"], ["c"]]);
  });
});
