import { createHash } from "node:crypto";
import type { PermissionPolicy } from "@helmwright/schema";
import type {
  EmitAll,
  ExecuteTool,
  ToolCall,
  ToolResult,
  ToolSpec,
} from "../loop/types.ts";
import { errorMessage } from "../loop/terminal.ts";
import {
  PermissionLogError,
  permissionAnswered,
  permissionAsked,
  permissionEvents,
  type PermissionAnswer,
  type PermissionLogEntry,
} from "../permission/events.ts";
import {
  displayText,
  evaluate,
  type EvaluatedVerdict,
  type PermissionVerdict,
  type RejectedVerdict,
  type RunRing0,
} from "../permission/policy.ts";
import type { Presence } from "../permission/presence.ts";
import {
  checkWorkspacePaths,
  dockerRunArgs,
  futureRealpath,
  runInSandbox,
  type SandboxResult,
} from "../sandbox/docker.ts";

/** How the broker rules on each call before any effect (B9). */
export interface PermissionContext {
  readonly policy: PermissionPolicy;
  /** Host path of the run's worktree. */
  readonly worktree: string;
  readonly runId: string;
  /** The run's agent, recorded on each ruling. */
  readonly agentId: string;
  /** `runRing0(worktree, policy)`, computed at run start. */
  readonly ring0: RunRing0;
  /** The run's validated, all-or-nothing log append; the broker never touches the log. */
  readonly emitAll: EmitAll;
  /** Who answers an ask; absent, nobody is present and every ask is denied. */
  readonly presence?: Presence;
}

/** Where the broker's effects happen: one run's sandboxed workspace. */
export interface BrokerContext {
  /** Sandbox image ID from `buildSandboxImage`. */
  readonly image: string;
  readonly workspace: string;
  readonly workspaceRoot: string;
  /** Required: no call runs without a ruling. */
  readonly permission: PermissionContext;
  /** Ends the run as failed before its next engine step. */
  readonly halt: (reason: string) => void;
}

/** A typed action's handler: acts only on the ruled input snapshot. */
interface Action {
  readonly spec: ToolSpec;
  handle(
    input: Readonly<Record<string, unknown>>,
    context: BrokerContext,
    signal: AbortSignal,
  ): Promise<ToolResult>;
}

export interface Broker {
  readonly tools: readonly ToolSpec[];
  readonly executeTool: ExecuteTool;
}

/** Wall-clock bound on one `execute` (the loop's signal may end it sooner). */
export const EXECUTE_TIMEOUT_MS = 120_000;
/** Bound on each captured stream and on the tool result text. */
export const MAX_TOOL_OUTPUT_BYTES = 16_384;

const denied = (output: string): ToolResult => ({ status: "denied", output });
/** S6: a sandbox not confirmed removed may still touch the worktree. */
export const SANDBOX_CLEANUP_FAILED = "sandbox cleanup failed";
const LOG_DENIED = "denied: the permission ruling cannot be logged";
/** S2: a reused tool call ID would make the log's bindings ambiguous. */
const REUSED: RejectedVerdict = {
  kind: "rejected",
  tier: "deny",
  guard: "schema",
  ruleId: "schema.duplicate-call-id",
  reason: "tool call ID already used in this run",
};
/** SF-1: once a ruling's append fails, no later call in the run runs. */
export const PERMISSION_LOG_FAILED = "permission log failed";

function bounded(text: string): string {
  if (Buffer.byteLength(text) <= MAX_TOOL_OUTPUT_BYTES) return text;
  const head = Buffer.from(text).subarray(0, MAX_TOOL_OUTPUT_BYTES);
  // Drop a split trailing character so the result ends cleanly.
  return head.toString("utf8").replace(/�$/, "") + "\n[output truncated]";
}

