import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Event } from "@helmwright/schema";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  SANDBOX_BASE_IMAGE,
  SANDBOX_LABEL,
  buildSandboxImage,
  contextDigest,
  deriveMessages,
  openSessionLog,
  type ToolSpec,
} from "../../src/index.ts";

// Real CLI process, real git, real Docker, real node:sqlite. Fails (never skips) without Docker.
const T = 120_000;
const CLI = fileURLToPath(new URL("../../src/cli.ts", import.meta.url));
const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));
const LIMITS = {
  maxIterations: 5,
  maxToolCallsPerIteration: 4,
  timeoutMs: 60_000,
  noProgressIterations: 3,
};
let tmp: string;
let repo: string;
let stateDir: string;

beforeAll(async () => {
  const pull = spawnSync("docker", ["pull", SANDBOX_BASE_IMAGE], {
    encoding: "utf8",
    timeout: 300_000,
  });
  if (pull.status !== 0) {
    throw new Error(
      `docker pull failed: ${pull.error?.message ?? pull.stderr}`,
    );
  }
  await buildSandboxImage(); // warm the cache so each CLI run builds in ~1 s
}, 600_000);

function git(...args: string[]): string {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}

beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "hw-e2e-")));
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
  const listed = git("-C", repo, "worktree", "list", "--porcelain");
  for (const line of listed.split("\n")) {
    const path = line.startsWith("worktree ") ? line.slice(9) : "";
    if (path !== "" && path !== repo) {
      // A test may have corrupted or moved one; tmp is removed below anyway.
      spawnSync("git", ["-C", repo, "worktree", "remove", "--force", path]);
    }
  }
  rmSync(tmp, { recursive: true, force: true });
});

function cli(...args: string[]) {
  const started = performance.now();
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    timeout: T,
  });
  const ms = performance.now() - started;
  return {
    pid: result.pid,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    ms,
  };
}

/** Starts the CLI without waiting, so the test can signal it mid-run. */
function startCli(...args: string[]) {
  const child = spawn(process.execPath, [CLI, ...args], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (d: string) => (stdout += d));
  child.stderr.setEncoding("utf8").on("data", (d: string) => (stderr += d));
  const exited = new Promise<{ status: number | null; stdout: string }>(
    (done) => {
      child.on("close", (status) => {
        done({ status, stdout: stdout + stderr });
      });
    },
  );
  return { child, exited };
}

