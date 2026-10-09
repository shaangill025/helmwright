import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
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
  loadRunConfig,
  openSessionLog,
  permissionAnswered,
  permissionAsked,
  type ToolSpec,
} from "../../src/index.ts";
import { ring0SettingDigests } from "../../src/config/config.ts";

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
  extra: object = {},
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
    ...extra,
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
  return runWith(writeTask(turns, limits));
}

/** B10-2: a task with an `intake` block (none if undefined), run with `args`. */
function runIntake(turns: string, intake?: object, ...args: string[]) {
  const extra = intake === undefined ? {} : { intake };
  return runWith(writeTask(turns, LIMITS, repo, extra), ...args);
}

function runWith(task: string, ...args: string[]) {
  const result = cli("run", task, "--state-dir", stateDir, ...args);
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
  'exec "$HW_NODE" "$HW_CLI" run "$HW_TASK" --state-dir "$HW_STATE" $HW_ARGS > "$HW_OUT"';
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
async function runAtTty(
  turns: string,
  answer: string | Driver,
  early = "x",
  task: { readonly intake?: object; readonly args?: string } = {},
) {
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
    HW_TASK: writeTask(
      turns,
      LIMITS,
      repo,
      task.intake === undefined ? {} : { intake: task.intake },
    ),
    HW_STATE: stateDir,
    HW_ARGS: task.args ?? "",
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

/** The projected record with `id` (B5-3), or undefined. */
function objectOf(id: string) {
  const log = openSessionLog(join(stateDir, "session.sqlite"));
  try {
    return log.object(id);
  } finally {
    log.close();
  }
}

/** The objects projection checked against the events, as replay reports it (B5-4b). */
function projectionsOf() {
  const log = openSessionLog(join(stateDir, "session.sqlite"));
  try {
    return log.verifyProjections();
  } finally {
    log.close();
  }
}

/** Edits the Run row `id` as a raw writer that registers the guard's flag function can. */
function editRunRow(id: string): void {
  const db = new DatabaseSync(join(stateDir, "session.sqlite"));
  try {
    db.function("hw_projection_write", () => 1);
    const edit =
      "UPDATE objects SET record = json_set(record, '$.class', 'chore') WHERE id = ? AND record ->> '$.class' IS NOT 'chore'";
    expect(Number(db.prepare(edit).run(id).changes)).toBe(1);
  } finally {
    db.close();
  }
}

/**
 * The log of one run, the first in its state dir: B5-4 logs `task.created` and
 * `run.recorded` before `run.started`. Returns its events from `run.started` on.
 */
function expectWellFormedLog(runId: string): Event[] {
  const all = logEvents();
  expect(all.map((e) => e.seq)).toEqual(all.map((_, i) => i));
  expect(all.slice(0, 3).map((e) => e.type)).toEqual([
    ...["task.created", "run.recorded", "run.started"],
  ]);
  const first = all[0];
  for (const e of all) {
    expect([e.graphId, e.runId, e.nodeId]).toEqual([
      first?.graphId,
      runId,
      first?.nodeId,
    ]);
  }
  expect(all.filter((e) => e.type === "run.terminated")).toHaveLength(1);
  expect(all.at(-1)?.type).toBe("run.terminated");
  return all.slice(2);
}

function expectReplayMatches(runId: string, events: readonly Event[]): void {
  const replay = cli("replay", runId, "--state-dir", stateDir);
  expect(replay.status, replay.stderr).toBe(0);
  const out = JSON.parse(replay.stdout) as Record<string, unknown>;
  // Replay counts every event of the run, its records (B5-4) too.
  const all = logEvents().filter((e) => e.runId === runId);
  expect(all.slice(-events.length)).toEqual(events);
  const recorded = events.at(-1)?.payload["contextDigest"];
  // The digest covers the tools offered (logged in run.started) and the context.
  const started = events.find((e) => e.type === "run.started");
  const tools = started?.payload["tools"] as ToolSpec[] | undefined;
  expect(tools?.map((t) => t.name)).toEqual(["execute"]);
  const messages = deriveMessages(events, runId);
  expect(recorded).toBe(contextDigest(messages, tools ?? []));
  // B5-4b: the whole log's projections match, and the Task and Run relations hold.
  const projections = projectionsOf();
  expect(projections).toMatchObject({ match: true, differingIds: [] });
  expect(out).toEqual({
    runId,
    terminated: true,
    match: true,
    derivedDigest: recorded,
    recordedDigest: recorded,
    events: all.length,
    permissionFaults: [],
    objectFaults: [],
    projections,
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
        ...["run.started", "config.accepted", "intake.classified"],
        ...["message.appended", "loop.iteration.started"],
        ...["message.appended", "loop.tool.started", "permission.evaluated"],
        ...["loop.tool.called", "message.appended", "loop.iteration.started"],
        ...["message.appended", "floor.checked", "run.terminated"],
      ]);
      expect(events[0]?.payload["policyVersion"]).toBe("default-2");
      // Allowed in the worktree without asking: one ruling, then the effect.
      const evaluated = events.find((e) => e.type === "permission.evaluated");
      expect(evaluated?.payload).toMatchObject({
        toolCallId: "call-1",
        action: "execute",
        requested: "execute",
        tier: "allow",
        guard: "policy",
        ruleId: "execute.worktree",
        policyVersion: "default-2",
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
      // The seq of the first forged event (the run's records come first, B5-4).
      const next = (events.at(-1)?.seq ?? 0) + 1;
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
          `seq ${String(next + 2)}: approval without the full view shown to its end`,
          `seq ${String(next)}: permission.evaluated after floor.checked`,
          `seq ${String(next + 1)}: permission.asked after floor.checked`,
          `seq ${String(next + 2)}: permission.answered after floor.checked`,
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
        "floor.checked",
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
    const projections = projectionsOf();
    expect(projections.match).toBe(true);
    expect(JSON.parse(replay.stdout)).toEqual({
      ...{ runId, terminated: false, projections },
    });
    // B5-4b: a projection mismatch is exit 3 even for a run that never terminated.
    editRunRow(runId);
    const edited = cli("replay", runId, "--state-dir", stateDir);
    expect(edited.status, edited.stderr).toBe(3);
    expect(JSON.parse(edited.stdout)).toMatchObject({
      ...{ runId, terminated: false },
      projections: { match: false, guarded: true, differingIds: [runId] },
    });
    // reap leaves a run that has not terminated alone.
    const reap = cli("reap", "--state-dir", stateDir);
    expect(reap.status, reap.stderr).toBe(0);
    expect(existsSync(join(stateDir, "workspaces", runId))).toBe(true);
  });

  // B5-4b: the edited row, then a forged event, each fail the replay of a good run.
  it(
    "refuses a replay on an edited projection row or a forged event",
    { timeout: T },
    () => {
      const { status, stderr, out } = runTask("write-file.turns.json");
      expect(status, stderr).toBe(0);
      editRunRow(out.runId);
      const edited = cli("replay", out.runId, "--state-dir", stateDir);
      expect(edited.status, edited.stderr).toBe(3);
      expect(JSON.parse(edited.stdout)).toMatchObject({
        ...{ match: true, permissionFaults: [], objectFaults: [] },
        projections: { match: false, guarded: true, differingIds: [out.runId] },
      });
      expect(cli("rebuild", "--state-dir", stateDir).status).toBe(0);
      expect(cli("replay", out.runId, "--state-dir", stateDir).status).toBe(0);
      // Any forged event fails every replay closed (exit 1), as rebuild does.
      rawAppend("decision.owner.answered", {});
      const seq = String(lastSeqRaw());
      const forged = cli("replay", out.runId, "--state-dir", stateDir);
      expect([forged.status, forged.stdout]).toEqual([1, ""]);
      expect(forged.stderr).toContain(
        "helmwright: replay refused (see inspect; until SIG a bad event needs a new state dir): session log: corrupt event at seq " +
          seq +
          ": ",
      );
    },
  );

  it(
    "replays a legacy run, and faults a later run with no Run (OD-B54-3)",
    { timeout: T },
    () => {
      const ended = {
        contextDigest: contextDigest([], []),
        terminal: { kind: "incomplete", reason: "cancelled" },
      };
      // Before any run.recorded: a run as a B5-3 build logged it, with no Run.
      openSessionLog(join(stateDir, "session.sqlite")).close();
      rawAppend("run.started", { tools: [] }, "run-legacy");
      rawAppend("run.terminated", ended, "run-legacy");
      const { status, stderr, out } = runTask("write-file.turns.json");
      expect(status, stderr).toBe(0);
      rawAppend("run.started", { tools: [] }, "run-unrecorded");
      rawAppend("run.terminated", ended, "run-unrecorded");
      const legacy = cli("replay", "run-legacy", "--state-dir", stateDir);
      expect(legacy.status, legacy.stderr).toBe(0);
      const passed = { match: true, permissionFaults: [] };
      expect(JSON.parse(legacy.stdout)).toMatchObject({
        ...{ ...passed, objectFaults: [], events: 2 },
        projections: { match: true },
      });
      const seq = String(lastSeqRaw() - 1);
      const late = cli("replay", "run-unrecorded", "--state-dir", stateDir);
      expect(late.status, late.stderr).toBe(3);
      expect(JSON.parse(late.stdout)).toMatchObject({
        ...{ ...passed, projections: { match: true } },
        objectFaults: ["seq " + seq + ": run.started without run.recorded"],
      });
      const events = logEvents().filter((e) => e.runId === out.runId);
      expectReplayMatches(out.runId, events.slice(2));
    },
  );

  it("explains inspect on a state dir it cannot write", { timeout: T }, () => {
    openSessionLog(join(stateDir, "session.sqlite")).close();
    chmodSync(stateDir, 0o500);
    try {
      const shown = cli("inspect", "--state-dir", stateDir);
      expect(shown.status, shown.stderr).toBe(1);
      expect(shown.stderr).toContain(
        "helmwright: inspect needs write access to the state dir, where SQLite creates the log's -shm file (WAL): attempt to write a readonly database",
      );
    } finally {
      chmodSync(stateDir, 0o700);
    }
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

/** The highest seq in the log, read raw (a checked read refuses a forged row). */
function lastSeqRaw(): number {
  const db = new DatabaseSync(join(stateDir, "session.sqlite"));
  try {
    return Number(db.prepare("SELECT MAX(seq) AS n FROM events").get()?.["n"]);
  } finally {
    db.close();
  }
}

/** S3, N1: appends a row with a raw connection, as a forger could. */
function rawAppend(type: string, payload: object, runId = "run-forged"): void {
  const db = new DatabaseSync(join(stateDir, "session.sqlite"));
  try {
    const next = "SELECT COALESCE(MAX(seq), -1) + 1 AS n FROM events";
    const seq = Number(db.prepare(next).get()?.["n"]);
    const at = "2026-10-07T00:00:00.000Z";
    const row = [
      seq,
      `forged-${String(seq)}`,
      runId,
      type,
      at,
      JSON.stringify(payload),
    ];
    const insert = "INSERT INTO events VALUES (?, 1, ?, 'g', ?, 'n', ?, ?, ?)";
    db.prepare(insert).run(...row);
  } finally {
    db.close();
  }
}

/** A turn whose execute call uses a reserved call ID (the Ring 0 one by default). */
function reservedTurns(id = RING0_ID): string {
  const turns = join(tmp, "reserved.turns.json");
  const argv = ["sh", "-c", "echo hi > a.txt"];
  writeFileSync(
    turns,
    JSON.stringify([
      {
        text: "Writing a.txt with the reserved ID.",
        toolCalls: [{ id, name: "execute", input: { argv } }],
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
        policyVersion: "default-2",
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
        policyVersion: "default-2",
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
        "floor.checked",
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

      // N1, S3: a forged acceptance is no baseline; a corrupt row of another type is never read.
      const config = events[0]?.payload["config"] as Record<string, string>;
      rawAppend("bad", {});
      for (const how of ["approved", "trusted"]) {
        const ring0Sha256 = config["ring0Sha256"];
        const forged = { repo: join(repo, ".git"), ring0Sha256, how };
        rawAppend("config.accepted", { ...forged, settings: {} });
      }
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
      const to = (
        startedOf(tty.out.runId)?.["config"] as Record<string, string>
      )["ring0Sha256"];
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
      expect(startedOf(out.runId)).toMatchObject({
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
      // A shallow clone of the removal hides the history: still asked.
      const thin = join(tmp, "shallow");
      git("clone", "--quiet", "--depth", "1", "file://" + repo, thin);
      const shallow = writeTask("write-file.turns.json", LIMITS, thin);
      const bare = cli("run", shallow, "--state-dir", join(tmp, "state3"));
      expect(JSON.parse(bare.stdout)).toMatchObject({
        terminal: { kind: "failed", error: NOT_APPROVED },
      });
    },
  );

  it(
    "asks at run start for a copy of helmwright's own config (B6-5, OQ2)",
    { timeout: T },
    () => {
      const own = fileURLToPath(
        new URL("../../../../helmwright.config.json", import.meta.url),
      );
      const bytes = readFileSync(own);
      commitConfig((path) => {
        writeFileSync(path, bytes);
      });
      // OQ1: helmwright's Ring 0 paths differ from the defaults, so the run asks first.
      const { status, stderr, out } = runTask("write-file.turns.json");
      expect(status, stderr).toBe(1);
      expect(out.terminal).toEqual({ kind: "failed", error: NOT_APPROVED });
      const events = expectWellFormedLog(out.runId);
      expect(events[0]?.payload).toMatchObject({
        policyVersion: "helmwright-1",
        config: { source: "file", sha256: sha256(bytes) },
      });
      expect(
        events
          .filter((e) => e.type.startsWith("permission."))
          .map((e) => e.payload),
      ).toMatchObject([
        {
          ...{ toolCallId: RING0_ID, action: "config.set", tier: "alwaysAsk" },
          ...{ ruleId: "always-ask.ring0-setting" },
          policyVersion: "helmwright-1",
        },
        { toolCallId: RING0_ID, presence: "none" },
        { toolCallId: RING0_ID, answer: "denied", by: "noPresence" },
      ]);
      expect(events.some((e) => e.type === "config.accepted")).toBe(false);
    },
  );

  it(
    "asks once in a repo whose latest baseline is a default-1 one (B6-5, S3)",
    { timeout: T },
    () => {
      // The default-1 policy: helmwright's source globs were in the floor then.
      const harness = ["loop", "log", "permission", "sandbox", "ledger"]
        .concat("scorer")
        .map((dir) => `packages/harness/src/${dir}/**`);
      const old = ["packages/harness/sandbox/**", "packages/schema/schemas/**"];
      const [evals, ...generic] = DEFAULT_PERMISSION_POLICY.ring0Paths;
      const ring0Paths = [...harness, ...old, evals, "packages/*/evals/**"];
      const policy = { ...DEFAULT_PERMISSION_POLICY, version: "default-1" };
      // Its Ring 0 digest, through the loader, from a scratch repo that commits it.
      const scratch = join(tmp, "scratch");
      git("init", "--quiet", scratch);
      const text = JSON.stringify({
        permissions: {
          policy: { ...policy, ring0Paths: [...ring0Paths, ...generic] },
        },
      });
      writeFileSync(join(scratch, CONFIG), text);
      git("-C", scratch, "add", CONFIG);
      git(
        ...["-C", scratch, "-c", "user.name=e2e", "-c", "user.email=e@x.com"],
        ...["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "old"],
      );
      const before = loadRunConfig(scratch);
      // A clean default run, then a default-1-era acceptance as the latest baseline.
      expect(runTask("write-file.turns.json").status).toBe(0);
      const ring0Sha256 = before.record.ring0Sha256;
      rawAppend("run.started", { config: { ring0Sha256 } });
      rawAppend("config.accepted", {
        ...{ repo: join(repo, ".git"), ring0Sha256, how: "default" },
        settings: ring0SettingDigests(before.ring0),
      });
      const { status, stderr, out } = runTask("write-file.turns.json");
      expect(status, stderr).toBe(1);
      expect(out.terminal).toEqual({ kind: "failed", error: NOT_APPROVED });
      const events = logEvents().filter((e) => e.runId === out.runId);
      // Asked before the first message and any tool call; only `permissions` changed.
      // B5-4: task-1 is recorded by the first run, so only the Run is new.
      expect(events.map((e) => e.type)).toEqual([
        ...["run.recorded", "run.started", "permission.evaluated"],
        ...["permission.asked", "permission.answered", "floor.checked"],
        "run.terminated",
      ]);
      expect(events.slice(2, 5).map((e) => e.payload)).toMatchObject([
        {
          ...{ toolCallId: RING0_ID, ruleId: "always-ask.ring0-setting" },
          ...{ policyVersion: "default-2", target: { value: "permissions" } },
        },
        { toolCallId: RING0_ID, presence: "none" },
        { toolCallId: RING0_ID, answer: "denied", by: "noPresence" },
      ]);
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

const OVERRIDE_ID = "helmwright.intake.override";
const OVERRIDE_END =
  "Approve config.set (always-ask.ring0-setting, alwaysAsk)? [y/N] ";
const sha256Of = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const NONE_DECLARED = {
  newDependencies: [],
  newModules: [],
  surfaceChanges: [],
  newProcessBoundary: false,
};
const payloadsOf = (events: readonly Event[], type: string) =>
  events.filter((e) => e.type === type).map((e) => e.payload);

describe("intake (e2e, B10-2)", () => {
  it(
    "classifies a docs-only task as a chore before the first engine step",
    { timeout: T },
    () => {
      const scope = ["docs/a.md", "docs/a.md"];
      const { status, stderr, out } = runIntake("write-file.turns.json", {
        scope,
      });
      expect(status, stderr).toBe(0);
      expect(stderr).toContain(
        "helmwright: intake chore (docsOnly: docs/a.md) friction minimal\n",
      );
      const events = expectWellFormedLog(out.runId);
      expect(events.slice(0, 4).map((e) => e.type)).toEqual([
        ...["run.started", "config.accepted", "intake.classified"],
        "message.appended",
      ]);
      expect(events[2]?.payload).toEqual({
        kind: "intake.classified",
        taskId: "task-1",
        class: "chore",
        rubricVersion: "intake-rubric-1",
        reasons: [{ rule: "docsOnly", entries: ["docs/a.md"] }],
        scope: ["docs/a.md"],
        scopeSha256: sha256Of(["docs/a.md"]),
        ring0Sha256: events[2]?.payload["ring0Sha256"],
        declared: NONE_DECLARED,
        friction: { intensity: "minimal", source: "choreDowngrade" },
        sparring: "optIn",
      });
      expect(events[2]?.payload["ring0Sha256"]).toMatch(/^[0-9a-f]{64}$/);
      // No intake data enters the engine's context.
      const texts = deriveMessages(events, out.runId).map((m) => m.text);
      expect(texts.join("\n")).not.toContain("chore");
      expectReplayMatches(out.runId, events);
    },
  );

  it(
    "classifies declared facts, code, Ring 0 paths and no scope",
    { timeout: T },
    () => {
      const cases: [object | undefined, string, object[]][] = [
        [
          { scope: ["src/a.ts"], declared: { newDependencies: ["left-pad"] } },
          "architectural",
          [{ rule: "newDependencies", entries: ["left-pad"] }],
        ],
        [
          { scope: ["src/**"] },
          "bounded",
          [{ rule: "notDocsOrTests", entries: ["src/**"] }],
        ],
        [
          { scope: ["docs/a.md", ".github/notes.md"] },
          "bounded",
          [{ rule: "ring0Path", entries: [".github/notes.md"] }],
        ],
        [
          undefined,
          "architectural",
          [{ rule: "noDeclaredScope", entries: [] }],
        ],
      ];
      for (const [i, [intake, cls, reasons]] of cases.entries()) {
        stateDir = join(tmp, "state-" + String(i)); // one run per log
        const { status, stderr, out } = runIntake("denied.turns.json", intake);
        expect(status, stderr).toBe(0);
        expect(stderr).toContain("helmwright: intake " + cls + " (");
        const events = expectWellFormedLog(out.runId);
        const [classified] = payloadsOf(events, "intake.classified");
        expect(classified).toMatchObject({
          class: cls,
          reasons,
          friction: { intensity: "moderate", source: "default" },
        });
        if (intake === undefined) {
          expect(classified).toMatchObject({
            scope: [],
            scopeSha256: sha256Of([]),
            declared: NONE_DECLARED,
          });
        }
        expectReplayMatches(out.runId, events);
      }
    },
  );

  it(
    "logs an upward override without an ask, and no event for the same class",
    { timeout: T },
    () => {
      const intake = { scope: ["docs/a.md"] };
      const up = runIntake(
        "denied.turns.json",
        intake,
        ...["--class", "architectural", "--reason", "needs a review"],
      );
      expect(up.status, up.stderr).toBe(0);
      const events = expectWellFormedLog(up.out.runId);
      // OD-B54-2: the Run records the rubric's class; the override is its own event.
      expect(objectOf(up.out.runId)).toMatchObject({ class: "chore" });
      expect(events.slice(2, 5).map((e) => e.type)).toEqual([
        ...["intake.classified", "intake.overridden", "message.appended"],
      ]);
      expect(events[3]?.payload).toEqual({
        kind: "intake.overridden",
        taskId: "task-1",
        from: "chore",
        to: "architectural",
        reason: "needs a review",
        by: "cli",
        attestation: { kind: "none" },
        scopeSha256: sha256Of(["docs/a.md"]),
        rubricVersion: "intake-rubric-1",
        // B10-3 S2: the effective friction of `to`, not the chore's minimal.
        friction: { intensity: "moderate", source: "default" },
      });
      const ids = events.map((e) => e.payload["toolCallId"]);
      expect(ids).not.toContain(OVERRIDE_ID);
      // N8: the effective class and its friction (S2: default, not the chore's minimal).
      expect(up.stderr).toContain(
        "helmwright: intake override: architectural friction moderate\n",
      );
      expectReplayMatches(up.out.runId, events);

      const same = runIntake(
        "denied.turns.json",
        intake,
        ...["--class", "chore", "--reason", "it is a chore"],
      );
      expect(same.status, same.stderr).toBe(0);
      const later = logEvents().filter((e) => e.runId === same.out.runId);
      expect(payloadsOf(later, "intake.overridden")).toEqual([]);
    },
  );

  it(
    "fails a downward override before any engine step with nobody present",
    { timeout: T },
    () => {
      const { status, stderr, out } = runIntake(
        "write-file.turns.json",
        { scope: ["src/a.ts"] },
        ...["--class", "chore", "--reason", "formatting only"],
      );
      expect(status, stderr).toBe(1);
      expect(out.terminal).toEqual({
        kind: "failed",
        error: "downward intake override was not approved",
      });
      const events = expectWellFormedLog(out.runId);
      expect(events.map((e) => e.type)).toEqual([
        ...["run.started", "config.accepted", "intake.classified"],
        ...["permission.evaluated", "permission.asked", "permission.answered"],
        "floor.checked",
        "run.terminated",
      ]);
      expect(events.slice(3, 6).map((e) => e.payload)).toMatchObject([
        {
          ...{ toolCallId: OVERRIDE_ID, requested: "config.set" },
          ...{ tier: "alwaysAsk", ruleId: "always-ask.ring0-setting" },
        },
        { toolCallId: OVERRIDE_ID, presence: "none" },
        { toolCallId: OVERRIDE_ID, answer: "denied", by: "noPresence" },
      ]);
      const replay = cli("replay", out.runId, "--state-dir", stateDir);
      expect(JSON.parse(replay.stdout)).toMatchObject({
        terminated: true,
        permissionFaults: [],
      });
    },
  );

  it.skipIf(NO_PTY)(
    "logs a downward override the owner approved at the TTY" +
      (NO_PTY ? " [skipped: script(1) not found]" : ""),
    { timeout: T },
    async () => {
      const { status, shown, out } = await runAtTty(
        "write-file.turns.json",
        answerOnce("y", OVERRIDE_END),
        "x",
        {
          intake: { scope: ["src/a.ts"] },
          args: "--class chore --reason formatting-only",
        },
      );
      expect(status, shown).toBe(0);
      expect(shown).toContain("intake.classification");
      const events = expectWellFormedLog(out.runId);
      expect(events.slice(2, 8).map((e) => e.type)).toEqual([
        ...["intake.classified", "permission.evaluated", "permission.asked"],
        ...["permission.answered", "intake.overridden", "message.appended"],
      ]);
      expect(events[5]?.payload).toMatchObject({
        toolCallId: OVERRIDE_ID,
        answer: "approved",
        by: "tty",
      });
      // OD-B54-2: the approved downward override does not change the Run's class.
      expect(objectOf(out.runId)).toMatchObject({ class: "bounded" });
      expect(events[6]?.payload).toMatchObject({
        from: "bounded",
        to: "chore",
        reason: "formatting-only",
        friction: { intensity: "minimal", source: "choreDowngrade" },
      });
      expectReplayMatches(out.runId, events);
    },
  );

  it(
    "exits 64 on a bad override or scope, logging nothing",
    { timeout: T },
    () => {
      const bad: [object, string[]][] = [
        [{ scope: ["docs/a.md"] }, ["--class", "chore"]],
        [{ scope: ["docs/a.md"] }, ["--reason", "why"]],
        [{ scope: ["docs/a.md"] }, ["--class", "trivial", "--reason", "why"]],
        [{ scope: ["docs/a.md"] }, ["--class", "chore", "--reason", "  "]],
        [{ scope: ["!src/*.md"] }, []],
        [{ scope: ["docs/a.md"], extra: true }, []],
        [{ declared: { newModules: "x" } }, []],
        // N4: the rubric's limits are the schema's.
        [{ declared: { surfaceChanges: Array(65).fill("wire") } }, []],
        // N6: a reason of only invisible characters is blank.
        [
          { scope: ["docs/a.md"] },
          ["--class", "chore", "--reason", "\u200b\u2060"],
        ],
      ];
      for (const [intake, args] of bad) {
        const task = writeTask("denied.turns.json", LIMITS, repo, { intake });
        const result = cli("run", task, "--state-dir", stateDir, ...args);
        expect(result.status, result.stderr).toBe(64);
        expect(result.stdout).toBe("");
      }
      expect(existsSync(join(stateDir, "session.sqlite"))).toBe(false);
      expect(existsSync(join(stateDir, "workspaces"))).toBe(false);
    },
  );

  it(
    "classifies a scope reached through a Ring 0 symlink as bounded (S1)",
    { timeout: T },
    () => {
      mkdirSync(join(repo, "docs"));
      mkdirSync(join(repo, ".github"));
      writeFileSync(join(repo, "docs", "owners.md"), "* @owner\n");
      symlinkSync("../docs/owners.md", join(repo, ".github", "CODEOWNERS"));
      git("-C", repo, "add", "-A");
      git(
        ...["-C", repo, "-c", "user.name=e2e", "-c", "user.email=e2e@x.com"],
        ...["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "link"],
      );
      const { status, stderr, out } = runIntake("denied.turns.json", {
        scope: ["docs/owners.md"],
      });
      expect(status, stderr).toBe(0);
      expect(stderr).toContain("helmwright: intake bounded (ring0Path: ");
      const events = expectWellFormedLog(out.runId);
      // OD-B54-2: the Run records the class after the link targets raised it.
      expect(objectOf(out.runId)).toMatchObject({ class: "bounded" });
      expect(payloadsOf(events, "intake.classified")).toMatchObject([
        {
          class: "bounded",
          reasons: [{ rule: "ring0Path", entries: ["docs/owners.md"] }],
          friction: { intensity: "moderate", source: "default" },
        },
      ]);
      expectReplayMatches(out.runId, events);
    },
  );

  it(
    "fails a run whose Ring 0 link targets exceed the rubric's limit (B10-3)",
    { timeout: T },
    () => {
      // With the floor's paths these 1020 link targets exceed the rubric's 1024.
      mkdirSync(join(repo, "t"));
      mkdirSync(join(repo, ".github"));
      for (let i = 0; i < 1020; i++) {
        const name = String(i) + ".md";
        writeFileSync(join(repo, "t", name), "x\n");
        symlinkSync("../t/" + name, join(repo, ".github", name));
      }
      git("-C", repo, "add", "-A");
      git(
        ...["-C", repo, "-c", "user.name=e2e", "-c", "user.email=e2e@x.com"],
        ...["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "links"],
      );
      const { status, stderr, out } = runIntake("write-file.turns.json", {
        scope: ["docs/a.md"],
      });
      expect(status, stderr).toBe(1);
      expect(out.terminal).toEqual({
        kind: "failed",
        error:
          "run refused: the worktree's Ring 0 link targets exceed the intake rubric's limits",
      });
      const events = expectWellFormedLog(out.runId);
      expect(events.map((e) => e.type)).toEqual([
        ...[
          "run.started",
          "config.accepted",
          "floor.checked",
          "run.terminated",
        ],
      ]);
      const replay = cli("replay", out.runId, "--state-dir", stateDir);
      expect(JSON.parse(replay.stdout)).toMatchObject({
        terminated: true,
        permissionFaults: [],
      });
    },
  );

  it(
    "still always-asks a deploy in a chore, and refuses the reserved ID",
    { timeout: T },
    () => {
      const intake = { scope: ["docs/a.md"] };
      const chore = runIntake("deploy.turns.json", intake);
      expect(chore.status, chore.stderr).toBe(0);
      const events = expectWellFormedLog(chore.out.runId);
      expect(payloadsOf(events, "intake.classified")).toMatchObject([
        { class: "chore", friction: { intensity: "minimal" } },
      ]);
      expect(payloadsOf(events, "permission.evaluated")).toMatchObject([
        {
          toolCallId: "call-1",
          tier: "alwaysAsk",
          ruleId: "always-ask.deploy",
        },
      ]);
      expect(payloadsOf(events, "loop.tool.called")).toMatchObject([
        { status: "denied" },
      ]);

      const reserved = runIntake(reservedTurns(OVERRIDE_ID), intake);
      expect(reserved.status, reserved.stderr).toBe(0);
      const later = logEvents().filter((e) => e.runId === reserved.out.runId);
      expect(
        later.filter((e) => e.type.startsWith("permission.")),
      ).toMatchObject([
        {
          type: "permission.rejected",
          payload: {
            toolCallId: OVERRIDE_ID,
            ruleId: "schema.duplicate-call-id",
          },
        },
      ]);
      const workspace = join(stateDir, "workspaces", reserved.out.runId);
      expect(existsSync(join(workspace, "a.txt"))).toBe(false);
      expectReplayMatches(reserved.out.runId, later);
    },
  );
});

/** Exit 64 with `message` on stderr, before anything is logged or created. */
function expectTaskRefused(task: string, message: string): void {
  const result = cli("run", task, "--state-dir", stateDir);
  expect(result.status, result.stderr).toBe(64);
  expect(result.stderr).toContain("helmwright: " + message + "\n");
  expect(result.stdout).toBe("");
}

describe("Task and Run records (e2e, B5-4)", () => {
  it(
    "records the Task and the Run, and reuses an unchanged Task",
    { timeout: T },
    () => {
      const intake = { scope: ["src/b.ts", "src/a.ts", "src/a.ts"] };
      const first = runIntake("write-file.turns.json", intake);
      expect(first.status, first.stderr).toBe(0);
      const events = expectWellFormedLog(first.out.runId);
      const [created, recorded] = logEvents();
      const started = events[0];
      expect(objectOf("task-1")).toEqual({
        ...{ id: "task-1", kind: "task", ring: 0, createdAt: created?.at },
        ...{ createdSeq: 0, repoId: join(repo, ".git"), text: "e2e task" },
        ...{ scope: ["src/a.ts", "src/b.ts"], status: "open" },
      });
      const [classified] = payloadsOf(events, "intake.classified");
      expect(objectOf(first.out.runId)).toEqual({
        ...{ id: first.out.runId, kind: "run", ring: 0, taskId: "task-1" },
        ...{ createdAt: recorded?.at, createdSeq: 1, engine: "scripted" },
        ...{ graphId: started?.graphId, nodeId: started?.nodeId },
        baseCommit: started?.payload["baseCommit"],
        class: classified?.["class"],
        terminal: first.out.terminal,
      });
      expect(classified?.["class"]).toBe("bounded");

      // OD-B54-1: a re-run of the same Task records only a new Run.
      const second = runIntake("write-file.turns.json", intake);
      expect(second.status, second.stderr).toBe(0);
      const later = logEvents().filter((e) => e.runId === second.out.runId);
      expect(later.slice(0, 2).map((e) => e.type)).toEqual([
        ...["run.recorded", "run.started"],
      ]);
      const types = logEvents().map((e) => e.type);
      expect(types.filter((t) => t === "task.created")).toHaveLength(1);
      expect(types.filter((t) => t === "run.recorded")).toHaveLength(2);
      expect(objectOf(second.out.runId)).toMatchObject({
        ...{ taskId: "task-1", class: "bounded" },
        terminal: second.out.terminal,
      });
      expectReplayMatches(second.out.runId, later);

      // A changed Task is refused before anything is logged or created.
      const seq = logEvents().length;
      const worktrees = git("-C", repo, "worktree", "list", "--porcelain");
      const workspaces = readdirSync(join(stateDir, "workspaces"));
      const changed: [object, string][] = [
        [{ title: "another task", intake }, "title"],
        [{ intake: { scope: ["src/a.ts"] } }, "intake.scope"],
      ];
      for (const [extra, what] of changed) {
        expectTaskRefused(
          writeTask("write-file.turns.json", LIMITS, repo, extra),
          "task.id task-1 is already recorded in this state dir with a different " +
            what +
            "; a Task never changes (D-2): give the changed task a new id",
        );
      }
      expect(logEvents()).toHaveLength(seq);
      expect(git("-C", repo, "worktree", "list", "--porcelain")).toBe(
        worktrees,
      );
      expect(readdirSync(join(stateDir, "workspaces"))).toEqual(workspaces);
    },
  );

  it(
    "removes the worktree when the start transaction fails",
    { timeout: T },
    () => {
      const file = join(stateDir, "session.sqlite");
      openSessionLog(file).close();
      const spaces = join(stateDir, "workspaces");
      const listed = () => (existsSync(spaces) ? readdirSync(spaces) : []);
      const worktrees = git("-C", repo, "worktree", "list", "--porcelain");
      // Another writer holds the log, so run.started's transaction gets SQLITE_BUSY.
      const lock = new DatabaseSync(file);
      lock.exec("BEGIN IMMEDIATE");
      try {
        const task = writeTask("write-file.turns.json", LIMITS, repo);
        const result = cli("run", task, "--state-dir", stateDir);
        expect(result.status, result.stderr).toBe(1);
        expect(result.stderr).toContain("locked");
      } finally {
        lock.exec("ROLLBACK");
        lock.close();
      }
      expect(git("-C", repo, "worktree", "list", "--porcelain")).toBe(
        worktrees,
      );
      expect(listed()).toEqual([]);
      expect(logEvents()).toHaveLength(0);
    },
  );

  it(
    "exits 64 on a task ID without task- or a title the Task refuses (D-1)",
    { timeout: T },
    () => {
      const turns = "write-file.turns.json";
      expectTaskRefused(
        writeTask(turns, LIMITS, repo, { id: "1" }),
        'task.id must match ^task-[A-Za-z0-9][A-Za-z0-9_-]{0,122}$ (since B5-4 a task id starts with "task-", e.g. rename "1" to "task-1")',
      );
      const titles = [
        "x".repeat(8193),
        "left \u202e right",
        " \n\t",
        "a\u0000",
      ];
      for (const title of titles) {
        expectTaskRefused(
          writeTask(turns, LIMITS, repo, { title }),
          "task.title must be 1 to 8192 characters, not only spaces, without control characters other than tab and line breaks, or bidi controls",
        );
      }
      expect(existsSync(stateDir)).toBe(false);
    },
  );
});

const FLOOR_REJECTED = "sensor floor rejected the candidate";
const FLOOR_UNCHECKED = "sensor floor could not check the candidate: ";

/** B3-2: a repo with a test script, a source file, and a test with two assertions. */
function seedFloorRepo(): string {
  mkdirSync(join(repo, "src"));
  mkdirSync(join(repo, "test"));
  const scripts = { test: "vitest run" };
  const pkg = { name: "seed", private: true, scripts };
  writeFileSync(join(repo, "package.json"), JSON.stringify(pkg, null, 2));
  writeFileSync(join(repo, "src", "a.ts"), "export const a = 1;\n");
  const test = [
    'import { expect, it } from "vitest";',
    'import { a } from "../src/a.ts";',
    'it("adds", () => {',
    "  expect(a).toBe(1);",
    "  expect(a + 1).toBe(2);",
    "});",
  ];
  writeFileSync(join(repo, "test", "a.test.ts"), test.join("\n") + "\n");
  git("-C", repo, "add", "-A");
  git(
    ...["-C", repo, "-c", "user.name=e2e", "-c", "user.email=e2e@x.com"],
    ...["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "seed"],
  );
  return git("-C", repo, "rev-parse", "HEAD").trim();
}

/** Turns whose one execute call runs `script` with sh in the worktree. */
function shTurns(script: string): string {
  const turns = join(tmp, "floor.turns.json");
  const argv = ["sh", "-c", script];
  writeFileSync(
    turns,
    JSON.stringify([
      {
        text: "Changing the candidate.",
        toolCalls: [{ id: "call-1", name: "execute", input: { argv } }],
        claimsDone: false,
      },
      { text: "Changed.", toolCalls: [], claimsDone: true },
    ]),
  );
  return turns;
}

const rulePath = (f: Record<string, unknown>) => [f["rule"], f["path"]];

/** The run's one floor.checked, which must come directly before run.terminated. */
function floorOf(events: readonly Event[]) {
  expect(events.filter((e) => e.type === "floor.checked")).toHaveLength(1);
  expect(events.at(-2)?.type).toBe("floor.checked");
  const checked = events.at(-2)?.payload ?? {};
  const findings = (checked["findings"] ?? []) as Record<string, unknown>[];
  return { checked, findings, found: findings.map(rulePath) };
}

/** Runs `script` in a run of the CLI; returns its output, log and floor check. */
function runFloor(script: string) {
  const result = runWith(writeTask(shTurns(script)));
  const events = expectWellFormedLog(result.out.runId);
  return { ...result, events, ...floorOf(events) };
}

/** OQ-B3-2: a would-be completed run fails, the CLI says why and exits 1. */
function expectRejected(run: ReturnType<typeof runFloor>, base: string) {
  expect(run.status, run.stderr).toBe(1);
  expect(run.out.terminal).toEqual({ kind: "failed", error: FLOOR_REJECTED });
  expect(run.checked).toMatchObject({
    ...{ kind: "floor.checked", rules: "floor-4", baseCommit: base },
    ...{ verdict: "reject", truncated: false },
  });
  const findings = String(run.found.length) + " findings (";
  expect(run.stderr).toContain("helmwright: floor reject: " + findings);
  expectReplayMatches(run.out.runId, run.events);
}

describe("sensor floor (e2e, B3-2)", () => {
  it("passes a source edit and completes (F0)", { timeout: T }, () => {
    const base = seedFloorRepo();
    const run = runFloor("echo 'export const b = 2;' >> src/a.ts");
    expect(run.status, run.stderr).toBe(0);
    expect(run.out.terminal).toEqual({ kind: "completed" });
    expect(run.checked).toMatchObject({
      ...{ rules: "floor-4", baseCommit: base, verdict: "pass" },
      ...{ findings: [], truncated: false },
    });
    expect(run.checked["candidateTree"]).toMatch(/^[0-9a-f]{40}$/);
    expect(run.stderr).toContain("helmwright: floor pass\n");
    expectReplayMatches(run.out.runId, run.events);
  });

  it("rejects an added lint suppression (F1, AC9)", { timeout: T }, () => {
    const base = seedFloorRepo();
    const marker = "// eslint-" + "disable-next-line no-console";
    const run = runFloor("echo '" + marker + "' >> src/a.ts");
    expectRejected(run, base);
    expect(run.found).toEqual([["suppression.added", "src/a.ts"]]);
  });

  it("rejects a weakened test command (F2, AC9)", { timeout: T }, () => {
    const base = seedFloorRepo();
    const run = runFloor("sed -i 's/vitest run/exit 0/' package.json");
    expectRejected(run, base);
    expect(run.found).toEqual([
      ["package.changed", "package.json"],
      ["protected.changed", "package.json"],
    ]);
    expect(run.findings[0]?.["detail"]).toBe("scripts.test changed");
  });

  it("rejects a nested test config (F3)", { timeout: T }, () => {
    const base = seedFloorRepo();
    const run = runFloor("echo 'export default 1;' > src/vitest.config.ts");
    expectRejected(run, base);
    expect(run.found).toEqual([["config.changed", "src/vitest.config.ts"]]);
  });

  it.skipIf(NO_PTY)(
    "rejects a removed assertion in an approved Ring 0 test (F4, OQ-B3-3)" +
      (NO_PTY ? " [skipped: script(1) not found]" : ""),
    { timeout: T },
    async () => {
      seedFloorRepo();
      commitStrict("floor-test-1", ["test/**"]);
      const base = git("-C", repo, "rev-parse", "HEAD").trim();
      const turns = shTurns("sed -i '/a + 1/d' test/a.test.ts");
      const { drive } = viewThenApprove(RING0_END);
      const tty = await runAtTty(turns, drive);
      expect(tty.status, tty.shown).toBe(1);
      expect(tty.out.terminal).toEqual({
        kind: "failed",
        error: FLOOR_REJECTED,
      });
      const events = expectWellFormedLog(tty.out.runId);
      expect(events.map((e) => e.type)).toContain("config.accepted");
      const { checked, found } = floorOf(events);
      expect(checked).toMatchObject({ baseCommit: base, verdict: "reject" });
      expect(found).toContainEqual(["protected.changed", "test/a.test.ts"]);
      expect(tty.shown).toContain("helmwright: floor reject: ");
      expectReplayMatches(tty.out.runId, events);
    },
  );

  it(
    "checks only after a background writer is gone (SF-1)",
    { timeout: T },
    async () => {
      seedFloorRepo();
      const run = runFloor("(sleep 3; echo x >> src/a.ts) & exit 0");
      expect(run.status, run.stderr).toBe(0);
      expect(run.checked).toMatchObject({ verdict: "pass" });
      await new Promise((done) => setTimeout(done, 4_000));
      const workspace = join(stateDir, "workspaces", run.out.runId);
      expect(readFileSync(join(workspace, "src", "a.ts"), "utf8")).toBe(
        "export const a = 1;\n",
      );
    },
  );

  it("fails closed when the gitfile is rewritten (F5)", { timeout: T }, () => {
    seedFloorRepo();
    const run = runWith(writeTask(shTurns("echo 'gitdir: /tmp' > .git")));
    expect(run.status, run.stderr).toBe(1);
    expect(run.out.terminal).toEqual({
      kind: "failed",
      error: FLOOR_UNCHECKED + "the worktree's .git does not match its git dir",
    });
    expect(run.stderr).toContain("helmwright: floor not checked\n");
    const events = expectWellFormedLog(run.out.runId);
    expect(events.some((e) => e.type === "floor.checked")).toBe(false);
    expect(events.at(-2)?.type).toBe("message.appended");
    expectReplayMatches(run.out.runId, events);
  });
});
