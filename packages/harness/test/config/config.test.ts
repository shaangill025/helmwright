import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { CONFIG_DEFAULTS, RING0_CONFIG_KEYS } from "@helmwright/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONFIG_FILE,
  ConfigError,
  DEFAULT_PERMISSION_POLICY,
  RING0_PATHS,
  RING0_SETTINGS,
  canonicalJson,
  isRing0Path,
  loadRunConfig,
  openSessionLog,
  resolvePolicy,
  runGit,
  type RunConfig,
  type SessionLog,
} from "../../src/index.ts";
import {
  CONFIG_ACCEPTED,
  ring0SettingDigests,
  ring0Status,
} from "../../src/config/config.ts";

// Real git in a temp repo; no Docker. The CLI path is covered in test/e2e/cli.test.ts.
// FLAKE-3: these tests spawn git, which can take over 5 s under load.
const T = 30_000;
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

describe("loadRunConfig", { timeout: T }, () => {
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

describe("ring0Status", { timeout: T }, () => {
  let state: string;
  let log: SessionLog;
  beforeEach(() => {
    state = mkdtempSync(join(tmpdir(), "hw-ring0-"));
    log = openSessionLog(join(state, "session.sqlite"));
  });
  afterEach(() => {
    log.close();
    rmSync(state, { recursive: true, force: true });
  });

  const append = (runId: string, type: string, payload: object) =>
    log.append({
      ...{ eventId: randomUUID(), graphId: "g", runId, nodeId: "n", type },
      ...{ at: new Date().toISOString(), payload: { ...payload } },
    });
  /** A clean run that accepted `config` (N1: run.started carries its digest). */
  const accepted = (config: RunConfig, runId = "run-a") => {
    append(runId, "run.started", { config: config.record });
    const { ring0Sha256 } = config.record;
    const settings = ring0SettingDigests(config.ring0);
    const payload = { repo: config.repoId, ring0Sha256, how: "default" };
    return { ...payload, settings };
  };

  it("walks the config history only without a baseline (N-b)", () => {
    // A git first on PATH logs each call, then runs the real git.
    const real = (process.env["PATH"] ?? "")
      .split(delimiter)
      .map((dir) => join(dir, "git"))
      .find((path) => existsSync(path));
    const bin = join(state, "bin");
    const calls = join(state, "calls");
    mkdirSync(bin);
    writeFileSync(
      join(bin, "git"),
      `#!/bin/sh\nprintf '%s\\n' "$*" >> '${calls}'\nexec '${real ?? "git"}' "$@"\n`,
      { mode: 0o755 },
    );
    vi.stubEnv("PATH", `${bin}${delimiter}${process.env["PATH"] ?? ""}`);
    const walks = () =>
      (existsSync(calls) ? readFileSync(calls, "utf8") : "")
        .split("\n")
        .filter((c) => / log -1 | --is-shallow-repository$/.test(c));
    const config = loadRunConfig(repo);
    expect(walks()).toEqual([]);
    const payload = accepted(config);
    append("run-a", CONFIG_ACCEPTED, payload);
    expect(ring0Status(log, config)).toEqual({ kind: "unchanged" });
    expect(walks()).toEqual([]);
    // Without one, the committed file's history is found: the defaults are asked.
    const other = { ...config, repoId: "/elsewhere" };
    expect(ring0Status(log, other)).toMatchObject({
      kind: "changed",
      note: "no accepted baseline in this state dir; the config file has history, or the clone is shallow",
    });
    expect(walks()).toHaveLength(2);
  });

  it("re-checks the parsed repo of each baseline row (N-c)", () => {
    const config = loadRunConfig(repo);
    const payload = accepted(config);
    // SQLite's json_extract reads the first "repo", JSON.parse the last.
    const text = JSON.stringify(payload).slice(0, -1) + ',"repo":"/elsewhere"}';
    const db = new DatabaseSync(join(state, "session.sqlite"));
    try {
      const insert =
        "INSERT INTO events VALUES (?, 1, ?, 'g', 'run-a', 'n', ?, ?, ?)";
      db.prepare(insert).run(
        ...[1, "dup", CONFIG_ACCEPTED, "2026-10-07T00:00:00.000Z", text],
      );
    } finally {
      db.close();
    }
    const [row] = log.events({ type: CONFIG_ACCEPTED, repo: config.repoId });
    expect(row?.payload["repo"]).toBe("/elsewhere");
    expect(ring0Status(log, config)).toMatchObject({ kind: "changed" });
  });

  it("takes no baseline from a forged or faulty run (N1)", () => {
    const config = loadRunConfig(repo);
    const payload = accepted(config);
    append("run-a", CONFIG_ACCEPTED, { ...payload, how: "approved" });
    append("run-b", CONFIG_ACCEPTED, { ...payload, how: "trusted" });
    expect(ring0Status(log, config)).toMatchObject({ kind: "changed" });
    append("run-c", "run.started", { config: config.record });
    append("run-c", CONFIG_ACCEPTED, payload);
    expect(ring0Status(log, config)).toEqual({ kind: "unchanged" });
  });

  it("never falls back past an invalid latest baseline (SF-1)", () => {
    const x = loadRunConfig(repo);
    const policy = { ...DEFAULT_PERMISSION_POLICY, version: "strict-1" };
    const ring0Paths = [...policy.ring0Paths, "docs/**"];
    commit(
      file(
        JSON.stringify({ permissions: { policy: { ...policy, ring0Paths } } }),
      ),
    );
    const y = loadRunConfig(repo);
    append("run-x", CONFIG_ACCEPTED, accepted(x, "run-x"));
    append("run-y", CONFIG_ACCEPTED, accepted(y, "run-y"));
    expect(ring0Status(log, y)).toEqual({ kind: "unchanged" });
    // A fault in Y's run: its acceptance is no baseline, and X's is not used.
    const ran = { toolCallId: "helmwright.config.ring0", status: "ok" };
    append("run-y", "loop.tool.called", { ...ran, name: "config.set" });
    expect(ring0Status(log, x)).toEqual({
      kind: "changed",
      from: y.record.ring0Sha256,
      changed: [...RING0_CONFIG_KEYS],
      note: "the latest accepted baseline in this state dir is not valid",
    });
  });
});

describe("helmwright's own config (B6-5, OQ2)", () => {
  const root = (name: string) =>
    fileURLToPath(new URL(`../../../../${name}`, import.meta.url));

  it("passes the loader's parse, schema, admission and resolvePolicy", () => {
    const bytes = readFileSync(root(CONFIG_FILE));
    const parsed = JSON.parse(bytes.toString("utf8")) as {
      permissions: { policy: unknown };
    };
    // Only `permissions.policy` (07 rule 1): every other setting takes its default.
    expect(Object.keys(parsed)).toEqual(["permissions"]);
    expect(Object.keys(parsed.permissions)).toEqual(["policy"]);
    commit(file(bytes));
    const config = loadRunConfig(repo);
    expect(config.record).toMatchObject({
      source: "file",
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    expect(config.policy.version).toBe("helmwright-1");
    expect(config.policy).toEqual(
      resolvePolicy(DEFAULT_PERMISSION_POLICY, parsed.permissions.policy),
    );
  });

  it("covers every Ring 0 component of the rot register", () => {
    const parsed = JSON.parse(readFileSync(root(CONFIG_FILE), "utf8")) as {
      permissions: { policy: unknown };
    };
    const own = resolvePolicy(
      DEFAULT_PERMISSION_POLICY,
      parsed.permissions.policy,
    );
    const globs = [...own.ring0Paths, ...RING0_PATHS];
    const register = JSON.parse(
      readFileSync(root("rot-register.json"), "utf8"),
    ) as { component: string; ring: number }[];
    const ring0 = register
      .filter((entry) => entry.ring === 0)
      .map((entry) => entry.component);
    expect(
      ring0.filter((c) => c.startsWith("packages/")).length,
    ).toBeGreaterThan(0);
    const uncovered = ring0.filter((c) => !isRing0Path(c, globs));
    expect(uncovered).toEqual([]);
    expect(isRing0Path("rot-register.json", globs)).toBe(true);
  });
});