/** Polls the session log until an event of `type` is there; returns the events. */
async function waitForEvent(type: string): Promise<Event[]> {
  const until = performance.now() + 60_000;
  while (performance.now() < until) {
    try {
      const events = logEvents();
      if (events.some((e) => e.type === type)) return events;
    } catch {
      // The CLI may still be creating the log.
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("timed out waiting for " + type);
}

function writeTask(
  turns: string,
  limits: object = LIMITS,
  repoPath = repo,
): string {
  const file = join(tmp, "task.json");
  const task = {
    id: "task-1",
    title: "e2e task",
    repo: repoPath,
    engine: { kind: "scripted", turns: join(FIXTURES, turns) },
    limits,
  };
  writeFileSync(file, JSON.stringify(task));
  return file;
}

interface RunOutput {
  runId: string;
  terminal: { kind: string; reason?: string };
  summary: string;
}

function runTask(turns: string, limits?: object) {
  const result = cli("run", writeTask(turns, limits), "--state-dir", stateDir);
  const lines = result.stdout.trim().split("\n");
  expect(lines, result.stderr).toHaveLength(1);
  return { ...result, out: JSON.parse(lines[0] ?? "") as RunOutput };
}

/**
 * script(1) runs the CLI on a pseudo-terminal: util-linux (CI) takes `-c command`,
 * BSD (macOS) the command's argv. Undefined only if there is no script(1).
 */
const SCRIPT = ((): "util-linux" | "bsd" | undefined => {
  const probe = spawnSync("script", ["--version"], { encoding: "utf8" });
  if (probe.error !== undefined) return undefined;
  return probe.stdout.includes("util-linux") ? "util-linux" : "bsd";
})();
// Skipped only where script(1) is absent, and never in CI (there it fails).
const NO_PTY = SCRIPT === undefined && process.env["CI"] === undefined;
if (NO_PTY) console.warn("e2e: script(1) not found; TTY ask tests skipped");
/** Inside the pty: the CLI's stdout goes to a file, stdin and stderr stay on the pty. */
const IN_PTY =
  'exec "$HW_NODE" "$HW_CLI" run "$HW_TASK" --state-dir "$HW_STATE" > "$HW_OUT"';
/**
 * `cat` gives script a real pipe for stdin: BSD script refuses a socket, and Node's
 * stdio pipes are sockets. The test keeps cat's input open and types into it later.
 */
const PTY_ARGV =
  SCRIPT === "util-linux"
    ? ["-c", 'cat | exec script -qec "$0" /dev/null', IN_PTY]
    : ["-c", 'cat | exec script -q /dev/null /bin/sh -c "$0"', IN_PTY];

const PROMPT_END = "Approve? [y/N] ";

/** Runs the CLI on a pty and types `answer` once the ask's prompt is shown. */
async function runAtTty(turns: string, answer: string) {
  if (SCRIPT === undefined) throw new Error("script(1) not found");
  const terminal = join(tmp, "pty.out");
  const stdoutFile = join(tmp, "stdout.json");
  const fd = openSync(terminal, "w+");
  const env = {
    ...process.env,
    SHELL: "/bin/sh",
    HW_NODE: process.execPath,
    HW_CLI: CLI,
    HW_TASK: writeTask(turns),
    HW_STATE: stateDir,
    HW_OUT: stdoutFile,
  };
  const child = spawn("/bin/sh", PTY_ARGV, { stdio: ["pipe", fd, fd], env });
  closeSync(fd);
  const { stdin } = child;
  if (stdin === null) throw new Error("no stdin pipe");
  // Types the answer only after the prompt is shown and its grace window (250 ms)
  // has passed; ends input only once the CLI has written its result, so the answer
  // never races end of input.
  let answered = false;
  const timer = setInterval(() => {
    if (!answered && readFileSync(terminal, "utf8").includes(PROMPT_END)) {
      answered = true;
      setTimeout(() => stdin.write(answer + "\n"), 500);
    }
    if (existsSync(stdoutFile) && readFileSync(stdoutFile, "utf8") !== "") {
      clearInterval(timer);
      stdin.end();
    }
  }, 50);
  const status = await new Promise<number | null>((done) => {
    child.on("close", done);
  });
  clearInterval(timer);
  stdin.destroy();
  const shown = readFileSync(terminal, "utf8").replaceAll("\r\n", "\n");
  const lines = readFileSync(stdoutFile, "utf8").trim().split("\n");
  expect(lines, shown).toHaveLength(1);
  return { status, shown, out: JSON.parse(lines[0] ?? "") as RunOutput };
}

function logEvents(): Event[] {
  const log = openSessionLog(join(stateDir, "session.sqlite"));
  try {
    return log.events();
  } finally {
    log.close();
  }
}

function expectWellFormedLog(runId: string): Event[] {
  const events = logEvents();
  expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i));
  const first = events[0];
  expect(first?.type).toBe("run.started");
  for (const e of events) {
    expect([e.graphId, e.runId, e.nodeId]).toEqual([
      first?.graphId,
      runId,
      first?.nodeId,
    ]);
  }
  expect(events.filter((e) => e.type === "run.terminated")).toHaveLength(1);
  expect(events.at(-1)?.type).toBe("run.terminated");
  return events;
}

