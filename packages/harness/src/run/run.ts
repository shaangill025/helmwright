import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { Event } from "@helmwright/schema";
import { checkWorkspace, createBroker, type Broker } from "../broker/broker.ts";
import { loadScriptedEngine } from "../engine/scripted.ts";
import {
  MESSAGE_APPENDED,
  assertNoDesync,
  deriveMessages,
} from "../log/messages.ts";
import { openSessionLog, type SessionLog } from "../log/session-log.ts";
import { runLoop, validateLimits, type LoopResult } from "../loop/loop.ts";
import { canonicalJson } from "../loop/reminders.ts";
import { errorMessage, summarize, type Terminal } from "../loop/terminal.ts";
import type {
  Engine,
  ExecuteTool,
  LoopLimits,
  Message,
  ToolSpec,
} from "../loop/types.ts";
import { buildSandboxImage, reapSandboxContainers } from "../sandbox/docker.ts";

/** The caller's input was missing or invalid (the CLI exits 64). */
export class UsageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "UsageError";
  }
}

/** The run was cancelled during setup, before anything was logged (the CLI exits 2). */
export class CancelledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CancelledError";
  }
}

export interface Task {
  readonly id: string;
  readonly title: string;
  /** Absolute path of the git repository a run's worktree is created from. */
  readonly repo: string;
  /** `turns` is resolved against the task file's directory. */
  readonly engine: { readonly kind: "scripted"; readonly turns: string };
  readonly limits: LoopLimits;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
type Fields = Record<string, unknown>;
const isRecord = (v: unknown): v is Fields =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function fields(v: unknown, keys: readonly string[], where: string): Fields {
  if (!isRecord(v)) throw new UsageError(`${where} must be an object`);
  const actual = Object.keys(v).sort().join(",");
  if (actual !== [...keys].sort().join(",")) {
    throw new UsageError(`${where} must have exactly: ${keys.join(", ")}`);
  }
  return v;
}

/** Reads and strictly validates a task file. @throws UsageError */
export function loadTask(taskFile: string): Task {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(taskFile, "utf8"));
  } catch (error) {
    throw new UsageError(`cannot read task file: ${errorMessage(error)}`);
  }
  const t = fields(json, ["id", "title", "repo", "engine", "limits"], "task");
  const engine = fields(t["engine"], ["kind", "turns"], "task.engine");
  const { id, title, repo, limits } = t;
  if (typeof id !== "string" || !ID.test(id)) {
    throw new UsageError(`task.id must match ${ID.source}`);
  }
  if (typeof title !== "string" || title.trim() === "") {
    throw new UsageError("task.title must be a non-empty string");
  }
  if (typeof repo !== "string" || !isAbsolute(repo)) {
    throw new UsageError("task.repo must be an absolute path");
  }
  if (engine["kind"] !== "scripted") {
    throw new UsageError('task.engine.kind must be "scripted"');
  }
  const turns = engine["turns"];
  if (typeof turns !== "string" || turns === "") {
    throw new UsageError("task.engine.turns must be a path");
  }
  if (!isRecord(limits)) throw new UsageError("task.limits must be an object");
  try {
    validateLimits(limits as unknown as LoopLimits);
  } catch (error) {
    throw new UsageError(`task.limits: ${errorMessage(error)}`);
  }
  return {
    id,
    title,
    repo,
    engine: { kind: "scripted", turns: resolve(dirname(taskFile), turns) },
    limits: limits as unknown as LoopLimits,
  };
}

/** task.repo must be the top level of a git repository, never a directory inside one. */
function checkRepoRoot(repo: string): void {
  let top: string;
  let real: string;
  try {
    real = realpathSync(repo);
    const args = ["-C", repo, "rev-parse", "--show-toplevel"];
    const out = execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    top = realpathSync(out.trim());
  } catch (error) {
    const why = errorMessage(error);
    throw new UsageError(`task.repo is not a git repository: ${why}`);
  }
  if (top !== real) {
    throw new UsageError(
      `task.repo must be its repository's top level: ${top}`,
    );
  }
}

