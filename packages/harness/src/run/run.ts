import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { Event } from "@helmwright/schema";
import { createBroker } from "../broker/broker.ts";
import { loadScriptedEngine } from "../engine/scripted.ts";
import {
  MESSAGE_APPENDED,
  assertNoDesync,
  deriveMessages,
} from "../log/messages.ts";
import { openSessionLog } from "../log/session-log.ts";
import { runLoop, validateLimits, type LoopResult } from "../loop/loop.ts";
import { canonicalJson } from "../loop/reminders.ts";
import { errorMessage } from "../loop/terminal.ts";
import type { Engine, LoopLimits, Message } from "../loop/types.ts";
import { buildSandboxImage } from "../sandbox/docker.ts";

/** The caller's input was missing or invalid (the CLI exits 64). */
export class UsageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "UsageError";
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

/** sha256 (hex) of the canonical JSON of a run's context messages. */
export function contextDigest(messages: readonly Message[]): string {
  return createHash("sha256").update(canonicalJson(messages)).digest("hex");
}

export interface RunTaskOptions {
  readonly taskFile: string;
  readonly stateDir: string;
  /** Aborting ends the run as incomplete("cancelled"). */
  readonly signal?: AbortSignal;
  /** Dev-mode desync check before every engine step and at the end. Default true. */
  readonly checkDesync?: boolean;
}

export interface RunTaskResult extends LoopResult {
  readonly graphId: string;
  readonly runId: string;
  readonly nodeId: string;
  readonly workspace: string;
  readonly contextDigest: string;
}

const LOG_FILE = "session.sqlite";

/**
 * Runs a task: builds the sandbox image, creates the run's git worktree under
 * `<stateDir>/workspaces/<runId>`, and drives the loop with every event and
 * context message appended to `<stateDir>/session.sqlite`.
 * @throws UsageError for an invalid task; Error if setup or the log fails.
 */
export async function runTask(options: RunTaskOptions): Promise<RunTaskResult> {
  const task = loadTask(options.taskFile);
  let engine: Engine;
  try {
    engine = loadScriptedEngine(task.engine.turns);
  } catch (error) {
    throw new UsageError(`task.engine.turns: ${errorMessage(error)}`);
  }
  const stateDir = resolve(options.stateDir);
  const log = openSessionLog(join(stateDir, LOG_FILE));
  try {
    const image = await buildSandboxImage();
    const [graphId, runId, nodeId] = ["graph", "run", "node"].map(
      (kind) => kind + "-" + randomUUID(),
    ) as [string, string, string];
    const workspaceRoot = join(stateDir, "workspaces");
    mkdirSync(workspaceRoot, { recursive: true, mode: 0o700 });
    const workspace = join(realpathSync(workspaceRoot), runId);
    execFileSync(
      "git",
      // No repo hooks: a post-checkout hook would run on the host, outside the sandbox.
      [
        ...["-C", task.repo, "-c", "core.hooksPath=/dev/null"],
        ...["worktree", "add", "--quiet", "--detach", workspace],
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );

    const append = (type: string, payload: Record<string, unknown>): Event =>
      log.append({
        eventId: randomUUID(),
        graphId,
        runId,
        nodeId,
        type,
        at: new Date().toISOString(),
        payload,
      });
    // The loop owns its message array; each message it adds is appended once.
    let logged = 0;
    const sync = (messages: readonly Message[]) => {
      log.transaction(() => {
        for (const message of messages.slice(logged)) {
          append(MESSAGE_APPENDED, { message });
        }
      });
      logged = Math.max(logged, messages.length);
    };
    const check = (messages: readonly Message[]) => {
      if (options.checkDesync === false) return;
      assertNoDesync(messages, log.events({ runId }), runId);
    };
    const loggedEngine: Engine = {
      async step(input) {
        sync(input.messages);
        check(input.messages);
        return engine.step(input);
      },
    };
    const broker = createBroker({ image, workspace, workspaceRoot });

    append("run.started", {
      taskId: task.id,
      title: task.title,
      repo: task.repo,
      workspace,
      image,
      engine: task.engine.kind,
      limits: { ...task.limits },
    });
    const result = await runLoop(
      {
        agentId: nodeId,
        messages: [{ role: "user", text: task.title }],
        tools: broker.tools,
        limits: task.limits,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      },
      {
        engine: loggedEngine,
        executeTool: broker.executeTool,
        clock: { now: () => performance.now() },
        // run.terminated is appended below, after the last messages are logged.
        emit: (type, payload) => {
          if (type !== "run.terminated") append(type, payload);
        },
      },
    );
    sync(result.transcript.messages);
    check(result.transcript.messages);
    const digest = contextDigest(deriveMessages(log.events({ runId }), runId));
    append("run.terminated", {
      agentId: nodeId,
      terminal: result.terminal,
      summary: result.summary,
      iterations: result.iterations,
      toolCalls: result.toolCalls,
      contextDigest: digest,
    });
    return {
      ...result,
      graphId,
      runId,
      nodeId,
      workspace,
      contextDigest: digest,
    };
  } finally {
    log.close();
  }
}

export interface ReplayResult {
  readonly runId: string;
  readonly match: boolean;
  readonly derivedDigest: string;
  /** From the run's `run.terminated` event; null if it never terminated. */
  readonly recordedDigest: string | null;
  readonly events: number;
}

/**
 * Re-derives a run's context from the log and compares its digest with the
 * recorded one. Executes no effects.
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
    const recorded = terminated?.payload["contextDigest"];
    const derivedDigest = contextDigest(deriveMessages(events, runId));
    const recordedDigest = typeof recorded === "string" ? recorded : null;
    return {
      runId,
      match: derivedDigest === recordedDigest,
      derivedDigest,
      recordedDigest,
      events: events.length,
    };
  } finally {
    log.close();
  }
}