function expectReplayMatches(runId: string, events: readonly Event[]): void {
  const replay = cli("replay", runId, "--state-dir", stateDir);
  expect(replay.status, replay.stderr).toBe(0);
  const out = JSON.parse(replay.stdout) as Record<string, unknown>;
  const recorded = events.at(-1)?.payload["contextDigest"];
  // The digest covers the tools offered (logged in run.started) and the context.
  const tools = events[0]?.payload["tools"] as ToolSpec[] | undefined;
  expect(tools?.map((t) => t.name)).toEqual(["execute"]);
  const messages = deriveMessages(events, runId);
  expect(recorded).toBe(contextDigest(messages, tools ?? []));
  expect(out).toEqual({
    runId,
    terminated: true,
    match: true,
    derivedDigest: recorded,
    recordedDigest: recorded,
    events: events.length,
  });
  expect(recorded).toMatch(/^[0-9a-f]{64}$/);
}

describe("helmwright CLI (e2e)", () => {
  it(
    "runs a scripted task that writes a file in the sandbox",
    { timeout: T },
    () => {
      const { status, stderr, out } = runTask("write-file.turns.json");
      expect(status, stderr).toBe(0);
      expect(out.terminal).toEqual({ kind: "completed" });
      expect(out.summary).toBe("Wrote out.txt.");
      const workspace = join(stateDir, "workspaces", out.runId);
      expect(readFileSync(join(workspace, "out.txt"), "utf8")).toBe("hi\n");
      expect(git("-C", repo, "worktree", "list")).toContain(workspace);

      const events = expectWellFormedLog(out.runId);
      // Each message is logged when it is created: cause before effect.
      expect(events.map((e) => e.type)).toEqual([
        ...["run.started", "message.appended", "loop.iteration.started"],
        ...["message.appended", "loop.tool.started", "permission.evaluated"],
        ...["loop.tool.called", "message.appended", "loop.iteration.started"],
        ...["message.appended", "run.terminated"],
      ]);
      expect(events[0]?.payload["policyVersion"]).toBe("default-1");
      // Allowed in the worktree without asking: one ruling, then the effect.
      const evaluated = events.find((e) => e.type === "permission.evaluated");
      expect(evaluated?.payload).toMatchObject({
        toolCallId: "call-1",
        action: "execute",
        requested: "execute",
        tier: "allow",
        guard: "policy",
        ruleId: "execute.worktree",
        policyVersion: "default-1",
      });
      const called = events.find((e) => e.type === "loop.tool.called");
      expect(called?.payload).toMatchObject({ name: "execute", status: "ok" });
      expect(deriveMessages(events, out.runId).map((m) => m.role)).toEqual([
        "user",
        "assistant",
        "tool",
        "assistant",
      ]);
      expectReplayMatches(out.runId, events);

      // A message appended after termination changes the derived context: replay must notice.
      const log = openSessionLog(join(stateDir, "session.sqlite"));
      const { graphId, nodeId } = events[0] ?? {};
      log.append({
        ...{ eventId: "tampered", graphId: graphId ?? "", runId: out.runId },
        ...{ nodeId: nodeId ?? "", type: "message.appended" },
        at: new Date().toISOString(),
        payload: { message: { role: "user", text: "injected" } },
      });
      log.close();
      const replay = cli("replay", out.runId, "--state-dir", stateDir);
      expect(replay.status, replay.stderr).toBe(3);
      expect(JSON.parse(replay.stdout)).toMatchObject({ match: false });
    },
  );

  it(
    "ends a timed-out run INCOMPLETE and still replays (AC12)",
    { timeout: T },
    () => {
      const limits = { ...LIMITS, timeoutMs: 1500 };
      const { status, stderr, out, ms } = runTask("slow.turns.json", limits);
      expect(status, stderr).toBe(2);
      expect(out.terminal).toEqual({ kind: "incomplete", reason: "timeout" });
      expect(out.summary.startsWith("INCOMPLETE (timeout)")).toBe(true);
      expect(ms).toBeLessThan(9000); // the 10 s engine turn was abandoned
      const events = expectWellFormedLog(out.runId);
      expect(events.at(-1)?.payload["terminal"]).toEqual(out.terminal);
      expectReplayMatches(out.runId, events);
    },
  );

  it("denies an unknown action and still terminates", { timeout: T }, () => {
    const { status, stderr, out } = runTask("denied.turns.json");
    expect(status, stderr).toBe(0);
    expect(out.terminal).toEqual({ kind: "completed" });
    const events = expectWellFormedLog(out.runId);
    const called = events.find((e) => e.type === "loop.tool.called");
    expect(called?.payload).toMatchObject({
      name: "deploy_production",
      status: "denied",
    });
    const tool = deriveMessages(events, out.runId).find(
      (m) => m.role === "tool",
    );
    expect(tool).toMatchObject({ status: "denied" });
    expect(tool?.text).toContain("deploy_production");
    // Denied by the schema guard, before any rule: nothing to evaluate or ask.
    const types = events.map((e) => e.type);
    expect(types.filter((t) => t.startsWith("permission."))).toEqual([
      "permission.rejected",
    ]);
    const rejected = events.find((e) => e.type === "permission.rejected");
    expect(rejected?.payload).toMatchObject({
      toolCallId: "call-1",
      guard: "schema",
      ruleId: "schema.unknown-action",
      requestedName: "deploy_production",
    });
    expectReplayMatches(out.runId, events);
  });

  it.skipIf(NO_PTY)(
    "asks at a TTY before deploy; only y approves (AC8)" +
      (NO_PTY ? " [skipped: script(1) not found]" : ""),
    { timeout: T },
    async () => {
      for (const answer of ["n", "y"]) {
        const { status, shown, out } = await runAtTty(
          "deploy.turns.json",
          answer,
        );
        expect(status, shown).toBe(0);
        expect(out.terminal).toEqual({ kind: "completed" });
        const events = logEvents().filter((e) => e.runId === out.runId);
        const types = events.map((e) => e.type);
        const started = types.indexOf("loop.tool.started");
        expect(
          types.slice(started, types.indexOf("loop.tool.called") + 1),
        ).toEqual([
          ...["loop.tool.started", "permission.evaluated", "permission.asked"],
          ...["permission.answered", "loop.tool.called"],
        ]);
        const payload = (type: string) =>
          events.find((e) => e.type === type)?.payload;
        expect(payload("permission.asked")).toMatchObject({
          toolCallId: "call-1",
          presence: "tty",
        });
        // The pty shows exactly the prompt whose hash was logged before it was shown.
        const from = shown.indexOf("helmwright: allow deploy?");
        const prompt = shown.slice(
          from,
          shown.indexOf(PROMPT_END) + PROMPT_END.length,
        );
        expect(from, shown).toBeGreaterThanOrEqual(0);
        for (const part of ["remote): prod", "always-ask.deploy", out.runId]) {
          expect(prompt).toContain(part);
        }
        expect(prompt).toContain("  rule: always-ask.deploy, tier alwaysAsk (");
        const sha = createHash("sha256").update(prompt, "utf8").digest("hex");
        expect(payload("permission.asked")?.["promptSha256"]).toBe(sha);
        const approved = answer === "y";
        expect(payload("permission.answered")).toMatchObject({
          toolCallId: "call-1",
          answer: approved ? "approved" : "denied",
          by: "tty",
          attestation: { kind: "none" },
        });
        expect(payload("permission.answered")?.["waitMs"]).toEqual(
          expect.any(Number),
        );
        expect(payload("loop.tool.called")).toMatchObject({
          name: "deploy",
          status: "denied",
        });
        const tool = deriveMessages(events, out.runId).find(
          (m) => m.role === "tool",
        );
        expect(tool?.text).toBe(
          approved
            ? "denied: no M1 handler for deploy"
            : "denied: always asks (always-ask.deploy); the owner did not approve",
        );
        // Replay never asks: it re-derives the context from the logged answer.
        const replay = cli("replay", out.runId, "--state-dir", stateDir);
        expect(replay.status, replay.stderr).toBe(0);
        expect(JSON.parse(replay.stdout)).toMatchObject({ match: true });
      }
    },
  );

  it(
    "stops deploy in the permission layer when nobody is present (AC8)",
    { timeout: T },
    () => {
      const { status, stderr, out } = runTask("deploy.turns.json");
      expect(status, stderr).toBe(0);
      expect(out.terminal).toEqual({ kind: "completed" });
      const events = expectWellFormedLog(out.runId);
      const types = events.map((e) => e.type);
      const started = types.indexOf("loop.tool.started");
      expect(
        types.slice(started, types.indexOf("loop.tool.called") + 1),
      ).toEqual([
        ...["loop.tool.started", "permission.evaluated", "permission.asked"],
        ...["permission.answered", "loop.tool.called"],
      ]);
      const payload = (type: string) =>
        events.find((e) => e.type === type)?.payload;
      expect(payload("permission.evaluated")).toMatchObject({
        toolCallId: "call-1",
        action: "deploy",
        target: { kind: "remote", value: "prod" },
        tier: "alwaysAsk",
        guard: "policy",
        ruleId: "always-ask.deploy",
      });
      expect(payload("permission.asked")).toMatchObject({
        toolCallId: "call-1",
        presence: "none",
      });
      expect(payload("permission.answered")).toMatchObject({
        toolCallId: "call-1",
        answer: "denied",
        by: "noPresence",
        attestation: { kind: "none" },
      });
      expect(payload("loop.tool.called")).toMatchObject({
        name: "deploy",
        status: "denied",
      });
      const tool = deriveMessages(events, out.runId).find(
        (m) => m.role === "tool",
      );
      expect(tool).toMatchObject({ status: "denied" });
      expect(tool?.text).toContain("always-ask.deploy");
      expect(tool?.text).toContain("nobody present");
      expect(tool?.text).not.toContain("unknown action");
      expectReplayMatches(out.runId, events);
    },
  );

  it(
    "denies reclassified, schema-invalid and unloggable calls before any effect",
    { timeout: T },
    () => {
      const { status, stderr, out } = runTask("ruled.turns.json");
      expect(status, stderr).toBe(0);
      expect(out.terminal).toEqual({ kind: "completed" });
      const workspace = join(stateDir, "workspaces", out.runId);
      expect(existsSync(join(workspace, "a.txt"))).toBe(false);
      expect(existsSync(join(workspace, "b.txt"))).toBe(false);
      const events = expectWellFormedLog(out.runId);
      const ruled = events.filter((e) => e.type.startsWith("permission."));
      // No handler ran. "call 1" cannot be logged: no ruling, fixed denial text.
      expect(ruled.map((e) => [e.type, e.payload["toolCallId"]])).toEqual([
        ["permission.evaluated", "call-2"],
        ["permission.asked", "call-2"],
        ["permission.answered", "call-2"],
        ["permission.rejected", "call-3"],
      ]);
      expect(ruled[0]?.payload).toMatchObject({
        action: "deps.add",
        requested: "execute",
        tier: "ask",
        ruleId: "deps.add",
      });
      expect(ruled[3]?.payload).toMatchObject({ guard: "schema" });
      const tools = deriveMessages(events, out.runId).filter(
        (m) => m.role === "tool",
      );
      expect(tools.map((m) => m.status)).toEqual([
        "denied",
        "denied",
        "denied",
      ]);
      expect(tools[0]?.text).toBe(
        "denied: the permission ruling cannot be logged",
      );
      expectReplayMatches(out.runId, events);
    },
  );

  it(
    "refuses a run whose Ring 0 link fails to resolve, with an escaped reason (N4)",
    { timeout: T },
    () => {
      // A target component over 255 bytes: lstat fails (ENAMETOOLONG) during the walk.
      const target = "\u202e" + "x".repeat(300);
      symlinkSync(target, join(repo, "package.json"));
      git("-C", repo, "add", "package.json");
      git(
        ...["-C", repo, "-c", "user.name=e2e", "-c", "user.email=e2e@x.com"],
        ...["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "link"],
      );
      const { status, stderr, out } = runTask("write-file.turns.json");
      expect(status, stderr).toBe(1);
      expect(out.summary).toContain(
        "run refused: Ring 0 check of the worktree",
      );
      expect(out.summary).toContain("ENAMETOOLONG");
      expect(out.summary).toContain("\\u{202e}");
      expect(out.summary).not.toContain("\u202e");
      expect(out.summary).not.toContain(tmp);
      const events = expectWellFormedLog(out.runId);
      expect(events.at(-1)?.payload["terminal"]).toEqual(out.terminal);
    },
  );

  it(
    "refuses a run whose worktree has an unsupported Ring 0 link",
    { timeout: T },
    () => {
      // package.json is Ring 0; its link target name is not a valid Ring 0 glob.
      writeFileSync(join(repo, "a+b"), "{}\n");
      symlinkSync("a+b", join(repo, "package.json"));
      git("-C", repo, "add", "a+b", "package.json");
      git(
        ...["-C", repo, "-c", "user.name=e2e", "-c", "user.email=e2e@x.com"],
        ...["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "link"],
      );
      const { status, stderr, out } = runTask("write-file.turns.json");
      expect(status, stderr).toBe(1);
      expect(out.terminal.kind).toBe("failed");
      expect(out.summary).toContain("unsupported names");
      const events = expectWellFormedLog(out.runId);
      expect(events.map((e) => e.type)).toEqual([
        "run.started",
        "run.terminated",
      ]);
      const workspace = join(stateDir, "workspaces", out.runId);
      expect(existsSync(join(workspace, "out.txt"))).toBe(false);
    },
  );

  it("exits 64 on usage errors", { timeout: T }, () => {
    const missing = join(tmp, "missing.json");
    expect(cli("run", missing, "--state-dir", stateDir).status).toBe(64);
    expect(cli("run", writeTask("slow.turns.json")).status).toBe(64);
    expect(cli("launch").status).toBe(64);
    expect(cli().status).toBe(64);
    expect(cli("reap").status).toBe(64);
  });

  it("rejects a repo subdirectory or unsafe state dir", { timeout: T }, () => {
    const sub = join(repo, "sub");
    mkdirSync(sub);
    const task = writeTask("write-file.turns.json", LIMITS, sub);
    const nested = cli("run", task, "--state-dir", stateDir);
    expect(nested.status, nested.stderr).toBe(64);
    expect(nested.stderr).toContain("task.repo");
    // A comma would be parsed as a docker --mount option.
    const unsafe = join(tmp, "st,ate");
    const good = writeTask("write-file.turns.json");
    const bad = cli("run", good, "--state-dir", unsafe);
    expect(bad.status, bad.stderr).toBe(64);
    // Validated before anything is created: no log, no workspaces, no dir.
    expect(existsSync(unsafe)).toBe(false);
    expect(existsSync(join(stateDir, "session.sqlite"))).toBe(false);
  });

  it("removes the workspace if worktree add fails", { timeout: T }, () => {
    const empty = join(tmp, "empty");
    git("init", "--quiet", empty); // no commit: there is no HEAD to check out
    const task = writeTask("write-file.turns.json", LIMITS, empty);
    const result = cli("run", task, "--state-dir", stateDir);
    expect(result.status, result.stderr).toBe(1);
    expect(readdirSync(join(stateDir, "workspaces"))).toEqual([]);
  });

  it("fails a run whose engine runs out of turns", { timeout: T }, () => {
    const { status, stderr, out } = runTask("exhausted.turns.json");
    expect(status, stderr).toBe(1);
    expect(out.terminal).toEqual({
      kind: "failed",
      error: "scripted engine exhausted after 1 turns",
    });
    expect(out.summary.startsWith("FAILED: ")).toBe(true);
    const events = expectWellFormedLog(out.runId);
    expect(events.at(-1)?.payload["terminal"]).toEqual(out.terminal);
    expectReplayMatches(out.runId, events);
  });

  it("ends a run cancelled by SIGINT", { timeout: T }, async () => {
    const task = writeTask("slow.turns.json");
    const { child, exited } = startCli("run", task, "--state-dir", stateDir);
    await waitForEvent("loop.iteration.started");
    child.kill("SIGINT");
    const { status, stdout } = await exited;
    expect(status, stdout).toBe(2);
    const out = JSON.parse(stdout.split("\n")[0] ?? "") as RunOutput;
    expect(out.terminal).toEqual({ kind: "incomplete", reason: "cancelled" });
    expect(out.summary.startsWith("INCOMPLETE (cancelled)")).toBe(true);
    expectReplayMatches(out.runId, expectWellFormedLog(out.runId));
  });

  it("times out in a tool call, leaving no container", { timeout: T }, () => {
    const limits = { ...LIMITS, timeoutMs: 4000 };
    const run = runTask("sleep.turns.json", limits);
    const { status, stderr, out, ms, pid } = run;
    expect(status, stderr).toBe(2);
    expect(out.terminal).toEqual({ kind: "incomplete", reason: "timeout" });
    expect(out.summary.startsWith("INCOMPLETE (timeout)")).toBe(true);
    expect(ms).toBeLessThan(25_000); // `sleep 30` was not waited for
    const events = expectWellFormedLog(out.runId);
    const types = events.map((e) => e.type);
    expect(types).toContain("loop.tool.started");
    expect(types).not.toContain("loop.tool.called");
    const owner = "label=" + SANDBOX_LABEL + ".owner-pid=" + String(pid);
    const ps = spawnSync("docker", ["ps", "-a", "-q", "--filter", owner], {
      encoding: "utf8",
    });
    expect(ps.status, ps.stderr).toBe(0);
    expect(ps.stdout.trim()).toBe("");
    expectReplayMatches(out.runId, events);
  });

  it("replays a never-terminated run as exit 4", { timeout: T }, async () => {
    const task = writeTask("slow.turns.json");
    const { child, exited } = startCli("run", task, "--state-dir", stateDir);
    const events = await waitForEvent("loop.iteration.started");
    child.kill("SIGKILL");
    await exited;
    const runId = events[0]?.runId ?? "";
    const replay = cli("replay", runId, "--state-dir", stateDir);
    expect(replay.status, replay.stderr).toBe(4);
    expect(JSON.parse(replay.stdout)).toEqual({ runId, terminated: false });
    // reap leaves a run that has not terminated alone.
    const reap = cli("reap", "--state-dir", stateDir);
    expect(reap.status, reap.stderr).toBe(0);
    expect(existsSync(join(stateDir, "workspaces", runId))).toBe(true);
  });

  it("reaps the worktree of a finished run", { timeout: T }, () => {
    const { status, stderr, out } = runTask("write-file.turns.json");
    expect(status, stderr).toBe(0);
    const workspace = join(stateDir, "workspaces", out.runId);
    expect(existsSync(workspace)).toBe(true);
    // The user's own worktree, moved away: prune would drop its metadata.
    const mine = join(tmp, "mine");
    git("-C", repo, "worktree", "add", "--quiet", "--detach", mine);
    renameSync(mine, mine + "-moved");
    const reap = cli("reap", "--state-dir", stateDir);
    expect(reap.status, reap.stderr).toBe(0);
    expect(JSON.parse(reap.stdout)).toMatchObject({ worktrees: [out.runId] });
    expect(existsSync(workspace)).toBe(false);
    const listed = git("-C", repo, "worktree", "list", "--porcelain");
    expect(listed).not.toContain(workspace);
    expect(listed).toContain("worktree " + mine + "\n");
  });

  it("reaps the other runs when one worktree fails", { timeout: T }, () => {
    const first = runTask("write-file.turns.json").out.runId;
    const second = runTask("write-file.turns.json").out.runId;
    const broken = join(stateDir, "workspaces", first);
    writeFileSync(join(broken, ".git"), "not a gitdir\n");
    const reap = cli("reap", "--state-dir", stateDir);
    expect(reap.status).toBe(1);
    expect(reap.stderr).toContain(first);
    expect(JSON.parse(reap.stdout)).toMatchObject({ worktrees: [second] });
    expect(existsSync(join(stateDir, "workspaces", second))).toBe(false);
    expect(existsSync(broken)).toBe(true);
  });
});