/** Maps a sandbox run onto a tool result: only exit 0 is `ok`. */
export function sandboxToolResult(r: SandboxResult): ToolResult {
  const parts = [r.stdout];
  if (r.stderr !== "") parts.push("[stderr]\n" + r.stderr);
  if (r.truncated) parts.push("[output truncated]");
  const output = bounded(parts.join("\n"));
  const fail = (why: string): ToolResult => ({
    status: "error",
    output: output === "" ? why : why + "\n" + output,
  });
  if (r.timedOut) return fail("execute timed out");
  if (r.cancelled) return fail("execute cancelled");
  if (r.exitCode === 0) return { status: "ok", output };
  if (r.startFailed) return fail("program could not be started");
  return fail("exit code " + String(r.exitCode ?? "none (killed by a signal)"));
}

function parseExecute(
  input: Readonly<Record<string, unknown>>,
): { argv: string[] } | undefined {
  const argv = input["argv"];
  const valid =
    Object.keys(input).length === 1 &&
    Array.isArray(argv) &&
    argv.length > 0 &&
    argv.every((a) => typeof a === "string" && a !== "");
  return valid ? { argv: [...(argv as string[])] } : undefined;
}

const execute: Action = {
  spec: {
    name: "execute",
    description:
      'Runs a program in the sandboxed workspace (no network). Input: { "argv": ["sh", "-c", "..."] }',
  },
  async handle(input, context, signal) {
    const parsed = parseExecute(input);
    if (parsed === undefined) {
      return denied(
        "invalid input for execute: must be { argv: non-empty array of non-empty strings }",
      );
    }
    const result = await runInSandbox({
      argv: parsed.argv,
      image: context.image,
      workspace: context.workspace,
      workspaceRoot: context.workspaceRoot,
      timeoutMs: EXECUTE_TIMEOUT_MS,
      maxOutputBytes: MAX_TOOL_OUTPUT_BYTES,
      signal,
    });
    if (result.cleanupFailed) context.halt(SANDBOX_CLEANUP_FAILED);
    return sandboxToolResult(result);
  },
};

const ACTIONS = new Map<string, Action>([[execute.spec.name, execute]]);
/** The tools offered to the engine; other typed actions are permission-only (Q6). */
export const BROKER_TOOLS: readonly ToolSpec[] = [...ACTIONS.values()].map(
  (a) => a.spec,
);

/**
 * SF-A: the most code points a target may have as shown (escaped, then as a JSON
 * string literal, quotes included). With MAX_PROMPT_DETAIL the two values fill at
 * most 800 code points: 10 rows at 80 columns, plus their labels, or 20 rows if
 * every character is double width. The target sits just above the last line, so
 * only the header can scroll off. A target or detail that was cut, or is longer,
 * is shown as a summary, and in full only in the ask's view (B9b-3c).
 */
export const MAX_PROMPT_TARGET = 320;
/** SF-A: the most code points a detail may have as shown (see MAX_PROMPT_TARGET). */
export const MAX_PROMPT_DETAIL = 480;
/** The cap on the reason shown, in code points; the reason only explains. */
const MAX_PROMPT_REASON = 512;
/** B9b-3c: the code points of a long value shown in its summary line. */
const SUMMARY_HEAD = 120;

const quoted = (text: string) => JSON.stringify(text);
const fits = (text: string, max: number) =>
  Array.from(quoted(text)).length <= max;
const sha256 = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");

/** One value an ask shows: its label, its whole escaped text and whether it is long. */
interface Shown {
  readonly label: string;
  readonly text: string;
  readonly long: boolean;
}

/**
 * What an ask shows of the target and detail: their whole escaped text (the
 * policy's full form of a cut value), each long if over its cap or cut in the log.
 * Undefined (S-3: no ask) if a value was cut and has no full form, which the policy
 * gives only up to MAX_FULL_SHOWN code points.
 */
function shownValues(verdict: EvaluatedVerdict): readonly Shown[] | undefined {
  const { target, fullTarget } = verdict;
  const whole = target.truncated === true ? fullTarget : target;
  if (whole === undefined) return undefined;
  const one = (label: string, text: string, logged: string, max: number) => ({
    label,
    text,
    long: text !== logged || !fits(text, max),
  });
  const value = one(
    "target (" + target.kind + ")",
    whole.value,
    target.value,
    MAX_PROMPT_TARGET,
  );
  if (whole.detail === undefined) return [value];
  const detail = one(
    "detail",
    whole.detail,
    target.detail ?? "",
    MAX_PROMPT_DETAIL,
  );
  return [value, detail];
}