/**
 * sha256 (hex) of the canonical JSON of the tools offered and the context messages.
 * Without a hash chain over the log, a log rewritten consistently (messages, tools
 * and digest) still matches: this detects divergence, not tampering (a later slice).
 */
export function contextDigest(
  messages: readonly Message[],
  tools: readonly ToolSpec[],
): string {
  return createHash("sha256")
    .update(canonicalJson({ tools, messages }))
    .digest("hex");
}

/** A set-up run: everything from `run.started` to `run.terminated`. */
export interface RunSetup {
  readonly log: SessionLog;
  readonly graphId: string;
  readonly runId: string;
  readonly nodeId: string;
  readonly title: string;
  readonly limits: LoopLimits;
  /** Further `run.started` fields (task, repo, workspace, image, engine). */
  readonly started: Readonly<Record<string, unknown>>;
  readonly engine: Engine;
  readonly tools: readonly ToolSpec[];
  readonly executeTool: ExecuteTool;
  /** Aborting ends the run as incomplete("cancelled"). */
  readonly signal?: AbortSignal;
  /** Dev-mode desync check before every engine step and at the end. Default true. */
  readonly checkDesync?: boolean;
}

export interface RunOutcome {
  readonly terminal: Terminal;
  readonly summary: string;
  readonly iterations: number;
  readonly toolCalls: number;
  /** Digest of the tools and the loop's own transcript; null if the loop never returned. */
  readonly contextDigest: string | null;
}

/**
 * Logs `run.started`, drives the loop and logs `run.terminated`. Each message is
 * logged when the loop creates it; the engine receives the context derived from
 * the log, which (dev mode) must equal the loop's in-memory messages. Once
 * `run.started` is logged this never rejects: anything thrown later ends the run
 * as failed, with a best-effort `run.terminated`.
 * @throws if `run.started` cannot be logged.
 */
export async function executeRun(setup: RunSetup): Promise<RunOutcome> {
  const { log, graphId, runId, nodeId, tools } = setup;
  // The first failed append is the cause; a later desync is only its effect.
  let logFailure: { error: unknown } | undefined;
  const append = (type: string, payload: Record<string, unknown>): Event => {
    try {
      return log.append({
        eventId: randomUUID(),
        graphId,
        runId,
        nodeId,
        type,
        at: new Date().toISOString(),
        payload,
      });
    } catch (error) {
      logFailure ??= { error };
      throw error;
    }
  };
  const logMessage = (message: Message) => {
    append(MESSAGE_APPENDED, { message });
  };
  const derive = (sent: readonly Message[]): Message[] => {
    const events = log.events({ runId });
    if (setup.checkDesync !== false) assertNoDesync(sent, events, runId);
    return deriveMessages(events, runId);
  };

  append("run.started", {
    ...setup.started,
    limits: { ...setup.limits },
    tools,
  });
  let result: LoopResult | undefined;
  const outcome = (terminal: Terminal, summary: string): RunOutcome => ({
    terminal,
    summary,
    iterations: result?.iterations ?? 0,
    toolCalls: result?.toolCalls ?? 0,
    contextDigest:
      result === undefined
        ? null
        : contextDigest(result.transcript.messages, tools),
  });
  try {
    const first: Message = { role: "user", text: setup.title };
    logMessage(first);
    result = await runLoop(
      {
        agentId: nodeId,
        messages: [first],
        tools,
        limits: setup.limits,
        ...(setup.signal === undefined ? {} : { signal: setup.signal }),
      },
      {
        engine: {
          async step(input) {
            const messages = derive(input.messages);
            return setup.engine.step({ ...input, messages });
          },
        },
        executeTool: setup.executeTool,
        clock: { now: () => performance.now() },
        onMessage: logMessage,
        // run.terminated is appended below, with the context digest.
        emit: (type, payload) => {
          if (type !== "run.terminated") append(type, payload);
        },
      },
    );
    derive(result.transcript.messages);
    const ended = outcome(result.terminal, result.summary);
    append("run.terminated", { agentId: nodeId, ...ended });
    return ended;
  } catch (error) {
    const cause = logFailure?.error ?? error;
    const terminal: Terminal = { kind: "failed", error: errorMessage(cause) };
    const ended = outcome(terminal, summarize(terminal, ""));
    try {
      append("run.terminated", { agentId: nodeId, ...ended });
    } catch {
      // Best effort: the log itself may be what failed.
    }
    return ended;
  }
}

