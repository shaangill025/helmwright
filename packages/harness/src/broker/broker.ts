import type {
  ExecuteTool,
  ToolCall,
  ToolResult,
  ToolSpec,
} from "../loop/types.ts";
import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import {
  checkWorkspacePaths,
  dockerRunArgs,
  runInSandbox,
  type SandboxResult,
} from "../sandbox/docker.ts";

/** Where the broker's effects happen: one run's sandboxed workspace. */
export interface BrokerContext {
  /** Sandbox image ID from `buildSandboxImage`. */
  readonly image: string;
  readonly workspace: string;
  readonly workspaceRoot: string;
}

/** A typed action: validates its untrusted input itself, then acts. */
interface Action {
  readonly spec: ToolSpec;
  handle(
    input: unknown,
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

function parseExecute(input: unknown): { argv: string[] } | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return undefined;
  }
  const argv: unknown = "argv" in input ? input.argv : undefined;
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
    return sandboxToolResult(result);
  },
};

const ACTIONS = new Map<string, Action>([[execute.spec.name, execute]]);

/**
 * Typed action dispatch: the tool name is the action name. Unknown actions and
 * invalid input are denied before any effect; nothing else reaches the sandbox.
 * @throws RangeError | TypeError if `context` breaks the sandbox's image or
 * workspace rules (checked up front, so a run fails before it starts).
 */
export function createBroker(context: BrokerContext): Broker {
  dockerRunArgs(
    { ...context, argv: ["true"], timeoutMs: EXECUTE_TIMEOUT_MS },
    "helmwright-sandbox-check",
  );
  return {
    tools: [...ACTIONS.values()].map((a) => a.spec),
    async executeTool(call: ToolCall, signal: AbortSignal) {
      const action = ACTIONS.get(call.name);
      if (action === undefined) return denied(`unknown action: ${call.name}`);
      return action.handle(call.input, context, signal);
    },
  };
}

/** Realpath of `path`'s nearest existing ancestor, with the missing rest appended. */
function futureRealpath(path: string): string {
  const rest: string[] = [];
  let existing = resolve(path);
  while (!existsSync(existing) && dirname(existing) !== existing) {
    rest.unshift(basename(existing));
    existing = dirname(existing);
  }
  return join(realpathSync.native(existing), ...rest);
}

/**
 * Checks a workspace (which need not exist yet) against the sandbox's workspace
 * rules, before anything is created or any docker work. @throws RangeError
 */
export function checkWorkspace(workspace: string, workspaceRoot: string): void {
  checkWorkspacePaths(futureRealpath(workspace), futureRealpath(workspaceRoot));
}