/** N6: one shown unit: a policy escape, an escaped backslash, or a code point. */
const UNIT = /\\u\{[0-9a-f]{1,6}\}|\\\\|[\s\S]/gu;

/**
 * B9b-3c: the full-value view of an ask with a long value: for each, a label line
 * and the whole value as a JSON string literal (see `marked`). The presence wraps and pages it; `permission.asked`
 * holds its SHA-256. Undefined if no value is long.
 */
function askView(values: readonly Shown[]): string | undefined {
  const long = values.filter((v) => v.long);
  if (long.length === 0) return undefined;
  return long.map((v) => "full " + v.label + ":\n" + marked(v.text)).join("\n");
}

/**
 * SF2, R2: `text` (escaped) with each run of more than two spaces as ␠×<count>× and
 * of more than two of one escape as <escape>×<count>×; a literal ␠ or × is escaped,
 * so every marker is one, and the closing × keeps a following digit out of the
 * count. Quoted as a JSON string literal.
 */
function marked(text: string): string {
  let out = "";
  let unit = "";
  let n = 0;
  const flush = () => {
    const run = n > 2 && (unit === " " || unit.startsWith("\\"));
    const mark = (unit === " " ? "␠" : unit) + "×" + String(n) + "×";
    out += run ? mark : unit.repeat(n);
  };
  for (const [u] of text.matchAll(UNIT)) {
    const shown = u === "␠" ? "\\u{2420}" : u === "×" ? "\\u{d7}" : u;
    if (shown === unit) n += 1;
    else {
      flush();
      [unit, n] = [shown, 1];
    }
  }
  flush();
  return quoted(out);
}

/** N6: the first SUMMARY_HEAD code points of `text`, less an escape they would split. */
function head(text: string): string {
  let kept = "";
  let count = 0;
  for (const [unit] of text.matchAll(UNIT)) {
    count += Array.from(unit).length;
    if (count > SUMMARY_HEAD) break;
    kept += unit;
  }
  return kept;
}

/**
 * What an ask shows, and what `permission.asked` hashes. Values (target, detail,
 * reason) are escaped by the policy and then shown as JSON string literals, so
 * their edges and spaces are visible; a short target or detail is shown in full, a
 * long one as a summary (its first SUMMARY_HEAD code points, its length and the
 * view's hash), the reason cut to MAX_PROMPT_REASON. Every other part is fixed
 * text, an action name, a rule ID or a run ID. The last two lines are the target
 * and "Approve <action> (<rule>, <tier>)?", so no value can push what is approved
 * off the screen (SF-A).
 */
function askPrompt(
  verdict: EvaluatedVerdict,
  runId: string,
  values: readonly Shown[],
  view: string | undefined,
): string {
  const { action, requested, ruleId, reason, tier } = verdict;
  const as = requested === action ? "" : " (requested as " + requested + ")";
  const show = (v: Shown) => {
    if (!v.long) return "  " + v.label + ": " + quoted(v.text);
    const points = Array.from(v.text);
    const hash = sha256(view ?? "").slice(0, 16);
    const size = String(points.length) + " code points, sha256 " + hash;
    return "  " + v.label + ": " + quoted(head(v.text)) + " … [" + size + "]";
  };
  const [value, detail] = values;
  const why = Array.from(reason);
  const shownReason =
    why.length <= MAX_PROMPT_REASON
      ? reason
      : why.slice(0, MAX_PROMPT_REASON).join("") + "…[truncated]";
  const keys = view === undefined ? "[y/N] " : "[v=view, y/N] ";
  return [
    "helmwright: allow " + action + as + "?",
    ...(detail === undefined ? [] : [show(detail)]),
    "  rule: " + ruleId + ", tier " + tier + " (" + quoted(shownReason) + ")",
    "  run: " + runId,
    ...(value === undefined ? [] : [show(value)]),
    "Approve " + action + as + " (" + ruleId + ", " + tier + ")? " + keys,
  ].join("\n");
}