export interface RunTaskOptions {
  readonly taskFile: string;
  readonly stateDir: string;
  /** Aborting ends the run as incomplete("cancelled"). */
  readonly signal?: AbortSignal;
  /** Dev-mode desync check before every engine step and at the end. Default true. */
  readonly checkDesync?: boolean;
}

export interface RunTaskResult extends RunOutcome {
  readonly graphId: string;
  readonly runId: string;
  readonly nodeId: string;
  readonly workspace: string;
}

const LOG_FILE = "session.sqlite";
const WORKSPACES = "workspaces";
const NO_HOOKS = ["-c", "core.hooksPath=/dev/null"];

/**
 * Runs a task: validates the task, repo and state dir, reaps orphaned sandbox
 * containers, builds the sandbox image, creates the run's git worktree under `<stateDir>/workspaces/<runId>`, and
 * drives the loop with every event and context message appended to
 * `<stateDir>/session.sqlite`.
 * @throws UsageError for an invalid task, repo or state dir; CancelledError if
 * aborted before the run started; Error if setup fails.
 */
export async function runTask(options: RunTaskOptions): Promise<RunTaskResult> {
  const task = loadTask(options.taskFile);
  let engine: Engine;
  try {
    engine = loadScriptedEngine(task.engine.turns);
  } catch (error) {
    throw new UsageError(`task.engine.turns: ${errorMessage(error)}`);
  }
  checkRepoRoot(task.repo);
  const stateDir = resolve(options.stateDir);
  const [graphId, runId, nodeId] = ["graph", "run", "node"].map(
    (kind) => kind + "-" + randomUUID(),
  ) as [string, string, string];
  const workspaceRoot = join(stateDir, WORKSPACES);
  // Every argument is validated before anything is created or any docker work.
  try {
    checkWorkspace(join(workspaceRoot, runId), workspaceRoot);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    throw new UsageError(`--state-dir: ${errorMessage(error)}`);
  }
  const log = openSessionLog(join(stateDir, LOG_FILE));
  try {
    mkdirSync(workspaceRoot, { recursive: true, mode: 0o700 });
    const workspace = join(realpathSync(workspaceRoot), runId);
    mkdirSync(workspace, { mode: 0o700 });
    let broker: Broker;
    let image: string;
    try {
      // Only orphans: other runs in this process may have live sandboxes.
      await reapSandboxContainers({}, { includeOwn: false });
      image = await buildSandboxImage();
      if (options.signal?.aborted === true) {
        throw new CancelledError("cancelled before the run started");
      }
      broker = createBroker({ image, workspace, workspaceRoot });
      // No repo hooks: a post-checkout hook would run on the host, outside the sandbox.
      execFileSync(
        "git",
        [
          ...["-C", task.repo, ...NO_HOOKS],
          ...["worktree", "add", "--quiet", "--detach", workspace],
        ],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
    } catch (error) {
      rmSync(workspace, { recursive: true, force: true }); // no worktree was added
      throw error;
    }
    const outcome = await executeRun({
      log,
      graphId,
      runId,
      nodeId,
      title: task.title,
      limits: task.limits,
      started: {
        taskId: task.id,
        title: task.title,
        repo: task.repo,
        workspace,
        image,
        engine: task.engine.kind,
      },
      engine,
      tools: broker.tools,
      executeTool: broker.executeTool,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.checkDesync === undefined
        ? {}
        : { checkDesync: options.checkDesync }),
    });
    return { ...outcome, graphId, runId, nodeId, workspace };
  } finally {
    log.close();
  }
}

