import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONFIG_DEFAULTS, RING0_CONFIG_KEYS } from "@helmwright/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONFIG_FILE,
  ConfigError,
  DEFAULT_PERMISSION_POLICY,
  RING0_SETTINGS,
  canonicalJson,
  loadRunConfig,
  runGit,
} from "../../src/index.ts";

// Real git in a temp repo; no Docker. The CLI path is covered in test/e2e/cli.test.ts.
let repo: string;

function git(...args: string[]): void {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
}

function commit(write: (path: string) => void): void {
  rmSync(join(repo, CONFIG_FILE), { recursive: true, force: true });
  write(join(repo, CONFIG_FILE));
  git("add", "-A");
  git(
    ...["-c", "user.name=t", "-c", "user.email=t@example.com"],
    ...["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "c"],
  );
}

const file = (text: string | Uint8Array) => (path: string) => {
  writeFileSync(path, text);
};

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "hw-config-"));
  git("init", "--quiet");
  commit(file("{}"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(repo, { recursive: true, force: true });
});

const sha256 = (text: string) =>
  createHash("sha256").update(text).digest("hex");
const thrown = (act: () => unknown): unknown => {
  try {
    act();
  } catch (error) {
    return error;
  }
  return undefined;
};

describe("runGit", () => {
  // A fake git first on PATH prints its argv and its GIT_* environment, or hangs.
  beforeEach(() => {
    const bin = join(repo, "bin");
    mkdirSync(bin);
    writeFileSync(
      join(bin, "git"),
      '#!/bin/sh\n[ "$HW_FAKE_GIT" = hang ] && exec sleep 10\nprintf "%s\\n" "$@"\nenv | grep "^GIT_" | sort\n',
      { mode: 0o755 },
    );
    vi.stubEnv("PATH", `${bin}:${process.env["PATH"] ?? ""}`);
  });

  it("scrubs GIT_* from the environment and pins the safety options", () => {
    vi.stubEnv("GIT_DIR", "/elsewhere/.git");
    vi.stubEnv("GIT_CONFIG_PARAMETERS", "'core.hooksPath'='/tmp/hooks'");
    vi.stubEnv("GIT_CONFIG_COUNT", "1");
    const out = runGit("/r", ["ls-tree", "HEAD"]).toString("utf8");
    expect(out.trimEnd().split("\n")).toEqual([
      ...["-C", "/r", "-c", "core.hooksPath=/dev/null"],
      ...["-c", "core.fsmonitor=false", "-c", "filter.lfs.smudge="],
      ...["-c", "filter.lfs.process=", "-c", "filter.lfs.required=false"],
      ...["--no-replace-objects", "ls-tree", "HEAD"],
      "GIT_CONFIG_NOSYSTEM=1",
      "GIT_LFS_SKIP_SMUDGE=1",
      "GIT_NO_LAZY_FETCH=1",
      "GIT_NO_REPLACE_OBJECTS=1",
      "GIT_TERMINAL_PROMPT=0",
    ]);
  });

  it("fails closed with a fixed message on a timeout", () => {
    vi.stubEnv("HW_FAKE_GIT", "hang");
    expect(() => runGit("/r", ["status"], { timeoutMs: 300 })).toThrow(
      /^git status timed out after 300 ms$/,
    );
  });
});

