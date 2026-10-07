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
import {
  BROKER_TOOLS,
  SANDBOX_CLEANUP_FAILED,
  checkWorkspace,
  createBroker,
} from "../broker/broker.ts";
import {
  ConfigError,
  NO_HOOKS,
  loadRunConfig,
  type RunConfig,
} from "../config/config.ts";
import { loadScriptedEngine } from "../engine/scripted.ts";
import {
  MESSAGE_APPENDED,
  assertNoDesync,
  deriveMessages,
} from "../log/messages.ts";
import { openSessionLog, type SessionLog } from "../log/session-log.ts";
import { permissionFaults } from "../permission/faults.ts";
import {
  MAX_LIMIT,
  runLoop,
  validateLimits,
  type LoopResult,
} from "../loop/loop.ts";
import { canonicalJson } from "../loop/reminders.ts";
import { errorMessage, summarize, type Terminal } from "../loop/terminal.ts";
import { displayText, runRing0, type RunRing0 } from "../permission/policy.ts";
import type { Presence } from "../permission/presence.ts";
import type {
  Emit,
  EmitAll,
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

/** What a run gives its tool executor once `run.started` is logged. */
export interface RunHooks {
  /**
   * Appends a validated event to the run's log; throws if it cannot. A permission
   * ruling's entries must use `emitAll`, never one `emit` each.
   */
  readonly emit: Emit;
  /** Appends validated events in one transaction, all or none; throws if it cannot. */
  readonly emitAll: EmitAll;
  /**
   * Ends the run as failed with `reason` before its next engine step. The first
   * reason is kept, except that SANDBOX_CLEANUP_FAILED always wins (S6).
   */
  readonly halt: (reason: string) => void;
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
  /**
   * Makes the tool executor once `run.started` is logged. A throw refuses the run:
   * it ends failed with that error before any engine step.
   */
  readonly connect: (hooks: RunHooks) => ExecuteTool;
  /** Aborting ends the run as incomplete("cancelled"). */
  readonly signal?: AbortSignal;
  /** Dev-mode desync check before every engine step and at the end. Default true. */
  readonly checkDesync?: boolean;
  /**
   * Bound on waiting for a tool call still in flight when the loop ends: an integer
   * in [0, MAX_LIMIT]. Default SETTLE_TIMEOUT_MS.
   */
  readonly settleMs?: number;
}

/**
 * How long a run waits, after a timeout or cancel, for a tool call that is still in
 * flight (SF-4): the sandbox's worst-case stop is five bounded 10 s docker steps and a
 * 2 s kill settle, plus margin.
 */
export const SETTLE_TIMEOUT_MS = 60_000;
const CLEANUP_UNCONFIRMED =
  "sandbox cleanup unconfirmed: a tool call was still running when the run ended";

/** Resolves true once every call in `pending` has settled, or false after `ms`. */
async function settled(
  pending: ReadonlySet<Promise<unknown>>,
  ms: number,
): Promise<boolean> {
  if (pending.size === 0) return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<false>((done) => {
    timer = setTimeout(() => {
      done(false);
    }, ms);
  });
  const all = Promise.allSettled([...pending]).then(() => true);
  try {
    return await Promise.race([all, late]);
  } finally {
    clearTimeout(timer);
  }
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
 * as failed, with a best-effort `run.terminated`. A halt, or a failed append
 * (such as a permission ruling's), fails the run at its next engine step, and fails
 * it at the end even if the loop stopped for another reason. A tool call still in
 * flight when the loop ends (timeout, cancel) is awaited, bounded by `settleMs`,
 * before `run.terminated`; past the bound the run fails as cleanup unconfirmed.
 * A failed run's error is, in order: cleanup unconfirmed, the halt reason, the
 * first failed append, the loop's own failure, then whatever else was thrown.
 * @throws RangeError for an invalid `settleMs`, before anything is logged; Error if
 * `run.started` cannot be logged.
 */
export async function executeRun(setup: RunSetup): Promise<RunOutcome> {
  const { log, graphId, runId, nodeId, tools } = setup;
  const settleMs = setup.settleMs ?? SETTLE_TIMEOUT_MS;
  if (!Number.isInteger(settleMs) || settleMs < 0 || settleMs > MAX_LIMIT) {
    throw new RangeError(
      `settleMs must be an integer in [0, ${String(MAX_LIMIT)}]`,
    );
  }
  // The first failed append is the cause; a later desync is only its effect.
  let logFailure: { error: unknown } | undefined;
  // Set once run.terminated is due: a late call may no longer append.
  let ended = false;
  const append = (type: string, payload: Record<string, unknown>): Event => {
    if (ended && type !== "run.terminated") {
      throw new Error("the run has ended");
    }
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
  const failed = (error: string): RunOutcome => {
    const terminal: Terminal = { kind: "failed", error };
    return outcome(terminal, summarize(terminal, ""));
  };
  let halted: string | undefined;
  let thrown: { error: unknown } | undefined;
  const pending = new Set<Promise<unknown>>();
  try {
    const connected = setup.connect({
      emit: (type, payload) => {
        append(type, payload);
      },
      emitAll: (entries) => {
        if (ended) throw new Error("the run has ended");
        try {
          log.transaction(() => {
            for (const { type, payload } of entries) append(type, payload);
          });
        } catch (error) {
          logFailure ??= { error };
          throw error;
        }
      },
      halt: (reason) => {
        if (halted === undefined || reason === SANDBOX_CLEANUP_FAILED) {
          halted = reason;
        }
      },
    });
    // Tracked so run.terminated waits for a call the loop stopped waiting for (SF-4).
    const executeTool: ExecuteTool = (call, signal) => {
      const running = connected(call, signal);
      pending.add(running);
      const done = () => {
        pending.delete(running);
      };
      running.then(done, done);
      return running;
    };
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
            if (halted !== undefined) throw new Error(halted);
            if (logFailure !== undefined) throw logFailure.error;
            const messages = derive(input.messages);
            return setup.engine.step({ ...input, messages });
          },
        },
        executeTool,
        clock: { now: () => performance.now() },
        onMessage: logMessage,
        // run.terminated is appended below, with the context digest.
        emit: (type, payload) => {
          if (type !== "run.terminated") append(type, payload);
        },
      },
    );
    derive(result.transcript.messages);
  } catch (error) {
    thrown = { error };
  }
  const unconfirmed = !(await settled(pending, settleMs));
  ended = true;
  // SF-3, S-1: one order for every failure, whatever ended the loop.
  const message = (f?: { error: unknown }) =>
    f === undefined ? undefined : errorMessage(f.error);
  // Nit-2: a later throw (a final desync) must not mask the loop's own failure.
  const own =
    result?.terminal.kind === "failed" ? result.terminal.error : undefined;
  // N-3: with a loop failure, a throw can only be the final desync: keep both.
  const also =
    own === undefined || thrown === undefined
      ? own
      : own + "; also: " + displayText(errorMessage(thrown.error));
  const failure = unconfirmed
    ? CLEANUP_UNCONFIRMED
    : (halted ?? message(logFailure) ?? also ?? message(thrown));
  const done =
    failure === undefined && result !== undefined
      ? outcome(result.terminal, result.summary)
      : failed(failure ?? "the run ended without a result");
  try {
    append("run.terminated", { agentId: nodeId, ...done });
    return done;
  } catch (error) {
    // An unlogged end is a failed run; retry once, best effort.
    const lost = failed(failure ?? message(logFailure) ?? errorMessage(error));
    try {
      append("run.terminated", { agentId: nodeId, ...lost });
    } catch {
      // The log itself may be what failed.
    }
    return lost;
  }
}