export type ReplayResult =
  | {
      readonly runId: string;
      readonly terminated: true;
      readonly match: boolean;
      readonly derivedDigest: string;
      /** From the run's `run.terminated` event; null if it recorded none. */
      readonly recordedDigest: string | null;
      readonly events: number;
    }
  | { readonly runId: string; readonly terminated: false };

/**
 * Re-derives a run's context (and the tools logged in `run.started`) from the
 * log and compares its digest with the one recorded from the loop's transcript.
 * Executes no effects. Without a hash chain a fully rewritten log can still
 * match; see `contextDigest`.
 * @throws UsageError for a bad run ID; Error if there is no log or no such run.
 */
export function replayRun(runId: string, stateDir: string): ReplayResult {
  if (!ID.test(runId)) throw new UsageError(`run ID must match ${ID.source}`);
  const path = join(resolve(stateDir), LOG_FILE);
  if (!existsSync(path)) throw new Error(`no session log at ${path}`);
  const log = openSessionLog(path);
  try {
    const events = log.events({ runId });
    if (events.length === 0) throw new Error(`no events for run ${runId}`);
    const terminated = events.findLast((e) => e.type === "run.terminated");
    if (terminated === undefined) return { runId, terminated: false };
    const tools = events.find((e) => e.type === "run.started")?.payload[
      "tools"
    ];
    const recorded = terminated.payload["contextDigest"];
    const derivedDigest = contextDigest(
      deriveMessages(events, runId),
      Array.isArray(tools) ? (tools as ToolSpec[]) : [],
    );
    const recordedDigest = typeof recorded === "string" ? recorded : null;
    return {
      runId,
      terminated: true,
      match: derivedDigest === recordedDigest,
      derivedDigest,
      recordedDigest,
      events: events.length,
    };
  } finally {
    log.close();
  }
}

export interface ReapResult {
  /** Run IDs whose worktrees were removed. */
  readonly worktrees: string[];
  /** Orphaned sandbox containers removed; null if reaping them failed. */
  readonly containers: number | null;
  /** What could not be reaped (a run ID or "containers"), and why. */
  readonly failures: { readonly target: string; readonly error: string }[];
}

/**
 * Removes the worktrees of terminated runs (only those under
 * `<stateDir>/workspaces`; `worktree remove` also drops git's entry for each, so
 * the user's repo is never pruned), then reaps orphaned sandbox containers. Runs
 * without `run.terminated` are left alone. A failure is recorded in `failures`
 * and the rest still proceeds.
 * @throws Error only if the session log cannot be read.
 */
export async function reapRuns(stateDir: string): Promise<ReapResult> {
  const root = resolve(stateDir);
  const path = join(root, LOG_FILE);
  let events: Event[] = [];
  if (existsSync(path)) {
    const log = openSessionLog(path);
    try {
      events = log.events();
    } finally {
      log.close();
    }
  }
  const ended = new Set(
    events.filter((e) => e.type === "run.terminated").map((e) => e.runId),
  );
  const worktrees: string[] = [];
  const failures: { target: string; error: string }[] = [];
  for (const { type, runId, payload } of events) {
    const { repo, workspace } = payload;
    if (type !== "run.started" || !ended.has(runId)) continue;
    if (typeof repo !== "string" || typeof workspace !== "string") continue;
    if (!existsSync(workspace)) continue;
    try {
      const own = join(realpathSync(join(root, WORKSPACES)), runId);
      if (realpathSync(workspace) !== own) continue;
      execFileSync(
        "git",
        ["-C", repo, ...NO_HOOKS, "worktree", "remove", "--force", own],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      worktrees.push(runId);
    } catch (error) {
      failures.push({ target: runId, error: errorMessage(error) });
    }
  }
  let containers: number | null = null;
  try {
    containers = await reapSandboxContainers();
  } catch (error) {
    failures.push({ target: "containers", error: errorMessage(error) });
  }
  return { worktrees, containers, failures };
}