const NOBODY = { answer: "denied", by: "noPresence" } as const;
const CANCELLED = { answer: "denied", by: "cancelled" } as const;
const APPROVED = { answer: "approved", by: "tty" } as const;

/**
 * The answer to log: an approval only from the TTY, and for an ask with a view only
 * once it was viewed to its end (`viewed` true); anything else denies.
 */
async function askOwner(
  presence: Presence,
  toolCallId: string,
  prompt: string,
  view: string | undefined,
  signal: AbortSignal,
): Promise<PermissionAnswer> {
  const request = {
    toolCallId,
    prompt,
    ...(view === undefined ? {} : { view }),
  };
  try {
    const got = await presence.ask(request, signal);
    // Read as plain values: a wrapped presence (SIG) is checked, not trusted.
    const [answer, by]: readonly string[] = [got.answer, got.by];
    const seen: unknown = got.viewed;
    if (view === undefined) {
      if (by !== "tty") return CANCELLED;
      return answer === "approved" ? APPROVED : { answer: "denied", by: "tty" };
    }
    const viewed = seen === true;
    if (by !== "tty" || (answer === "approved" && !viewed)) {
      return { ...CANCELLED, viewed };
    }
    return answer === "approved"
      ? { ...APPROVED, viewed: true }
      : { answer: "denied", by: "tty", viewed };
  } catch {
    return view === undefined ? CANCELLED : { ...CANCELLED, viewed: false };
  }
}

/**
 * Typed action dispatch through the permission layer: each call is ruled on by
 * `evaluate`, the ruling is logged with `permission.emitAll`, and only an `allow`, or
 * an ask the owner approved, runs its handler, on the ruled input snapshot. An ask
 * goes to `permission.presence`: the ruling and `permission.asked` are logged before
 * the prompt is shown, and `permission.answered` before any handler runs. Without a
 * presence an ask is denied as noPresence. B9b-3c: a target or detail cut by the
 * policy, or over MAX_PROMPT_TARGET or MAX_PROMPT_DETAIL as shown, is asked with a
 * full-value view, whose hash `permission.asked` holds; its approval counts only if
 * the presence says it was viewed to its end. S-3: a cut value with no full form
 * (over MAX_FULL_SHOWN) is denied with fixed text, without asking: only the
 * ruling is logged, no `permission.asked` or `permission.answered`. A ruling that
 * cannot be built denies with
 * fixed text; one whose append fails also halts the broker and the run. S2: a tool
 * call ID already used in the run is rejected (`schema.duplicate-call-id`) before
 * `evaluate`, so each ID has one ruling.
 * After a halt (that, or a sandbox cleanup failure) every call is denied.
 * @throws RangeError | TypeError if `context` breaks the sandbox's image or
 * workspace rules (checked up front, so a run fails before it starts).
 */
