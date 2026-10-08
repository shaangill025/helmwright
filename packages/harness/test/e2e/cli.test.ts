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
import { DatabaseSync } from "node:sqlite";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Event } from "@helmwright/schema";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  SANDBOX_BASE_IMAGE,
  SANDBOX_LABEL,
  buildSandboxImage,
  DEFAULT_PERMISSION_POLICY,
  contextDigest,
  deriveMessages,
  openSessionLog,
  permissionAnswered,
  permissionAsked,
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
  return cliWith({}, ...args);
}

/** The CLI with `env` added to the test's environment. */
function cliWith(env: Record<string, string>, ...args: string[]) {
  const started = performance.now();
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    timeout: T,
    env: { ...process.env, ...env },
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
    engine: {
      kind: "scripted",
      turns: isAbsolute(turns) ? turns : join(FIXTURES, turns),
    },
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

const PROMPT_END = "Approve deploy (always-ask.deploy, alwaysAsk)? [y/N] ";
const DISCARDED = "(input discarded; answer again)";

const count = (text: string, part: string) => text.split(part).length - 1;

/** Sees what the pty showed so far, on each poll, and may type keys. */
type Driver = (shown: string, type: (keys: string) => void) => void;

/**
 * True once `promptEnd` was shown `n` times and the window that prompt opened has
 * observably opened: typed-ahead keys made the CLI's `n`th discard notice. The
 * fallback (no notice 3 s after the prompt) only lets a broken build fail on its
 * answer rather than time out.
 */
function windowOpen(promptEnd: string, n: number) {
  let promptAt: number | undefined;
  return (text: string) => {
    if (count(text, promptEnd) >= n) promptAt ??= performance.now();
    if (promptAt === undefined) return false;
    return count(text, DISCARDED) >= n || performance.now() - promptAt > 3000;
  };
}

/** Types `answer` and Enter (CR) once the first ask's window has opened. */
function answerOnce(answer: string, promptEnd = PROMPT_END): Driver {
  const open = windowOpen(promptEnd, 1);
  let answered = false;
  return (text, type) => {
    if (!answered && open(text)) {
      answered = true;
      type(answer + "\r");
    }
  };
}

/**
 * B9b-3c: asks for the full view at the first ask ending in `end`, pages it to its
 * end and then approves with "y". `pages()` is how many pages were turned.
 */
function viewThenApprove(end: string): { drive: Driver; pages: () => number } {
  const more = "-- more (page ";
  const last = "-- end of view: space/Enter --";
  const first = windowOpen(end, 1);
  const second = windowOpen(end, 2);
  let step = 0;
  let pages = 0;
  let markers = 0;
  let markerAt = 0;
  const drive: Driver = (text, type) => {
    const shownMarkers = count(text, more) + count(text, last);
    if (step === 0 && first(text)) {
      step = 1;
      type("v\r");
    } else if (step === 1 && count(text, end) < 2) {
      if (shownMarkers > markers) {
        markers = shownMarkers;
        markerAt = performance.now();
      } else if (markers > pages && performance.now() - markerAt > 300) {
        // Keys typed within 150 ms of a page are dropped (SF1).
        pages = markers;
        type(text.includes(last) ? "\r" : " ");
        // Type-ahead for the window after the view (a paging key otherwise).
        type("x");
      }
    } else if (step === 1 && second(text)) {
      step = 2;
      // DEL erases the "x" in case it arrived after that window opened.
      type("\u007fy\r");
    }
  };
  return { drive, pages: () => pages };
}

/**
 * Runs the CLI on a pty, types `early` at once (before any prompt), and types
 * `answer` and Enter (CR) once the ask's window has observably opened: `early`
 * is type-ahead, so the CLI says it was discarded as the window opens. A driver
 * instead types whatever it decides on each poll.
 */
async function runAtTty(turns: string, answer: string | Driver, early = "x") {
  if (SCRIPT === undefined) throw new Error("script(1) not found");
  // A fresh directory per call: a result left by an earlier call in the same test
  // would look like this run's result and end input before the prompt is shown.
  const dir = mkdtempSync(join(tmp, "tty-"));
  const terminal = join(dir, "pty.out");
  const stdoutFile = join(dir, "stdout.json");
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
  stdin.write(early);
  // Types the answer only once the prompt is shown and the CLI said the early keys
  // were discarded (its grace window has opened, however late); ends input only once
  // the CLI has written its result, so the answer never races end of input.
  const drive = typeof answer === "string" ? answerOnce(answer) : answer;
  const type = (keys: string) => stdin.write(keys);
  const timer = setInterval(() => {
    drive(readFileSync(terminal, "utf8"), type);
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
  const shown = readFileSync(terminal, "utf8").split("\r\n").join("\n");
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
    permissionFaults: [],
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
      // Each message is logged when it is created: cause before effect. The
      // first run on the defaults accepts them silently (OQ1).
      expect(events.map((e) => e.type)).toEqual([
        ...["run.started", "config.accepted"],
        ...["message.appended", "loop.iteration.started"],
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
      const { status, stderr, out } = runTask("slow.turns.json", limits);
      expect(status, stderr).toBe(2);
      expect(out.terminal).toEqual({ kind: "incomplete", reason: "timeout" });
      expect(out.summary.startsWith("INCOMPLETE (timeout)")).toBe(true);
      const events = expectWellFormedLog(out.runId);
      // FLAKE-2: the timeout, not the turn, ended the run. The 10 s turn was never
      // logged, and by the log's own clock the run lasted at least the limit but less
      // than that turn's delay, which a run that waited for it could not.
      const texts = deriveMessages(events, out.runId).map((m) => m.text);
      expect(texts).not.toContain("This turn arrives too late.");
      const at = (i: number) => Date.parse(events.at(i)?.at ?? "");
      const lasted = at(-1) - at(0);
      expect(lasted).toBeGreaterThanOrEqual(limits.timeoutMs - 100);
      expect(lasted).toBeLessThan(10_000);
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
        for (const part of [
          'remote): "prod"',
          "always-ask.deploy",
          out.runId,
        ]) {
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
        // N-6: no answer is taken inside the grace window.
        expect(
          payload("permission.answered")?.["waitMs"],
        ).toBeGreaterThanOrEqual(250);
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
        expect(JSON.parse(replay.stdout)).toMatchObject({
          match: true,
          permissionFaults: [],
        });
      }
    },
  );

  // S-1: a "y" typed ahead (no Enter) sits in no line buffer: raw mode, so the
  // window discards it and a later Enter answers an empty line.
  it.skipIf(NO_PTY)(
    "never completes a line typed ahead of the prompt (S-1)" +
      (NO_PTY ? " [skipped: script(1) not found]" : ""),
    { timeout: T },
    async () => {
      const { status, shown, out } = await runAtTty(
        "deploy.turns.json",
        "",
        "y",
      );
      expect(status, shown).toBe(0);
      const events = logEvents().filter((e) => e.runId === out.runId);
      const answered = events.find((e) => e.type === "permission.answered");
      expect(answered?.payload).toMatchObject({ answer: "denied", by: "tty" });
      const tool = deriveMessages(events, out.runId).find(
        (m) => m.role === "tool",
      );
      expect(tool?.text).toBe(
        "denied: always asks (always-ask.deploy); the owner did not approve",
      );
      expect(shown).toContain("(input discarded; answer again)");
    },
  );

  // B9b-3c: a detail too long for the screen is approved only after its full view.
  it.skipIf(NO_PTY)(
    "approves a long comment only after its full view at a TTY" +
      (NO_PTY ? " [skipped: script(1) not found]" : ""),
    { timeout: T },
    async () => {
      const end =
        "Approve comment (always-ask.comment, alwaysAsk)? [v=view, y/N] ";
      const { drive, pages } = viewThenApprove(end);
      const { status, shown, out } = await runAtTty(
        "comment-long.turns.json",
        drive,
      );
      expect(status, shown).toBe(0);
      expect(pages(), shown).toBeGreaterThan(1);
      // B1: after the view only the target and Approve lines are shown again.
      expect(count(shown, "helmwright: allow comment?"), shown).toBe(1);
      expect(shown).toContain('  target (remote): "github.com"\n' + end);
      const events = logEvents().filter((e) => e.runId === out.runId);
      const payload = (type: string) =>
        events.find((e) => e.type === type)?.payload;
      const fixture = JSON.parse(
        readFileSync(join(FIXTURES, "comment-long.turns.json"), "utf8"),
      ) as { toolCalls: { input: { body: string } }[] }[];
      const body = fixture[0]?.toolCalls[0]?.input.body ?? "";
      const sha = (text: string) =>
        createHash("sha256").update(text, "utf8").digest("hex");
      const view = "full detail:\n" + JSON.stringify(body);
      const from = shown.indexOf("helmwright: allow comment?");
      const prompt = shown.slice(from, shown.indexOf(end) + end.length);
      expect(prompt).toContain(
        "  detail: " +
          JSON.stringify(body.slice(0, 120)) +
          " … [" +
          String(body.length) +
          " code points, sha256 " +
          sha(view).slice(0, 16) +
          "]",
      );
      expect(payload("permission.asked")).toMatchObject({
        presence: "tty",
        promptSha256: sha(prompt),
        viewSha256: sha(view),
      });
      expect(payload("permission.answered")).toMatchObject({
        answer: "approved",
        by: "tty",
        viewed: true,
      });
      const tool = deriveMessages(events, out.runId).find(
        (m) => m.role === "tool",
      );
      expect(tool?.text).toBe("denied: no M1 handler for comment");
      expectReplayMatches(out.runId, expectWellFormedLog(out.runId));
    },
  );

  // S-4: agent text cannot send C1, BEL or bidi controls to the terminal.
  it(
    "escapes control and format characters on stdout (S-4)",
    { timeout: T },
    () => {
      const { stdout, out } = runTask("control.turns.json");
      for (const c of ["\u009d", "\u0007", "\u202e"]) {
        expect(stdout).not.toContain(c);
      }
      expect(out.summary).toBe("a\u009d]8;;x\u0007b\u202ec");
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
    "always asks push, pr.open and a governance setting; nobody approves",
    { timeout: T },
    () => {
      const { status, stderr, out } = runTask("always-ask.turns.json");
      expect(status, stderr).toBe(0);
      expect(out.terminal).toEqual({ kind: "completed" });
      const events = expectWellFormedLog(out.runId);
      const of = (type: string) =>
        events.filter((e) => e.type === type).map((e) => e.payload);
      expect(of("permission.evaluated")).toMatchObject([
        { action: "push", tier: "alwaysAsk", ruleId: "always-ask.push" },
        { action: "pr.open", tier: "alwaysAsk", ruleId: "always-ask.pr.open" },
        {
          action: "config.set",
          tier: "alwaysAsk",
          ruleId: "always-ask.ring0-setting",
        },
      ]);
      expect(of("permission.answered")).toMatchObject(
        Array(3).fill({ answer: "denied", by: "noPresence" }),
      );
      expect(of("loop.tool.called").map((p) => p["status"])).toEqual(
        Array(3).fill("denied"),
      );
      expectReplayMatches(out.runId, events);
    },
  );

  it(
    "treats deletes via a link or .. as outside and always asks Ring 0 edits",
    { timeout: T },
    () => {
      const outside = join(tmp, "outside");
      mkdirSync(outside);
      writeFileSync(join(outside, "victim.txt"), "keep\n");
      symlinkSync(outside, join(repo, "escape"));
      mkdirSync(join(repo, ".github", "workflows"), { recursive: true });
      writeFileSync(join(repo, ".github", "workflows", "ci.yml"), "on: push\n");
      writeFileSync(join(repo, "package.json"), "{}\n");
      git("-C", repo, "add", "escape", ".github", "package.json");
      git(
        ...["-C", repo, "-c", "user.name=e2e", "-c", "user.email=e2e@x.com"],
        ...["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "fs"],
      );
      const { status, stderr, out } = runTask("fs-floor.turns.json");
      expect(status, stderr).toBe(0);
      expect(out.terminal).toEqual({ kind: "completed" });
      const events = expectWellFormedLog(out.runId);
      const of = (type: string) =>
        events.filter((e) => e.type === type).map((e) => e.payload);
      const victim = realpathSync(join(outside, "victim.txt"));
      const workspace = join(stateDir, "workspaces", out.runId);
      expect(of("permission.evaluated")).toMatchObject([
        {
          ...{ action: "fs.delete", tier: "alwaysAsk" },
          ...{ ruleId: "always-ask.delete-outside", target: { value: victim } },
        },
        {
          ...{ action: "fs.delete", tier: "alwaysAsk" },
          ...{ ruleId: "always-ask.delete-outside", target: { value: victim } },
        },
        {
          action: "fs.edit",
          tier: "alwaysAsk",
          ruleId: "always-ask.ring0-path",
        },
        {
          action: "fs.edit",
          tier: "alwaysAsk",
          ruleId: "always-ask.ring0-path",
        },
      ]);
      expect(of("permission.answered")).toMatchObject(
        Array(4).fill({ answer: "denied", by: "noPresence" }),
      );
      expect(of("loop.tool.called").map((p) => p["status"])).toEqual(
        Array(4).fill("denied"),
      );
      expect(readFileSync(victim, "utf8")).toBe("keep\n");
      const ci = join(workspace, ".github", "workflows", "ci.yml");
      expect(readFileSync(ci, "utf8")).toBe("on: push\n");
      expect(readFileSync(join(workspace, "package.json"), "utf8")).toBe(
        "{}\n",
      );
      expectReplayMatches(out.runId, events);
    },
  );

  it(
    "denies a comment that carries a token, without asking or logging it (guard 1)",
    { timeout: T },
    () => {
      // Built at run time, so no fixture holds a credential-shaped literal.
      const token = "ghp_" + "a1B2".repeat(9);
      const turns = join(tmp, "exfiltration.turns.json");
      const body = "Done. Use " + token + " to check.\n";
      writeFileSync(
        turns,
        JSON.stringify([
          {
            text: "Commenting.",
            toolCalls: [
              {
                id: "call-1",
                name: "comment",
                input: { destination: "origin", body },
              },
            ],
            claimsDone: false,
          },
          { text: "The comment was denied.", toolCalls: [], claimsDone: true },
        ]),
      );
      const { status, stdout, stderr, out } = runTask(turns);
      expect(status, stderr).toBe(0);
      expect(out.terminal).toEqual({ kind: "completed" });
      expect(stdout + stderr).not.toContain(token);
      const events = expectWellFormedLog(out.runId);
      const types = events.map((e) => e.type);
      expect(types).not.toContain("permission.asked");
      expect(types).not.toContain("permission.answered");
      const evaluated = events.find((e) => e.type === "permission.evaluated");
      expect(evaluated?.payload).toMatchObject({
        action: "comment",
        tier: "deny",
        guard: "exfiltration",
        ruleId: "exfiltration.credential",
        reason: "body carries a GitHub token",
        target: {
          kind: "remote",
          value: "[withheld: credential-shaped content]",
          detail: "[withheld: credential-shaped content]",
        },
      });
      const called = events.find((e) => e.type === "loop.tool.called");
      expect(called?.payload["status"]).toBe("denied");
      // Only the engine's own logged request holds the token; no event made from it does.
      const holders = events.filter((e) =>
        JSON.stringify(e.payload).includes(token),
      );
      expect(holders.map((e) => e.type)).toEqual(["message.appended"]);
      expect(holders[0]?.payload["message"]).toMatchObject({
        role: "assistant",
      });
      const tool = deriveMessages(events, out.runId).find(
        (m) => m.role === "tool",
      );
      expect(tool?.text).toBe(
        "denied: body carries a GitHub token (exfiltration.credential)",
      );
      expectReplayMatches(out.runId, events);
    },
  );

  it(
    "rejects a reused tool call ID and still replays cleanly (S2)",
    { timeout: T },
    () => {
      const { status, stderr, out } = runTask("reused-id.turns.json");
      expect(status, stderr).toBe(0);
      expect(out.terminal).toEqual({ kind: "completed" });
      const workspace = join(stateDir, "workspaces", out.runId);
      expect(existsSync(join(workspace, "a.txt"))).toBe(true);
      expect(existsSync(join(workspace, "b.txt"))).toBe(false);
      const events = expectWellFormedLog(out.runId);
      const ruled = events.filter((e) => e.type.startsWith("permission."));
      expect(ruled.map((e) => [e.type, e.payload["ruleId"]])).toEqual([
        ["permission.evaluated", "execute.worktree"],
        ["permission.rejected", "schema.duplicate-call-id"],
      ]);
      const tools = deriveMessages(events, out.runId).filter(
        (m) => m.role === "tool",
      );
      expect(tools.map((m) => m.text)).toEqual([
        "",
        "denied: tool call ID already used in this run",
      ]);
      expectReplayMatches(out.runId, events);
    },
  );

  // SF3: replay checks that each approval in the log is bound to what was asked.
  it(
    "fails replay on an approval logged without its full view (SF3)",
    { timeout: T },
    () => {
      const { status, stderr, out } = runTask("deploy.turns.json");
      expect(status, stderr).toBe(0);
      const events = expectWellFormedLog(out.runId);
      const evaluated = events.find((e) => e.type === "permission.evaluated");
      const { graphId = "", nodeId = "", payload = {} } = evaluated ?? {};
      const toolCallId = "call-9";
      const log = openSessionLog(join(stateDir, "session.sqlite"));
      for (const [i, { type, payload: p }] of [
        { type: "permission.evaluated", payload: { ...payload, toolCallId } },
        permissionAsked(toolCallId, "tty", "prompt", "full view"),
        permissionAnswered(toolCallId, { answer: "approved", by: "tty" }, 300),
      ].entries()) {
        log.append({
          ...{ eventId: `forged-${String(i)}`, graphId, runId: out.runId },
          ...{ nodeId, type, at: new Date().toISOString() },
          payload: { ...p },
        });
      }
      log.close();
      // The context is untouched, so the digest still matches; the binding does not.
      const replay = cli("replay", out.runId, "--state-dir", stateDir);
      expect(replay.status, replay.stderr).toBe(3);
      expect(JSON.parse(replay.stdout)).toMatchObject({
        match: true,
        permissionFaults: [
          `seq ${String(events.length + 2)}: approval without the full view shown to its end`,
        ],
      });
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

  // Nit-6: an error that echoes input cannot send control characters to stderr.
  it("escapes control characters in error output", { timeout: T }, () => {
    const { status, stderr } = cli("\u001b]0;x\u0007", "--state-dir", stateDir);
    expect(status).toBe(64);
    for (const c of ["\u0007", "\u001b"]) expect(stderr).not.toContain(c);
    expect(stderr).toContain("unknown command: \\u{1b}]0;x\\u{7}");
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
    const emptyTask = writeTask("write-file.turns.json", LIMITS, empty);
    const none = cli("run", emptyTask, "--state-dir", stateDir);
    expect(none.status, none.stderr).toBe(64);
    expect(none.stderr).toContain("task.repo has no commit at HEAD");
    // HEAD and its tree resolve, but checking out README.md's missing blob fails.
    const blob = git("-C", repo, "rev-parse", "HEAD:README.md").trim();
    rmSync(join(repo, ".git", "objects", blob.slice(0, 2), blob.slice(2)));
    const task = writeTask("write-file.turns.json");
    const result = cli("run", task, "--state-dir", stateDir);
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain("unable to read sha1 file of README.md");
    expect(readdirSync(join(stateDir, "workspaces"))).toEqual([]);
    const listed = git("-C", repo, "worktree", "list", "--porcelain");
    expect(listed.split("\n").filter((l) => l.startsWith("worktree "))).toEqual(
      ["worktree " + repo],
    );
    const admin = join(repo, ".git", "worktrees");
    expect(existsSync(admin) ? readdirSync(admin) : []).toEqual([]);
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

const CONFIG = "helmwright.config.json";
const sha256 = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");

/** Commits `write`'s helmwright.config.json (and any other change) in place of the old one. */
function commitConfig(write: (path: string) => void): void {
  const path = join(repo, CONFIG);
  git(...["-C", repo, "rm", "-rq", "--cached", "--ignore-unmatch", CONFIG]);
  rmSync(path, { recursive: true, force: true });
  write(path);
  git("-C", repo, "add", "-A");
  git(
    ...["-C", repo, "-c", "user.name=e2e", "-c", "user.email=e2e@x.com"],
    ...["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "config"],
  );
}

/** Exit 64 naming the file and `problem`; nothing logged or created, no worktree. */
function expectConfigRefused(problem: string): string {
  const task = writeTask("write-file.turns.json");
  const { status, stdout, stderr } = cli("run", task, "--state-dir", stateDir);
  expect(status, stderr).toBe(64);
  expect(stderr).toContain(`helmwright: ${CONFIG}: ${problem}`);
  expect(stdout).toBe("");
  expect(existsSync(stateDir)).toBe(false);
  const listed = git("-C", repo, "worktree", "list", "--porcelain");
  expect(listed.split("\n").filter((l) => l.startsWith("worktree "))).toEqual([
    "worktree " + repo,
  ]);
  return stderr;
}

function startedOf(runId: string): Record<string, unknown> | undefined {
  return logEvents().find((e) => e.type === "run.started" && e.runId === runId)
    ?.payload;
}

const RING0_ID = "helmwright.config.ring0";
const RING0_END =
  "Approve config.set (always-ask.ring0-setting, alwaysAsk)? [v=view, y/N] ";
const NOT_APPROVED = "Ring 0 configuration changed and was not approved";

/** S3, N1: appends a row with a raw connection, as a forger could. */
function rawAppend(type: string, payload: object): void {
  const db = new DatabaseSync(join(stateDir, "session.sqlite"));
  try {
    const next = "SELECT COALESCE(MAX(seq), -1) + 1 AS n FROM events";
    const seq = Number(db.prepare(next).get()?.["n"]);
    const at = "2026-10-07T00:00:00.000Z";
    const row = [
      seq,
      `forged-${String(seq)}`,
      type,
      at,
      JSON.stringify(payload),
    ];
    const insert =
      "INSERT INTO events VALUES (?, 1, ?, 'g', 'run-forged', 'n', ?, ?, ?)";
    db.prepare(insert).run(...row);
  } finally {
    db.close();
  }
}

/** A turn whose execute call uses the reserved Ring 0 call ID. */
function reservedTurns(): string {
  const turns = join(tmp, "reserved.turns.json");
  const argv = ["sh", "-c", "echo hi > a.txt"];
  writeFileSync(
    turns,
    JSON.stringify([
      {
        text: "Writing a.txt with the reserved ID.",
        toolCalls: [{ id: RING0_ID, name: "execute", input: { argv } }],
        claimsDone: false,
      },
      { text: "It was refused.", toolCalls: [], claimsDone: true },
    ]),
  );
  return turns;
}

/** Commits a config whose policy adds `paths` to the default Ring 0 paths. */
function commitStrict(version: string, paths: readonly string[]): void {
  const base = DEFAULT_PERMISSION_POLICY;
  const ring0Paths = [...base.ring0Paths, ...paths];
  const policy = { ...base, version, ring0Paths };
  commitConfig((path) => {
    writeFileSync(path, JSON.stringify({ permissions: { policy } }));
  });
}

describe("helmwright.config.json (e2e)", () => {
  it(
    "reads task.repo, not GIT_DIR, and runs no fsmonitor (S1, S3)",
    { timeout: T },
    () => {
      const other = join(tmp, "other");
      git("init", "--quiet", other);
      writeFileSync(join(other, CONFIG), '{"topology": "allSeparate"}');
      git("-C", other, "add", CONFIG);
      git(
        ...["-C", other, "-c", "user.name=e2e", "-c", "user.email=e2e@x.com"],
        ...["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "other"],
      );
      const marker = join(tmp, "fsmonitor-ran");
      const monitor = join(tmp, "fsmonitor.sh");
      writeFileSync(monitor, `#!/bin/sh\ntouch '${marker}'\n`, { mode: 0o755 });
      git("-C", repo, "config", "core.fsmonitor", monitor);
      const task = writeTask("write-file.turns.json");
      const env = { GIT_DIR: join(other, ".git") };
      const result = cliWith(env, "run", task, "--state-dir", stateDir);
      expect(result.status, result.stderr).toBe(0);
      const { runId } = JSON.parse(result.stdout) as RunOutput;
      expect(startedOf(runId)).toMatchObject({
        baseCommit: git("-C", repo, "rev-parse", "HEAD").trim(),
        config: { source: "default" },
      });
      expect(existsSync(marker)).toBe(false);
      const listed = git("-C", other, "worktree", "list", "--porcelain");
      expect(listed).not.toContain(join(stateDir, "workspaces"));
    },
  );

  it(
    "refuses a malformed config before the run starts (AC1)",
    { timeout: T },
    () => {
      const write = (text: string | Buffer) => (path: string) => {
        writeFileSync(path, text);
      };
      const cases: [(path: string) => void, string][] = [
        [write('{"topology": SECRET-MARKER'), "is not valid JSON"],
        [write('{"unknown": 1}'), '/ unknown key "unknown"'],
        [
          write('{"permissions": {"untrustedContent": {"hintBytes": "1024"}}}'),
          "/permissions/untrustedContent/hintBytes must be integer",
        ],
        [
          write('{"topology": "a", "topology": "b"}'),
          'duplicate key "topology"',
        ],
        [write('{"__proto__": {}}'), 'forbidden key "__proto__"'],
        [
          (path) => {
            writeFileSync(join(repo, "real.json"), "{}");
            symlinkSync("real.json", path);
          },
          "must be a regular file (git mode 100644), not a symbolic link (120000)",
        ],
        [
          write("{}" + " ".repeat(262_143)),
          "is 262145 bytes, over the 262144-byte limit",
        ],
      ];
      for (const [make, problem] of cases) {
        commitConfig(make);
        const stderr = expectConfigRefused(problem);
        expect(stderr).not.toContain("SECRET-MARKER");
      }
    },
  );

  it("refuses a listed alternative: no fixture (AC2)", { timeout: T }, () => {
    const cases: [object, string][] = [
      [
        { friction: { defaultIntensity: "high" } },
        'friction.defaultIntensity "high"',
      ],
      [
        { intake: { classification: "model" } },
        'intake.classification "model"',
      ],
      [{ topology: "allSeparate" }, 'topology "allSeparate"'],
      [
        { permissions: { untrustedContent: { hintBytes: 512 } } },
        "permissions.untrustedContent.hintBytes 512",
      ],
    ];
    for (const [config, setting] of cases) {
      commitConfig((path) => {
        writeFileSync(path, JSON.stringify(config));
      });
      expectConfigRefused(`${setting} is not admitted: no fixture (07 rule 1)`);
    }
  });

  it(
    "uses only HEAD's committed config, else the defaults (AC3)",
    { timeout: T },
    () => {
      // Another branch's config and an uncommitted one are never read.
      git("-C", repo, "switch", "--quiet", "-c", "other");
      commitConfig((path) => {
        writeFileSync(path, '{"topology": "allSeparate"}');
      });
      git("-C", repo, "switch", "--quiet", "-");
      writeFileSync(join(repo, CONFIG), "not json");
      const base = git("-C", repo, "rev-parse", "HEAD").trim();
      const first = runTask("write-file.turns.json");
      expect(first.status, first.stderr).toBe(0);
      const started = startedOf(first.out.runId);
      expect(started).toMatchObject({
        baseCommit: base,
        policyVersion: "default-1",
        config: { source: "default" },
      });
      const config = started?.["config"] as Record<string, string>;
      expect(config["sha256"]).toMatch(/^[0-9a-f]{64}$/);
      expect(config["ring0Sha256"]).toMatch(/^[0-9a-f]{64}$/);
      const workspace = join(stateDir, "workspaces", first.out.runId);
      expect(git("-C", workspace, "rev-parse", "HEAD").trim()).toBe(base);

      // The defaults written out: the file's own digest, the same Ring 0 digest.
      const text = JSON.stringify(
        {
          intake: { classification: "rubric" },
          permissions: { untrustedContent: { mode: "exploreSplit" } },
          topology: "sessionHarnessOneProcess",
        },
        null,
        2,
      );
      commitConfig((path) => {
        writeFileSync(path, text);
      });
      const second = runTask("write-file.turns.json");
      expect(second.status, second.stderr).toBe(0);
      expect(startedOf(second.out.runId)).toMatchObject({
        baseCommit: git("-C", repo, "rev-parse", "HEAD").trim(),
        policyVersion: "default-1",
        config: {
          source: "file",
          sha256: sha256(text),
          ring0Sha256: config["ring0Sha256"],
        },
      });
    },
  );

  it(
    "refuses a relaxing policy; an unapproved Ring 0 change fails (AC4, AC5)",
    { timeout: T },
    () => {
      const base = DEFAULT_PERMISSION_POLICY;
      // N3: a Ring 0 change too large to show in full could never be approved.
      const many = <T>(n: number, f: (s: string) => T) =>
        Array.from({ length: n }, (_, i) =>
          f("x" + String(i).padStart(4, "0").padEnd(120, "a")),
        );
      const id = (s: string) =>
        [s.slice(0, 32), "b", "c", "d"].map((c) => c.padEnd(32, "a")).join(".");
      const deny = { action: "deploy", scope: "any", tier: "deny" };
      const big = {
        ...{ ...base, version: "big-1" },
        ring0Paths: [...base.ring0Paths, ...many(230, (s) => s + "/**")],
        ring0Settings: [...base.ring0Settings, ...many(50, (s) => s)],
        rules: [...base.rules, ...many(230, (s) => ({ ...deny, id: id(s) }))],
      };
      commitConfig((path) => {
        writeFileSync(path, JSON.stringify({ permissions: { policy: big } }));
      });
      expectConfigRefused("Ring 0 configuration is too large to approve");
      const lax = {
        ...base,
        version: "lax-1",
        alwaysAsk: base.alwaysAsk.filter((action) => action !== "deploy"),
      };
      commitConfig((path) => {
        writeFileSync(path, JSON.stringify({ permissions: { policy: lax } }));
      });
      expectConfigRefused(
        "permissions.policy: override relaxes alwaysAsk: removes deploy",
      );

      // OQ1: a stricter policy is a Ring 0 change; with nobody present the run fails.
      commitStrict("strict-1", ["docs/**"]);
      const { status, stderr, out } = runTask("write-file.turns.json");
      expect(status, stderr).toBe(1);
      expect(out.terminal).toEqual({ kind: "failed", error: NOT_APPROVED });
      const events = expectWellFormedLog(out.runId);
      // Asked after run.started, before the first message and any tool call.
      expect(events.map((e) => e.type)).toEqual([
        "run.started",
        "permission.evaluated",
        "permission.asked",
        "permission.answered",
        "run.terminated",
      ]);
      expect(events[0]?.payload).toMatchObject({ policyVersion: "strict-1" });
      expect(events.slice(1, 4).map((e) => e.payload)).toMatchObject([
        {
          ...{ toolCallId: RING0_ID, action: "config.set", tier: "alwaysAsk" },
          ...{ ruleId: "always-ask.ring0-setting", policyVersion: "strict-1" },
          target: { kind: "setting", value: "permissions", truncated: true },
        },
        { toolCallId: RING0_ID, presence: "none" },
        { toolCallId: RING0_ID, answer: "denied", by: "noPresence" },
      ]);
      expect(logEvents().some((e) => e.type === "config.accepted")).toBe(false);
      // No loop ran, so there is no context digest to match; the asks are bound.
      const replay = cli("replay", out.runId, "--state-dir", stateDir);
      expect(JSON.parse(replay.stdout)).toMatchObject({
        terminated: true,
        permissionFaults: [],
      });

      // S3: a corrupt row of another type is never read at run start.
      rawAppend("bad", {});
      const forged = runTask("write-file.turns.json");
      expect(forged.out.terminal, forged.stderr).toEqual({
        kind: "failed",
        error: NOT_APPROVED,
      });
    },
  );

  it.skipIf(NO_PTY)(
    "ends a run cancelled at the Ring 0 prompt as incomplete (S2)" +
      (NO_PTY ? " [skipped: script(1) not found]" : ""),
    { timeout: T },
    async () => {
      commitStrict("strict-1", ["docs/**"]);
      const open = windowOpen(RING0_END, 1);
      let sent = false;
      const { status, shown, out } = await runAtTty(
        "write-file.turns.json",
        (text, type) => {
          if (!sent && open(text)) {
            sent = true;
            type("\u0003");
          }
        },
      );
      expect(status, shown).toBe(2);
      expect(out.terminal).toEqual({ kind: "incomplete", reason: "cancelled" });
      const events = logEvents().filter((e) => e.runId === out.runId);
      expect(
        events.find((e) => e.type === "permission.answered")?.payload,
      ).toMatchObject({ by: "cancelled" });
      expect(events.some((e) => e.type === "config.accepted")).toBe(false);
    },
  );

  it.skipIf(NO_PTY)(
    "asks a Ring 0 change at run start, once approved (AC4-6)" +
      (NO_PTY ? " [skipped: script(1) not found]" : ""),
    { timeout: T },
    async () => {
      mkdirSync(join(repo, "docs"));
      writeFileSync(join(repo, "docs", "x.md"), "keep\n");
      commitStrict("strict-1", ["docs/**"]);
      const { drive, pages } = viewThenApprove(RING0_END);
      const tty = await runAtTty(reservedTurns(), drive);
      expect(tty.status, tty.shown).toBe(0);
      expect(pages(), tty.shown).toBeGreaterThan(0);
      const asked = logEvents().filter((e) => e.runId === tty.out.runId);
      const to = (asked[0]?.payload["config"] as Record<string, string>)[
        "ring0Sha256"
      ];
      expect(tty.shown).toContain("  Ring 0 settings changed: permissions\n");
      expect(tty.shown).toMatch(/ {2}Ring 0 digest: [0-9a-f]{64} -> /);
      expect(tty.shown).toContain(" -> " + (to ?? "none") + "\n");
      const of = (events: readonly Event[], type: string) =>
        events.filter((e) => e.type === type).map((e) => e.payload);
      expect(of(asked, "permission.answered")).toMatchObject([
        { toolCallId: RING0_ID, answer: "approved", by: "tty", viewed: true },
      ]);
      const [accepted, ...more] = of(asked, "config.accepted");
      expect(more).toEqual([]);
      expect(accepted).toMatchObject({
        repo: join(repo, ".git"),
        ring0Sha256: to,
        how: "approved",
      });
      expect(Object.keys(accepted?.["settings"] ?? {})).toEqual([
        "intake.classification",
        "permissions",
      ]);
      // The approval is not the engine's: its call with the reserved ID is refused.
      expect(of(asked, "permission.rejected")).toMatchObject([
        { toolCallId: RING0_ID, ruleId: "schema.duplicate-call-id" },
      ]);
      const ttyWorkspace = join(stateDir, "workspaces", tty.out.runId);
      expect(existsSync(join(ttyWorkspace, "a.txt"))).toBe(false);
      expectReplayMatches(tty.out.runId, asked);

      // The same config is not asked again; the stricter policy applies (AC4).
      const turns = join(tmp, "strict.turns.json");
      const setting = "permissions.untrustedContent.hintBytes";
      writeFileSync(
        turns,
        JSON.stringify([
          {
            text: "Editing docs and lowering the hint budget.",
            toolCalls: [
              { id: "call-1", name: "fs.edit", input: { path: "docs/x.md" } },
              {
                id: "call-2",
                name: "config.set",
                input: { setting, value: 512 },
              },
            ],
            claimsDone: false,
          },
          { text: "None was approved.", toolCalls: [], claimsDone: true },
        ]),
      );
      const { status, stderr, out } = runTask(turns);
      expect(status, stderr).toBe(0);
      const events = logEvents().filter((e) => e.runId === out.runId);
      expect(events[0]?.payload).toMatchObject({
        policyVersion: "strict-1",
        config: { source: "file", ring0Sha256: to },
      });
      expect(of(events, "config.accepted")).toEqual([]);
      expect(of(events, "permission.evaluated")).toMatchObject([
        {
          ...{
            action: "fs.edit",
            tier: "alwaysAsk",
            policyVersion: "strict-1",
          },
          ...{ ruleId: "always-ask.ring0-path" },
        },
        {
          ...{ action: "config.set", tier: "alwaysAsk" },
          ...{ ruleId: "always-ask.ring0-setting", target: { value: setting } },
        },
      ]);
      expect(of(events, "permission.answered")).toMatchObject(
        Array(2).fill({ answer: "denied", by: "noPresence" }),
      );
      const workspace = join(stateDir, "workspaces", out.runId);
      expect(readFileSync(join(workspace, "docs", "x.md"), "utf8")).toBe(
        "keep\n",
      );
      expectReplayMatches(out.runId, events);

      // Another change is asked again.
      commitStrict("strict-2", ["docs/**", "notes/**"]);
      const again = runTask("write-file.turns.json");
      expect(again.status, again.stderr).toBe(1);
      expect(again.out.terminal).toEqual({
        kind: "failed",
        error: NOT_APPROVED,
      });
      const ruled = logEvents().filter((e) => e.runId === again.out.runId);
      expect(of(ruled, "permission.evaluated")).toMatchObject([
        { toolCallId: RING0_ID, ruleId: "always-ask.ring0-setting" },
      ]);

      // S1: a linked worktree of the repo shares its baseline (strict-1 accepted).
      const linked = join(tmp, "linked");
      git(
        "-C",
        repo,
        "worktree",
        "add",
        "--quiet",
        "--detach",
        linked,
        "HEAD~1",
      );
      const task = writeTask("write-file.turns.json", LIMITS, linked);
      const shared = cli("run", task, "--state-dir", stateDir);
      expect(shared.status, shared.stderr).toBe(0);
      // Removing the config is a change; a clone in a new state dir has no
      // baseline, but the file has history, so the defaults are asked too.
      commitConfig(() => undefined);
      expect(runTask("write-file.turns.json").out.terminal).toEqual({
        kind: "failed",
        error: NOT_APPROVED,
      });
      const clone = join(tmp, "clone");
      git("clone", "--quiet", repo, clone);
      const cloned = writeTask("write-file.turns.json", LIMITS, clone);
      const fresh = cli("run", cloned, "--state-dir", join(tmp, "state2"));
      expect(JSON.parse(fresh.stdout)).toMatchObject({
        terminal: { kind: "failed", error: NOT_APPROVED },
      });
    },
  );

  it(
    "accepts the defaults silently and refuses the reserved call ID (OQ1)",
    { timeout: T },
    () => {
      const first = runTask("write-file.turns.json");
      expect(first.status, first.stderr).toBe(0);
      const events = expectWellFormedLog(first.out.runId);
      const config = events[0]?.payload["config"] as Record<string, string>;
      expect(events[1]).toMatchObject({
        type: "config.accepted",
        payload: {
          ...{ repo: join(repo, ".git"), how: "default" },
          ring0Sha256: config["ring0Sha256"],
        },
      });
      expect(events.some((e) => e.payload["toolCallId"] === RING0_ID)).toBe(
        false,
      );
      expectReplayMatches(first.out.runId, events);

      // An engine call with the reserved ID never inherits a Ring 0 approval.
      const second = runTask(reservedTurns());
      expect(second.status, second.stderr).toBe(0);
      const later = logEvents().filter((e) => e.runId === second.out.runId);
      expect(later.filter((e) => e.type === "config.accepted")).toEqual([]);
      expect(
        later.filter((e) => e.type.startsWith("permission.")),
      ).toMatchObject([
        {
          type: "permission.rejected",
          payload: { toolCallId: RING0_ID, ruleId: "schema.duplicate-call-id" },
        },
      ]);
      const tool = deriveMessages(later, second.out.runId).find(
        (m) => m.role === "tool",
      );
      expect(tool?.text).toBe("denied: tool call ID already used in this run");
      const workspace = join(stateDir, "workspaces", second.out.runId);
      expect(existsSync(join(workspace, "a.txt"))).toBe(false);
      expectReplayMatches(second.out.runId, later);
    },
  );
});
