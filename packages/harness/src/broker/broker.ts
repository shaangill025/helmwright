import type { PermissionPolicy } from "@helmwright/schema";
import type {
  Emit,
  ExecuteTool,
  ToolCall,
  ToolResult,
  ToolSpec,
} from "../loop/types.ts";
import {
  PermissionLogError,
  permissionAnswered,
  permissionAsked,
  permissionEvents,
  type PermissionLogEntry,
} from "../permission/events.ts";
import {
  evaluate,
  type EvaluatedVerdict,
  type RunRing0,
} from "../permission/policy.ts";
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
  /** The run's validated log append; the broker itself never touches the log. */
  readonly emit: Emit;
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

/** What an ask shows (B9b-3 prints it): every shown value is already escaped. */
function askPrompt(verdict: EvaluatedVerdict, runId: string): string {
  const { action, requested, target, ruleId, reason } = verdict;
  const as = requested === action ? "" : " (requested as " + requested + ")";
  const detail =
    target.detail === undefined ? [] : ["  detail: " + target.detail];
  return [
    "helmwright: allow " + action + as + "?",
    "  target (" + target.kind + "): " + target.value,
    ...detail,
    "  rule: " + ruleId + " (" + reason + ")",
    "  run: " + runId,
    "Approve? [y/N] ",
  ].join("\n");
}

const NOBODY = { answer: "denied", by: "noPresence" } as const;

/**
 * Typed action dispatch through the permission layer: each call is ruled on by
 * `evaluate`, the ruling is logged with `permission.emit`, and only an `allow` runs
 * its handler, on the ruled input snapshot. Nobody is present to answer an ask
 * (B9b-3 adds the TTY), so ask and always-ask deny. A ruling that cannot be logged
 * denies with fixed text. After a sandbox cleanup failure every call is denied.
 * @throws RangeError | TypeError if `context` breaks the sandbox's image or
 * workspace rules (checked up front, so a run fails before it starts).
 */
export function createBroker(context: BrokerContext): Broker {
  dockerRunArgs(
    { ...context, argv: ["true"], timeoutMs: EXECUTE_TIMEOUT_MS },
    "helmwright-sandbox-check",
  );
  const { permission } = context;
  let halted: string | undefined;
  const own: BrokerContext = {
    ...context,
    halt(reason) {
      halted ??= reason;
      context.halt(reason);
    },
  };
  return {
    tools: BROKER_TOOLS,
    async executeTool(call: ToolCall, signal: AbortSignal) {
      if (halted !== undefined) return denied("denied: " + halted);
      const { id, name, input } = call;
      const verdict = evaluate(permission.policy, {
        action: name,
        input,
        worktree: permission.worktree,
        runId: permission.runId,
        extraRing0Paths: permission.ring0,
      });
      const asks =
        verdict.kind === "evaluated" &&
        (verdict.tier === "ask" || verdict.tier === "alwaysAsk");
      let entries: PermissionLogEntry[];
      try {
        const ctx = { agentId: permission.agentId, toolCallId: id };
        entries = [...permissionEvents(verdict, ctx)];
        if (asks) {
          const shown = askPrompt(verdict, permission.runId);
          entries.push(permissionAsked(id, "none", shown));
          entries.push(permissionAnswered(id, NOBODY, 0));
        }
      } catch (error) {
        if (error instanceof PermissionLogError) return denied(LOG_DENIED);
        throw error;
      }
      // Built before any append, so a ruling that cannot be built appends nothing.
      for (const { type, payload } of entries) {
        permission.emit(type, { ...payload });
      }
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
          return denied(
            "denied: " + what + rule + "; nobody present to approve",
          );
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