export function createBroker(context: BrokerContext): Broker {
  dockerRunArgs(
    { ...context, argv: ["true"], timeoutMs: EXECUTE_TIMEOUT_MS },
    "helmwright-sandbox-check",
  );
  const { permission } = context;
  const { presence } = permission;
  let halted: string | undefined;
  const usedIds = new Set<string>();
  /** Read after an await, when another call or a handler may have halted. */
  const haltedNow = (): string | undefined => halted;
  const own: BrokerContext = {
    ...context,
    halt(reason) {
      halted ??= reason;
      context.halt(reason);
    },
  };
  // Built in full first, then appended in one transaction: a ruling that cannot be
  // built appends nothing, and a failed append commits none of its entries.
  const append = (entries: readonly PermissionLogEntry[]): boolean => {
    try {
      permission.emitAll(
        entries.map(({ type, payload }) => ({ type, payload: { ...payload } })),
      );
      return true;
    } catch (error) {
      // The run recorded the failure; latch before any later call can run (SF-1).
      // Later calls see fixed text; the run's error names the log's (Nit-1).
      halted ??= PERMISSION_LOG_FAILED;
      const why = displayText(errorMessage(error));
      context.halt(PERMISSION_LOG_FAILED + ": " + why);
      return false;
    }
  };
  return {
    tools: BROKER_TOOLS,
    async executeTool(call: ToolCall, signal: AbortSignal) {
      if (halted !== undefined) return denied("denied: " + halted);
      const { id, name, input } = call;
      const reused = usedIds.has(id);
      usedIds.add(id);
      const verdict: PermissionVerdict = reused
        ? REUSED
        : evaluate(permission.policy, {
            action: name,
            input,
            worktree: permission.worktree,
            runId: permission.runId,
            extraRing0Paths: permission.ring0,
          });
      const asking =
        verdict.kind === "evaluated" &&
        (verdict.tier === "ask" || verdict.tier === "alwaysAsk");
      // S-3: a target the ask cannot show in full is denied without an ask.
      const values = asking ? shownValues(verdict) : undefined;
      const unshowable = asking && values === undefined;
      const asks = asking && !unshowable;
      const view = values === undefined ? undefined : askView(values);
      const viewed = view === undefined ? {} : { viewed: false };
      let entries: PermissionLogEntry[];
      let shown = "";
      try {
        const ctx = { agentId: permission.agentId, toolCallId: id };
        entries = [...permissionEvents(verdict, ctx)];
        if (asks) {
          shown = askPrompt(verdict, permission.runId, values ?? [], view);
          const present = presence === undefined ? "none" : "tty";
          entries.push(permissionAsked(id, present, shown, view));
          if (presence === undefined) {
            entries.push(permissionAnswered(id, { ...NOBODY, ...viewed }, 0));
          }
        }
      } catch (error) {
        if (error instanceof PermissionLogError) return denied(LOG_DENIED);
        throw error;
      }
      if (!append(entries)) return denied(LOG_DENIED);
      if (reused) return denied("denied: " + REUSED.reason);
      if (verdict.kind === "rejected") {
        const named = verdict.requestedName ?? "";
        const by =
          verdict.ruleId + (named === "" ? "" : "; requested " + named);
        return denied("denied: " + verdict.reason + " (" + by + ")");
      }
      const rule = " (" + verdict.ruleId + ")";
      switch (verdict.tier) {
        case "allow": {
          const action = ACTIONS.get(verdict.requested);
          if (action === undefined) {
            return denied("denied: no M1 handler for " + verdict.requested);
          }
          return action.handle(verdict.input, own, signal);
        }
        case "ask":
        case "alwaysAsk": {
          const what = verdict.tier === "ask" ? "asks" : "always asks";
          if (unshowable) {
            return denied(
              "denied: " +
                what +
                rule +
                "; the target is too long to show for approval",
            );
          }
          if (presence === undefined) {
            return denied(
              "denied: " + what + rule + "; nobody present to approve",
            );
          }
          // The wait counts toward the run's timeout: `signal` ends it.
          const started = performance.now();
          const answer = await askOwner(presence, id, shown, view, signal);
          const waitMs = Math.max(0, Math.round(performance.now() - started));
          let answered: PermissionLogEntry;
          try {
            answered = permissionAnswered(id, answer, waitMs);
          } catch (error) {
            if (!(error instanceof PermissionLogError)) throw error;
            own.halt(PERMISSION_LOG_FAILED);
            return denied(LOG_DENIED);
          }
          // Logged before any handler runs; unlogged, the approval counts for nothing.
          if (!append([answered])) return denied(LOG_DENIED);
          const stop = haltedNow();
          if (stop !== undefined) return denied("denied: " + stop);
          if (answer.answer !== "approved") {
            const why =
              answer.by === "cancelled"
                ? "the ask was cancelled"
                : "the owner did not approve";
            return denied("denied: " + what + rule + "; " + why);
          }
          const action = ACTIONS.get(verdict.requested);
          if (action === undefined) {
            return denied("denied: no M1 handler for " + verdict.requested);
          }
          return action.handle(verdict.input, own, signal);
        }
        case "deny":
          return denied("denied: " + verdict.reason + rule);
      }
    },
  };
}

/**
 * Checks a workspace (which need not exist yet) against the sandbox's workspace
 * rules, before anything is created or any docker work. @throws RangeError
 */
export function checkWorkspace(workspace: string, workspaceRoot: string): void {
  checkWorkspacePaths(futureRealpath(workspace), futureRealpath(workspaceRoot));
}
