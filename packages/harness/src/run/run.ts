import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
  CONFIG_DEFAULTS,
  type Event,
  type FloorChecked,
  type IntakeClass,
  type IntakeDeclared,
  type IntakeFriction,
  type IntakeReason,
  type TaskCreated,
} from "@helmwright/schema";
import {
  BROKER_TOOLS,
  SANDBOX_CLEANUP_FAILED,
  checkWorkspace,
  createBroker,
} from "../broker/broker.ts";
import {
  CONFIG_ACCEPTED,
  ConfigError,
  GIT_CHECKOUT_TIMEOUT_MS,
  loadRunConfig,
  ring0SettingDigests,
  ring0Status,
  runGit,
  type RunConfig,
} from "../config/config.ts";
import { loadScriptedEngine } from "../engine/scripted.ts";
import { floorFaults } from "../floor/events.ts";
import { checkCandidate } from "../floor/tree.ts";
import {
  INTAKE_OVERRIDE_NOT_APPROVED,
  intakeClassified,
  intakeOverridden,
  type IntakeOverride,
} from "../intake/events.ts";
import {
  IntakeError,
  classify,
  overrideDirection,
  type IntakeInput,
  type IntakeResult,
} from "../intake/rubric.ts";
import {
  MESSAGE_APPENDED,
  assertNoDesync,
  deriveMessages,
} from "../log/messages.ts";
import { openSessionLog, type SessionLog } from "../log/session-log.ts";
import {
  ObjectEventError,
  runRecorded,
  taskCreated,
} from "../objects/events.ts";
import { objectFaults } from "../objects/faults.ts";
import type { ProjectionCheck } from "../objects/projection.ts";
import { INVISIBLE, hasControl } from "../permission/normalize.ts";
import { permissionFaults } from "../permission/faults.ts";
import {
  MAX_LIMIT,
  runLoop,
  validateLimits,
  type LoopResult,
} from "../loop/loop.ts";
import { canonicalJson } from "../loop/reminders.ts";
import { errorMessage, summarize, type Terminal } from "../loop/terminal.ts";
import {
  RING0_PATHS,
  displayText,
  runRing0,
  type RunRing0,
} from "../permission/policy.ts";
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
import {
  buildSandboxImage,
  reapSandboxContainers,
  sandboxContainersGone,
} from "../sandbox/docker.ts";

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
  /** B10-2: the task's declared intake facts, checked by `classify` (no scope: architectural). */
  readonly intake: {
    readonly scope?: unknown;
    readonly declared: Readonly<Record<string, unknown>>;
  };
}

/** Missing declared intake facts default to none. */
const NOTHING_DECLARED = {
  newDependencies: [],
  newModules: [],
  surfaceChanges: [],
  newProcessBoundary: false,
};

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
/** D-1 (B5-4): the objects `taskId` def. */
const TASK_ID = /^task-[A-Za-z0-9][A-Za-z0-9_-]{0,122}$/;
/** What the objects `text` def bars besides C0 and C1 controls: bidi controls and lone surrogates. */
const BIDI_OR_LONE = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\p{Cs}]/u;
const MAX_TITLE = 8192;
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

/** `v` as an object with no key outside `keys`. @throws UsageError */
function known(v: unknown, keys: readonly string[], where: string): Fields {
  if (!isRecord(v)) throw new UsageError(`${where} must be an object`);
  if (!Object.keys(v).every((key) => keys.includes(key))) {
    throw new UsageError(`${where} may have only: ${keys.join(", ")}`);
  }
  return v;
}

const isStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((e: unknown) => typeof e === "string");