describe("loadRunConfig", () => {
  it("tags the Ring 0 digest with its format", () => {
    const ring0 = {
      format: "ring0/v1",
      "intake.classification": "rubric",
      permissions: {
        ...CONFIG_DEFAULTS.permissions,
        policy: DEFAULT_PERMISSION_POLICY,
      },
    };
    expect(loadRunConfig(repo).record.ring0Sha256).toBe(
      sha256(canonicalJson(ring0)),
    );
  });

  it("gives a ConfigError no cause (N3)", () => {
    const relax = {
      ...DEFAULT_PERMISSION_POLICY,
      version: "lax-1",
      alwaysAsk: ["push"],
    };
    commit(file(JSON.stringify({ permissions: { policy: relax } })));
    const relaxed = thrown(() => loadRunConfig(repo)) as ConfigError;
    expect(relaxed).toBeInstanceOf(ConfigError);
    expect(relaxed.message).toContain("override relaxes alwaysAsk");
    expect(relaxed.cause).toBeUndefined();
    rmSync(join(repo, ".git"), { recursive: true });
    git("init", "--quiet");
    const empty = thrown(() => loadRunConfig(repo)) as ConfigError;
    expect(empty).toBeInstanceOf(ConfigError);
    expect(empty.message).toBe("task.repo has no commit at HEAD");
    expect(empty.cause).toBeUndefined();
  });

  it("names each Ring 0 config key as a Ring 0 setting of the policy", () => {
    for (const key of RING0_CONFIG_KEYS) expect(RING0_SETTINGS).toContain(key);
    for (const key of RING0_CONFIG_KEYS) {
      expect(DEFAULT_PERMISSION_POLICY.ring0Settings).toContain(key);
    }
  });

  it("hashes the canonical defaults without a file", () => {
    git("rm", "--quiet", CONFIG_FILE);
    git(
      ...["-c", "user.name=t", "-c", "user.email=t@example.com"],
      ...["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "rm"],
    );
    const { record, policy } = loadRunConfig(repo);
    expect(policy).toBe(DEFAULT_PERMISSION_POLICY);
    const sha = sha256(canonicalJson(CONFIG_DEFAULTS));
    expect(record).toMatchObject({ source: "default", sha256: sha });
    // An empty file object is the same Ring 0 configuration.
    commit(file("{}"));
    expect(loadRunConfig(repo).record).toMatchObject({
      source: "file",
      ring0Sha256: record.ring0Sha256,
    });
  });

  it.each([
    [
      "invalid UTF-8",
      file(new Uint8Array([0x7b, 0xff, 0x7d])),
      "is not valid UTF-8",
    ],
    ["a byte order mark", file("﻿{}"), "is not valid JSON"],
    [
      "a duplicate key nested in an array",
      file('{"permissions": {"policy": {"rules": [{"id": 1, "id": 2}]}}}'),
      'duplicate key "id"',
    ],
    [
      "an escaped __proto__ key",
      file('{"permissions": {"policy": {"\\u005f_proto__": 1}}}'),
      'forbidden key "__proto__"',
    ],
    [
      "a constructor key",
      file('{"constructor": 1}'),
      'forbidden key "constructor"',
    ],
    [
      "a nested prototype key",
      file('{"intake": {"prototype": "x"}}'),
      'forbidden key "prototype"',
    ],
    [
      "a directory",
      (path: string) => {
        mkdirSync(path);
        writeFileSync(join(path, "x"), "{}");
      },
      "must be a regular file (git mode 100644), not a directory (040000)",
    ],
  ])("refuses %s", (_, write, problem) => {
    commit(write);
    expect(() => loadRunConfig(repo)).toThrow(ConfigError);
    expect(() => loadRunConfig(repo)).toThrow(`${CONFIG_FILE}: ${problem}`);
  });

  it("refuses an executable file", () => {
    git("update-index", "--chmod=+x", CONFIG_FILE);
    git(
      ...["-c", "user.name=t", "-c", "user.email=t@example.com"],
      ...["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "x"],
    );
    expect(() => loadRunConfig(repo)).toThrow(
      "not an executable file (100755)",
    );
  });

  it("accepts one key in sibling objects", () => {
    // Every rule has an "id"; the default policy under a new version resolves.
    const policy = { ...DEFAULT_PERMISSION_POLICY, version: "strict-1" };
    const text = JSON.stringify({ permissions: { policy } }, null, 1);
    commit(file(text));
    expect(loadRunConfig(repo).policy.version).toBe(policy.version);
  });
});
