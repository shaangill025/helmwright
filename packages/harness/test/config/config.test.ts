import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONFIG_DEFAULTS, RING0_CONFIG_KEYS } from "@helmwright/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CONFIG_FILE,
  ConfigError,
  DEFAULT_PERMISSION_POLICY,
  RING0_SETTINGS,
  canonicalJson,
  loadRunConfig,
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
  rmSync(repo, { recursive: true, force: true });
});

describe("loadRunConfig", () => {
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
    const sha = createHash("sha256")
      .update(canonicalJson(CONFIG_DEFAULTS))
      .digest("hex");
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