function taskIntake(v: unknown): Task["intake"] {
  if (v === undefined) return { declared: { ...NOTHING_DECLARED } };
  const intake = known(v, ["scope", "declared"], "task.intake");
  const facts = Object.keys(NOTHING_DECLARED);
  const declared = known(
    intake["declared"] ?? {},
    facts,
    "task.intake.declared",
  );
  const { scope } = intake;
  // D-1 (B5-4): sorted and unique, as the Task records it; classify checks the entries.
  const normalized = isStrings(scope) ? [...new Set(scope)].sort() : scope;
  return {
    ...(scope === undefined ? {} : { scope: normalized }),
    declared: { ...NOTHING_DECLARED, ...declared },
  };
}

/** Reads and strictly validates a task file. @throws UsageError */
export function loadTask(taskFile: string): Task {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(taskFile, "utf8"));
  } catch (error) {
    throw new UsageError(`cannot read task file: ${errorMessage(error)}`);
  }
  const base = ["id", "title", "repo", "engine", "limits"];
  const optional = isRecord(json) && "intake" in json ? ["intake"] : [];
  const t = fields(json, [...base, ...optional], "task");
  const engine = fields(t["engine"], ["kind", "turns"], "task.engine");
  const { id, title, repo, limits } = t;
  if (typeof id !== "string" || !TASK_ID.test(id)) {
    throw new UsageError(
      `task.id must match ${TASK_ID.source} (since B5-4 a task id starts with "task-", e.g. rename "1" to "task-1")`,
    );
  }
  if (!isTaskText(title)) {
    throw new UsageError(
      "task.title must be 1 to 8192 characters, not only spaces, without control characters other than tab and line breaks, or bidi controls",
    );
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
    intake: taskIntake(t["intake"]),
  };
}

/** Whether `title` satisfies the objects `text` def, which a Task's `text` must (D-1). */
function isTaskText(title: unknown): title is string {
  return (
    typeof title === "string" &&
    title.trim() !== "" &&
    Array.from(title).length <= MAX_TITLE &&
    !hasControl(title, "\t\n\r") &&
    !BIDI_OR_LONE.test(title)
  );
}

/** task.repo must be the top level of a git repository, never a directory inside one. */
function checkRepoRoot(repo: string): void {
  let top: string;
  let real: string;
  try {
    real = realpathSync(repo);
    const out = runGit(repo, ["rev-parse", "--show-toplevel"]);
    top = realpathSync(out.toString("utf8").trim());
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
 * and digest) still matches: this detects divergence, not tampering (until SIG, M1).
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
  /**
   * S2: aborts on the run's signal, or once `limits.timeoutMs` has passed since
   * `run.started`: one deadline for setup (such as an ask) and the loop.
   */
  readonly signal: AbortSignal;
}

/** An event that `RunSetup.records` logs before `run.started`. */
export interface RunRecordEvent {
  readonly type: string;
  readonly payload: Record<string, unknown>;
}

/** A set-up run: everything from `run.started` to `run.terminated`. */
export interface RunSetup {
  readonly log: SessionLog;
  readonly graphId: string;
  readonly runId: string;
  readonly nodeId: string;
  readonly title: string;
  readonly limits: LoopLimits;
  /** Further `run.started` fields (task, repo, workspace, image, engine, baseCommit, config). */
  readonly started: Readonly<Record<string, unknown>>;
  /**
   * B5-4: the events logged before `run.started`, in its transaction (such as
   * `task.created` and `run.recorded`). Called inside that transaction, so it may read
   * the log race-free; a throw logs nothing and rejects the run.
   */
  readonly records?: () => readonly RunRecordEvent[];
  readonly engine: Engine;
  readonly tools: readonly ToolSpec[];
  /**
   * Makes the tool executor once `run.started` is logged. A throw (or rejection)
   * refuses the run: it ends failed with that error before any engine step.
   */
  readonly connect: (hooks: RunHooks) => ExecuteTool | Promise<ExecuteTool>;
  /** Aborting ends the run as incomplete("cancelled"). */
  readonly signal?: AbortSignal;
  /** Dev-mode desync check before every engine step and at the end. Default true. */
  readonly checkDesync?: boolean;
  /**
   * Bound on waiting for a tool call still in flight when the loop ends: an integer
   * in [0, MAX_LIMIT]. Default SETTLE_TIMEOUT_MS.
   */
  readonly settleMs?: number;
  /**
   * B3-2: checks the candidate once every tool call has settled and its sandbox is
   * confirmed removed; logged as `floor.checked` just before `run.terminated`. A throw
   * means the floor could not check the candidate (fail closed).
   */
  readonly floor?: () => FloorChecked;
  /**
   * SF-1: resolves true once every sandbox container the run started is confirmed
   * gone; false (or a rejection) fails the run with SANDBOX_CLEANUP_FAILED.
   */
  readonly confirmCleanup?: () => Promise<boolean>;
}

