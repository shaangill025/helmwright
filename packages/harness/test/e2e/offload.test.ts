import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Event } from "@helmwright/schema";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  SANDBOX_BASE_IMAGE,
  buildSandboxImage,
  deriveMessages,
  openSessionLog,
} from "../../src/index.ts";
import { pointerLine } from "../../src/broker/offload.ts";
import { expectFlowDeclared } from "./flow.ts";

// Real CLI process, git, Docker and node:sqlite, with the scripted engine.
const T = 120_000;
const CLI = fileURLToPath(new URL("../../src/cli.ts", import.meta.url));
let tmp: string;
let repo: string;
let stateDir: string;

beforeAll(async () => {
  const pull = spawnSync("docker", ["pull", SANDBOX_BASE_IMAGE], {
    encoding: "utf8",
    timeout: 300_000,
  });
  if (pull.status !== 0) throw new Error("docker pull failed");
  await buildSandboxImage();
}, 600_000);

function git(...args: string[]): void {
  const r = spawnSync("git", args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
}

beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "hw-e2e-off-")));
  repo = join(tmp, "repo");
  stateDir = join(tmp, "state");
  git("init", "--quiet", repo);
  writeFileSync(join(repo, "README.md"), "fixture repo\n");
  git("-C", repo, "add", "README.md");
  git(
    ...["-C", repo, "-c", "user.name=e2e", "-c", "user.email=e2e@example.com"],
    ...["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "init"],
  );
});
afterEach(() => {
  spawnSync("git", ["-C", repo, "worktree", "prune"]);
  rmSync(tmp, { recursive: true, force: true });
});

const cli = (...args: string[]) =>
  spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", timeout: T });

function events(): Event[] {
  const log = openSessionLog(join(stateDir, "session.sqlite"));
  try {
    return log.events();
  } finally {
    log.close();
  }
}

const LIMITS = {
  maxIterations: 5,
  maxToolCallsPerIteration: 4,
  timeoutMs: 60_000,
  noProgressIterations: 3,
};

/** Runs one scripted `execute` of `script`, then done; returns the run's ID. */
function runScript(script: string, limits: object = LIMITS): string {
  const call = {
    id: "call-1",
    name: "execute",
    input: { argv: ["sh", "-c", script] },
  };
  const turns = [
    { text: "printing", toolCalls: [call], claimsDone: false },
    { text: "done", toolCalls: [], claimsDone: true },
  ];
  writeFileSync(join(tmp, "turns.json"), JSON.stringify(turns));
  const task = {
    ...{ id: "task-1", title: "offload", repo, limits },
    engine: { kind: "scripted", turns: join(tmp, "turns.json") },
  };
  writeFileSync(join(tmp, "task.json"), JSON.stringify(task));
  const ran = cli("run", join(tmp, "task.json"), "--state-dir", stateDir);
  const line = ran.stdout.trim().split("\n")[0] ?? "";
  expect(line, ran.stderr).not.toBe("");
  return (JSON.parse(line) as { runId: string }).runId;
}

const FULL = "0123456789abcdef\n".repeat(5000);
const BIG = "yes 0123456789abcdef | head -n 5000";

describe("eager offload (e2e, Q69)", () => {
  it(
    "offloads a large tool output, logs it and still replays",
    { timeout: T },
    () => {
      const runId = runScript(BIG);
      const all = events().filter((e) => e.runId === runId);
      expectFlowDeclared(all);
      const types = all.map((e) => e.type);
      const at = types.indexOf("tool.output.offloaded");
      expect(types.slice(at - 1, at + 2)).toEqual([
        "permission.evaluated",
        "tool.output.offloaded",
        "loop.tool.called",
      ]);
      const payload = all[at]?.payload ?? {};
      const sha = createHash("sha256").update(FULL).digest("hex");
      expect(payload).toEqual({
        kind: "tool.output.offloaded",
        toolCallId: "call-1",
        sha256: sha,
        bytes: Buffer.byteLength(FULL),
        truncatedAtSource: false,
      });
      const file = join(stateDir, "offload", sha + ".txt");
      expect(readFileSync(file, "utf8")).toBe(FULL);
      expect(statSync(file).mode & 0o777).toBe(0o600);

      // The pointer in the logged tool result is built from the logged event alone.
      const results = JSON.stringify(deriveMessages(all, runId));
      const fact = { sha256: sha, bytes: Buffer.byteLength(FULL) };
      expect(results).toContain(
        pointerLine({ ...fact, truncatedAtSource: false }),
      );
      expect(results).not.toContain("[output truncated]");

      const replay = cli("replay", runId, "--state-dir", stateDir);
      expect(replay.status, replay.stderr).toBe(0);
      expect(JSON.parse(replay.stdout)).toMatchObject({
        match: true,
        permissionFaults: [],
      });
    },
  );

  it(
    "declares the flow of a call that times out after output (A1)",
    { timeout: T },
    () => {
      const script = "yes 0123456789abcdef | head -c 200000; sleep 30";
      const runId = runScript(script, { ...LIMITS, timeoutMs: 3000 });
      const all = events().filter((e) => e.runId === runId);
      expectFlowDeclared(all);
      const types = all.map((e) => e.type);
      const halted = types.indexOf("loop.halted");
      expect(halted).toBeGreaterThan(-1);
      expect(types.indexOf("tool.output.offloaded")).toBeGreaterThan(halted);
    },
  );

  it.each([
    [
      "deleted",
      (file: string) => {
        rmSync(file);
      },
    ],
    [
      "forged",
      (file: string) => {
        writeFileSync(file, "forged\n", { mode: 0o600 });
      },
    ],
  ])(
    "fails replay when the offloaded file is %s (C1)",
    { timeout: T },
    (_, tamper) => {
      const runId = runScript(BIG);
      const sha = createHash("sha256").update(FULL).digest("hex");
      tamper(join(stateDir, "offload", sha + ".txt"));
      const replay = cli("replay", runId, "--state-dir", stateDir);
      expect(replay.status, replay.stderr).not.toBe(0);
      const out = JSON.parse(replay.stdout) as { permissionFaults: string[] };
      expect(out.permissionFaults.join("\n")).toContain(
        "tool.output.offloaded",
      );
    },
  );
});