export interface RunTaskOptions {
  readonly taskFile: string;
  readonly stateDir: string;
  /** Aborting ends the run as incomplete("cancelled"). */
  readonly signal?: AbortSignal;
  /** Dev-mode desync check before every engine step and at the end. Default true. */
  readonly checkDesync?: boolean;
  /** Who answers permission asks; absent, every ask is denied (nobody present). */
  readonly presence?: Presence;
}

export interface RunTaskResult extends RunOutcome {
  readonly graphId: string;
  readonly runId: string;
  readonly nodeId: string;
  readonly workspace: string;
}

const LOG_FILE = "session.sqlite";
const WORKSPACES = "workspaces";

/**
 * Runs a task: validates the task, repo and state dir, loads the config from the
 * repo's HEAD commit (`loadRunConfig`), reaps orphaned sandbox containers, builds the
 * sandbox image, creates the run's git worktree from that commit under
 * `<stateDir>/workspaces/<runId>`, and
 * drives the loop with every event and context message appended to
 * `<stateDir>/session.sqlite`.
 * @throws UsageError for an invalid task, repo, config or state dir; CancelledError if
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
  let config: RunConfig;
  try {
    config = loadRunConfig(task.repo);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    throw new UsageError(error.message, { cause: error });
  }
  const { baseCommit, policy } = config;
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
    let image: string;
    try {
      // Only orphans: other runs in this process may have live sandboxes.
      await reapSandboxContainers({}, { includeOwn: false });
      image = await buildSandboxImage();
      if (options.signal?.aborted === true) {
        throw new CancelledError("cancelled before the run started");
      }
      // No repo hooks: a post-checkout hook would run on the host, outside the sandbox.
      execFileSync(
        "git",
        [
          ...["-C", task.repo, ...NO_HOOKS],
          ...["worktree", "add", "--quiet", "--detach", workspace, baseCommit],
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
        baseCommit,
        config: config.record,
        policyVersion: policy.version,
      },
      engine,
      tools: BROKER_TOOLS,
      connect: ({ emitAll, halt }) => {
        let ring0: RunRing0;
        try {
          ring0 = runRing0(workspace, policy);
        } catch (error) {
          const why = errorMessage(error);
          throw new Error(`run refused: Ring 0 check of the worktree: ${why}`, {
            cause: error,
          });
        }
        const { presence } = options;
        const permission = {
          policy,
          worktree: workspace,
          runId,
          ring0,
          emitAll,
          ...(presence === undefined ? {} : { presence }),
        };
        return createBroker({
          ...{ image, workspace, workspaceRoot, halt },
          permission: { ...permission, agentId: nodeId },
        }).executeTool;
      },
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
      /** How asks and answers in the log break their binding (SF3); empty if none. */
      readonly permissionFaults: string[];
    }
  | { readonly runId: string; readonly terminated: false };

/**
 * Re-derives a run's context (and the tools logged in `run.started`) from the
 * log and compares its digest with the one recorded from the loop's transcript
 * (`match`), and checks that each ask and answer in the log is bound to what the
 * owner was asked (`permissionFaults`, SF3). The replay passes only if `match` is
 * true and `permissionFaults` is empty. Executes no effects. Without a hash
 * chain a fully rewritten, self-consistent log can still pass; see
 * `contextDigest`.
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
      permissionFaults: permissionFaults(events),
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