/**
 * How long a run waits, after a timeout or cancel, for a tool call that is still in
 * flight (SF-4): the sandbox's worst-case stop is five bounded 10 s docker steps and a
 * 2 s kill settle, plus margin.
 */
export const SETTLE_TIMEOUT_MS = 60_000;
const CLEANUP_UNCONFIRMED =
  "sandbox cleanup unconfirmed: a tool call was still running when the run ended";
/** OQ-B3-2: why a run that would have completed fails on a floor finding. */
export const FLOOR_REJECTED = "sensor floor rejected the candidate";
/** Why a run that would have completed fails when the floor cannot check (fail closed). */
export const FLOOR_UNCHECKED = "sensor floor could not check the candidate";

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

/** What `executeRun` resolves with. */
export interface RunEnd extends RunOutcome {
  /** N-1: the `floor.checked` payload logged; null if none was. */
  readonly floor: FloorChecked | null;
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
 * B3-2: with `setup.floor`, once cleanup is confirmed (not unconfirmed, no
 * SANDBOX_CLEANUP_FAILED halt) the floor runs and `floor.checked` is logged just
 * before `run.terminated`; a run that would complete fails with FLOOR_REJECTED on a
 * finding, or FLOOR_UNCHECKED if the floor throws, its event cannot be logged, or
 * there is no `setup.floor` (SF-2). Other terminals are kept. SF-1: first,
 * `setup.confirmCleanup` must confirm every container gone, else the run is halted
 * with SANDBOX_CLEANUP_FAILED and the floor is skipped.
 * B5-4: `setup.records` and `run.started` are logged in one transaction, records first.
 * @throws RangeError for an invalid `settleMs` or `limits` (N-f), before anything is
 * logged; whatever `setup.records` throws, or Error if `run.started` cannot be logged,
 * and then nothing is logged.
 */
export async function executeRun(setup: RunSetup): Promise<RunEnd> {
  const { log, graphId, runId, nodeId, tools } = setup;
  const settleMs = setup.settleMs ?? SETTLE_TIMEOUT_MS;
  if (!Number.isInteger(settleMs) || settleMs < 0 || settleMs > MAX_LIMIT) {
    throw new RangeError(
      `settleMs must be an integer in [0, ${String(MAX_LIMIT)}]`,
    );
  }
  // N-f: before the deadline timer, which an invalid timeoutMs would make fire at once.
  validateLimits(setup.limits);
  // The first failed append is the cause; a later desync is only its effect.
  let logFailure: { error: unknown } | undefined;
  // Set once run.terminated is due: a late call may no longer append.
  let ended = false;
  // `final`: the run's own end (floor.checked, run.terminated), due once it has ended.
  const append = (
    type: string,
    payload: Record<string, unknown>,
    final = false,
  ): Event => {
    if (ended && !final) {
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

  // Requirement (b): the run's records come before run.started, or neither is logged.
  log.transaction(() => {
    for (const { type, payload } of setup.records?.() ?? []) {
      append(type, payload);
    }
    append("run.started", {
      ...setup.started,
      limits: { ...setup.limits },
      tools,
    });
  });
  const startedAt = performance.now();
  const deadline = new AbortController();
  const timer = setTimeout(() => {
    deadline.abort();
  }, setup.limits.timeoutMs);
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
    const signal = setup.signal;
    const connected = await setup.connect({
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
      signal:
        signal === undefined
          ? deadline.signal
          : AbortSignal.any([signal, deadline.signal]),
    });
    clearTimeout(timer);
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
        // S2: what is left of the run's deadline after setup.
        limits: {
          ...setup.limits,
          timeoutMs: Math.max(
            1,
            Math.floor(
              setup.limits.timeoutMs - (performance.now() - startedAt),
            ),
          ),
        },
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
    clearTimeout(timer);
    thrown = { error };
  }
  const unconfirmed = !(await settled(pending, settleMs));
  // SF-1: no container the run started may outlive it (a background writer).
  if (!unconfirmed && setup.confirmCleanup !== undefined) {
    const gone = await setup.confirmCleanup().catch(() => false);
    if (!gone) halted = SANDBOX_CLEANUP_FAILED;
  }
  ended = true;
  // SF-3, S-1: one order for every failure, whatever ended the loop.
  // Requirement (a): escaped once, so run.terminated's terminal is valid display text.
  const message = (f?: { error: unknown }) =>
    f === undefined ? undefined : displayText(errorMessage(f.error));
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
  const reason = stopReason({
    unconfirmed,
    early: !result && halted === undefined && logFailure === undefined,
    cancelled:
      setup.signal?.aborted === true || thrown?.error instanceof CancelledError,
    timedOut: deadline.signal.aborted && setup.signal?.aborted !== true,
  });
  const stopped =
    reason === undefined
      ? undefined
      : ({ kind: "incomplete", reason } as const);
  const done =
    stopped !== undefined
      ? outcome(stopped, summarize(stopped, ""))
      : failure === undefined && result !== undefined
        ? outcome(result.terminal, result.summary)
        : failed(failure ?? "the run ended without a result");
  // B3-2: only once no sandbox can still write to the worktree (S6, SF-1, SF-4).
  let logged: FloorChecked | null = null;
  // SF-2: a run with no floor cannot complete.
  let floorError = setup.floor === undefined ? FLOOR_UNCHECKED : undefined;
  if (setup.floor !== undefined && !unconfirmed) {
    if (halted !== SANDBOX_CLEANUP_FAILED) {
      try {
        const checked = setup.floor();
        append("floor.checked", { ...checked }, true);
        logged = checked;
        if (checked.verdict !== "pass") floorError = FLOOR_REJECTED;
      } catch (error) {
        floorError = FLOOR_UNCHECKED + ": " + displayText(errorMessage(error));
      }
    }
  }
  // OQ-B3-2: a run that ended otherwise keeps its terminal.
  const end =
    floorError !== undefined && done.terminal.kind === "completed"
      ? failed(floorError)
      : done;
  try {
    append("run.terminated", { agentId: nodeId, ...end }, true);
    return { ...end, floor: logged };
  } catch (error) {
    // An unlogged end is a failed run; retry once, best effort.
    const lost = failed(
      failure ?? message(logFailure) ?? displayText(errorMessage(error)),
    );
    try {
      append("run.terminated", { agentId: nodeId, ...lost }, true);
    } catch {
      // The log itself may be what failed.
    }
    return { ...lost, floor: logged };
  }
}

/**
 * S2: why a run whose setup was stopped (`early`: no loop result, no halt and no
 * failed append) by the deadline or a cancel is incomplete, not failed; undefined
 * if it was not. N-e: an unconfirmed cleanup always fails the run.
 */
export function stopReason(run: {
  readonly unconfirmed: boolean;
  readonly early: boolean;
  readonly timedOut: boolean;
  readonly cancelled: boolean;
}): "timeout" | "cancelled" | undefined {
  if (run.unconfirmed || !run.early) return undefined;
  return run.timedOut ? "timeout" : run.cancelled ? "cancelled" : undefined;
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
  /** OQ-B10-1: the owner's class override (`--class`, `--reason`). */
  readonly intakeOverride?: { readonly to: string; readonly reason: string };
  /** Called with the run's class before the first engine step, then with any override's. */
  readonly onIntake?: (shown: IntakeShown) => void;
}

/** What a run shows of its intake: the class and its friction (N8). */
export interface IntakeShown {
  readonly kind: "classified" | "overridden";
  readonly class: IntakeClass;
  /** Empty for an override. */
  readonly reasons: readonly IntakeReason[];
  readonly friction: IntakeFriction;
}

/** A run's intake events for `result`, built and checked up front. @throws IntakeError */
function intakeRecords(
  task: Task,
  result: IntakeResult,
  override: IntakeOverride | undefined,
  friction: IntakeInput["friction"],
) {
  const scope = Array.isArray(task.intake.scope)
    ? (task.intake.scope as string[])
    : [];
  const declared = task.intake.declared as unknown as IntakeDeclared;
  const direction =
    override === undefined
      ? "same"
      : overrideDirection(result.class, override.to);
  const overridden =
    override === undefined || direction === "same"
      ? undefined
      : intakeOverridden(task.id, result, override, friction);
  const classified = intakeClassified(task.id, scope, declared, result);
  return { result, classified, direction, overridden };
}

export interface RunTaskResult extends RunEnd {
  readonly graphId: string;
  readonly runId: string;
  readonly nodeId: string;
  readonly workspace: string;
}

const LOG_FILE = "session.sqlite";
const WORKSPACES = "workspaces";
/**
 * B10-3: why a run fails whose worktree's Ring 0 link targets, with the floor and the
 * policy's Ring 0 paths, are over the rubric's limits (such as its 1024 Ring 0 paths).
 */
export const INTAKE_LINKS_REFUSED =
  "run refused: the worktree's Ring 0 link targets exceed the intake rubric's limits";
/** OQ1: why a run whose Ring 0 config change was not approved fails. */
export const RING0_NOT_APPROVED =
  "Ring 0 configuration changed and was not approved";

/**
 * Runs a task: validates the task, repo and state dir, loads the config from the
 * repo's HEAD commit (`loadRunConfig`), reaps orphaned sandbox containers, builds the
 * sandbox image, creates the run's git worktree from that commit under
 * `<stateDir>/workspaces/<runId>`, and
 * drives the loop with every event and context message appended to
 * `<stateDir>/session.sqlite`. OQ1: after `run.started` and before the first engine
 * step, a Ring 0 config that differs from the last one accepted for the repo
 * (`ring0Status`) is asked (always-ask); unless approved the run fails with
 * RING0_NOT_APPROVED. An approval, or a first run on the defaults, logs
 * `config.accepted`; an unchanged config logs nothing more. The ask shares the
 * run's deadline (`limits.timeoutMs`); a cancel during it (the run's signal, or
 * Ctrl-C or end of input at the prompt) ends the run incomplete. N-d: any other
 * answer that is not an approval, such as one not viewed to its end, fails it.
 * B10-2: the task is classified (intake-rubric-1) after the config is loaded, and
 * `intake.classified` is logged after the Ring 0 check. An upward or downward
 * override logs `intake.overridden`; a downward one is first asked like the Ring 0
 * change, and unless approved the run fails with INTAKE_OVERRIDE_NOT_APPROVED.
 * B10-3: a reclassification with the worktree's Ring 0 link targets that the rubric
 * refuses fails the run with INTAKE_LINKS_REFUSED. B5-4: those targets are read before
 * `run.started`, which is logged in one transaction after `task.created` (only for a
 * new Task) and `run.recorded` (with that class); a failure of the read still fails
 * the run at its old point.
 * @throws UsageError for an invalid task, intake, override, repo, config or state dir,
 * or a Task already recorded differently (OD-B54-1); CancelledError if
 * aborted before the run started; Error if setup fails.
 */
export async function runTask(options: RunTaskOptions): Promise<RunTaskResult> {
  const task = loadTask(options.taskFile);
  const override = checkOverride(options.intakeOverride);
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
  // The permission layer's Ring 0 paths: the policy's united with the floor.
  const ring0Paths = [...new Set([...RING0_PATHS, ...policy.ring0Paths])];
  // N3: loadRunConfig admits only the default friction (07 rule 1; e2e "refuses a
  // listed alternative"), so the default is the loaded config's.
  const { friction } = CONFIG_DEFAULTS;
  const classifyWith = (links: readonly string[]) =>
    classify({
      ...task.intake,
      ring0Paths: [...ring0Paths, ...links],
      friction,
    });
  // Validated before any workspace work; reclassified with the link targets below.
  let intake: ReturnType<typeof intakeRecords>;
  try {
    intake = intakeRecords(task, classifyWith([]), override, friction);
  } catch (error) {
    if (!(error instanceof IntakeError)) throw error;
    throw new UsageError("task." + error.message, { cause: error });
  }
  // S1: the worktree's Ring 0 link targets count too; this only raises the class.
  const reclassified = (links: RunRing0) => {
    let linked: IntakeResult;
    try {
      linked = classifyWith(links);
    } catch (error) {
      if (!(error instanceof IntakeError)) throw error;
      throw new Error(INTAKE_LINKS_REFUSED, { cause: error });
    }
    return overrideDirection(intake.result.class, linked.class) === "up"
      ? intakeRecords(task, linked, override, friction)
      : intake;
  };
  // B5-4: the Task's payload, built and checked before anything is created.
  let created: TaskCreated;
  try {
    created = taskCreated({
      id: task.id,
      repoId: config.repoId,
      text: task.title,
      scope: isStrings(task.intake.scope) ? task.intake.scope : [],
    });
  } catch (error) {
    if (!(error instanceof ObjectEventError)) throw error;
    throw new UsageError(error.message, { cause: error });
  }
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
    // OD-B54-1: a changed Task is refused before anything else is created.
    recordedTask(log, created);
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
      // runGit: no repo hooks or fsmonitor, which would run on the host.
      runGit(
        task.repo,
        ["worktree", "add", "--quiet", "--detach", workspace, baseCommit],
        { timeoutMs: GIT_CHECKOUT_TIMEOUT_MS },
      );
    } catch (error) {
      rmSync(workspace, { recursive: true, force: true }); // no worktree was added
      throw error;
    }
    // B5-4: read before run.recorded so the class is final. A failure is kept and
    // thrown in connect where it was before, so the run fails with the same events.
    const ring0Read = attempt(() => {
      try {
        return runRing0(workspace, policy);
      } catch (error) {
        const why = errorMessage(error);
        throw new Error(`run refused: Ring 0 check of the worktree: ${why}`, {
          cause: error,
        });
      }
    });
    const linkRead =
      "error" in ring0Read
        ? undefined
        : attempt(() => reclassified(ring0Read.value));
    if (linkRead !== undefined && "value" in linkRead) intake = linkRead.value;
    // OD-B54-2: the rubric class after the link targets (= intake.classified.class).
    const recorded = runRecorded({
      taskId: task.id,
      engine: task.engine.kind,
      baseCommit,
      class: intake.result.class,
    });
    const containers = new Set<string>();
    const seqBefore = log.lastSeq();
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
      // OD-B54-1: checked again in run.started's transaction; a same Task is reused.
      records: () => {
        const run = { type: "run.recorded", payload: { ...recorded } };
        return recordedTask(log, created) === "new"
          ? [{ type: "task.created", payload: { ...created } }, run]
          : [run];
      },
      engine,
      tools: BROKER_TOOLS,
      connect: async ({ emit, emitAll, halt, signal }) => {
        if ("error" in ring0Read) throw ring0Read.error;
        const ring0 = ring0Read.value;
        const { presence } = options;
        const permission = {
          policy,
          worktree: workspace,
          runId,
          ring0,
          emitAll,
          ...(presence === undefined ? {} : { presence }),
        };
        const broker = createBroker({
          ...{ image, workspace, workspaceRoot, halt, containers },
          permission: { ...permission, agentId: nodeId },
        });
        const repo = config.repoId;
        const status = ring0Status(log, config);
        const accepted = (how: string) => {
          const { ring0Sha256 } = config.record;
          const settings = ring0SettingDigests(config.ring0);
          emit(CONFIG_ACCEPTED, { repo, ring0Sha256, how, settings });
        };
        if (status.kind === "default") accepted("default");
        if (status.kind === "changed") {
          const change = {
            ...{ from: status.from, to: config.record.ring0Sha256 },
            ...{ changed: status.changed, ring0: config.ring0 },
            note: status.note,
          };
          const answer = await broker.acceptRing0(change, signal);
          if (answer === "cancelled") throw new CancelledError("cancelled");
          if (answer !== "approved") throw new Error(RING0_NOT_APPROVED);
          accepted("approved");
        }
        if (linkRead !== undefined && "error" in linkRead) throw linkRead.error;
        const { result, classified, direction, overridden } = intake;
        // B10-2: after the Ring 0 check, before the first engine step; never in the context.
        emit("intake.classified", { ...classified });
        options.onIntake?.({ kind: "classified", ...result });
        if (overridden !== undefined && direction === "down") {
          const { from, to, reason, scopeSha256 } = overridden;
          const change = { from, to, reason, scopeSha256 };
          const answer = await broker.acceptIntakeOverride(change, signal);
          if (answer === "cancelled") throw new CancelledError("cancelled");
          if (answer !== "approved") {
            throw new Error(INTAKE_OVERRIDE_NOT_APPROVED);
          }
        }
        if (overridden !== undefined) {
          emit("intake.overridden", { ...overridden });
          const { to, friction: effective } = overridden;
          const shown = { class: to, reasons: [], friction: effective };
          options.onIntake?.({ kind: "overridden", ...shown });
        }
        return broker.executeTool;
      },
      // B1: the host's common dir, never one the worktree names; protected = Ring 0.
      floor: () => {
        const repo = { worktree: workspace, commonDir: config.repoId };
        return checkCandidate(repo, baseCommit, ring0Paths);
      },
      confirmCleanup: () => sandboxContainersGone([...containers]),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.checkDesync === undefined
        ? {}
        : { checkDesync: options.checkDesync }),
    }).catch((error: unknown) => {
      // B5-4: the start transaction failed (e.g. a changed Task raced in): with no
      // run.started, reap never sees this worktree. A changed last seq may be another
      // process's event, so the worktree is then kept.
      if (log.lastSeq() === seqBefore) {
        attempt(() =>
          runGit(task.repo, ["worktree", "remove", "--force", workspace]),
        );
        rmSync(workspace, { recursive: true, force: true });
      }
      throw error;
    });
    return { ...outcome, graphId, runId, nodeId, workspace };
  } finally {
    log.close();
  }
}

/** B5-4: what `fn` returned, or what it threw, to be thrown later. */
function attempt<T>(
  fn: () => T,
): { readonly value: T } | { readonly error: unknown } {
  try {
    return { value: fn() };
  } catch (error) {
    return { error };
  }
}

/**
 * OD-B54-1: "new" if `log` has no Task `created.id`, "same" if it has one with the same
 * repo, text and (normalized) scope, which a re-run reuses.
 * @throws UsageError if it has one that differs (D-2: a Task never changes)
 */
function recordedTask(log: SessionLog, created: TaskCreated): "new" | "same" {
  const found = log.object(created.id);
  if (found === undefined) return "new";
  let differs: string | undefined;
  if (found.kind !== "task" || found.repoId !== created.repoId) {
    differs = "repo";
  } else if (found.text !== created.text) {
    differs = "title";
  } else if (JSON.stringify(found.scope) !== JSON.stringify(created.scope)) {
    differs = "intake.scope";
  }
  if (differs === undefined) return "same";
  throw new UsageError(
    `task.id ${created.id} is already recorded in this state dir with a different ${differs}; a Task never changes (D-2): give the changed task a new id`,
  );
}

const CLASSES: readonly IntakeClass[] = ["chore", "bounded", "architectural"];

/** OQ-B10-1: a known class and a reason that is not blank, escaped. @throws UsageError */
function checkOverride(
  given: RunTaskOptions["intakeOverride"],
): IntakeOverride | undefined {
  if (given === undefined) return undefined;
  const to = CLASSES.find((cls) => cls === given.to);
  if (to === undefined) {
    throw new UsageError("--class must be one of " + CLASSES.join(", "));
  }
  // N6: blank also when only invisible or control characters remain.
  const shown = (c: string) =>
    c.trim() !== "" && !INVISIBLE.test(c) && !hasControl(c);
  if (
    typeof given.reason !== "string" ||
    !Array.from(given.reason).some(shown)
  ) {
    throw new UsageError("--reason must not be empty");
  }
  return { to, reason: displayText(given.reason) };
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
      /**
       * How asks and answers in the log break their binding (SF3), and B3-2 floor
       * faults (`floorFaults`); empty if none.
       */
      readonly permissionFaults: string[];
      /** How the run's Task and Run break their relations (B5-4b); empty if none. */
      readonly objectFaults: string[];
      readonly projections: ProjectionCheck;
    }
  | {
      readonly runId: string;
      readonly terminated: false;
      /** The whole log's objects table checked against its events (B5-4b). */
      readonly projections: ProjectionCheck;
    };

/**
 * Re-derives a run's context (and the tools logged in `run.started`) from the
 * log and compares its digest with the one recorded from the loop's transcript
 * (`match`), and checks that each ask and answer in the log is bound to what the
 * owner was asked (`permissionFaults`, SF3), and that a completed run has a passing
 * `floor.checked` (`floorFaults`, B3-2). B5-4b: first it verifies the log's object
 * projections (`projections`, also for a run that never terminated), and it checks the
 * run's Task and Run relations (`objectFaults`). The replay passes only if both `match`
 * values are true and both fault lists are empty. Executes no effects. Without a hash
 * chain a fully rewritten, self-consistent log can still pass; see
 * `contextDigest`.
 * @throws UsageError for a bad run ID; Error if there is no log or no such run, or
 * "corrupt event at seq N" or "cannot apply event at seq N" for any event of the log.
 */
export function replayRun(runId: string, stateDir: string): ReplayResult {
  if (!ID.test(runId)) throw new UsageError(`run ID must match ${ID.source}`);
  const path = join(resolve(stateDir), LOG_FILE);
  if (!existsSync(path)) throw new Error(`no session log at ${path}`);
  const log = openSessionLog(path);
  try {
    const projections = log.verifyProjections();
    const events = log.events({ runId });
    if (events.length === 0) throw new Error(`no events for run ${runId}`);
    const terminated = events.findLast((e) => e.type === "run.terminated");
    if (terminated === undefined) {
      return { runId, terminated: false, projections };
    }
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
      permissionFaults: [...permissionFaults(events), ...floorFaults(events)],
      objectFaults: objectFaults(events, [
        ...log.events({ type: "task.created" }),
        ...log.events({ type: "run.recorded" }),
      ]),
      projections,
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
      runGit(repo, ["worktree", "remove", "--force", own]);
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
