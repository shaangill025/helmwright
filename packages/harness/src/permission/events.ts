import { createHash } from "node:crypto";
import {
  validatePermissionEvent,
  type PermissionAnswered,
  type PermissionAnsweredApproved,
  type PermissionAnsweredDenied,
  type PermissionAsked,
  type PermissionEvaluated,
  type PermissionEvent,
  type PermissionRejected,
} from "@helmwright/schema";
import { canonical, type PermissionVerdict } from "./policy.ts";

/** Who made the call: the run's agent and the engine's tool call ID. */
export interface PermissionLogContext {
  readonly agentId: string;
  readonly toolCallId: string;
}

/** A payload to append and its envelope `type`, which always equals `payload.kind`. */
export type PermissionLogEntry<P extends PermissionEvent = PermissionEvent> =
  P extends PermissionEvent
    ? { readonly type: P["kind"]; readonly payload: P }
    : never;

/** How an ask ended; only the owner at the TTY approves. */
export type PermissionAnswer =
  | Pick<PermissionAnsweredApproved, "answer" | "by">
  | Pick<PermissionAnsweredDenied, "answer" | "by">;

export type PermissionLogIssue = NonNullable<
  typeof validatePermissionEvent.errors
>[number];

/**
 * A permission event cannot be logged, so the caller must deny the call (fail closed).
 * The message never contains the rejected value.
 */
export class PermissionLogError extends Error {
  readonly issues: readonly PermissionLogIssue[];
  constructor(message: string, issues: readonly PermissionLogIssue[] = []) {
    super(message);
    this.name = "PermissionLogError";
    this.issues = issues;
  }
}

const TOOL_CALL_ID = /^[!-~]{1,256}$/;
/** The schema's `text` bound, in code points. */
const MAX_TEXT = 8192;

const sha256 = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");

/** @throws PermissionLogError unless `id` is printable ASCII without spaces, 1 to 256 characters (S4). */
function checkToolCallId(id: unknown): void {
  if (typeof id !== "string" || !TOOL_CALL_ID.test(id)) {
    throw new PermissionLogError("tool call ID cannot be logged");
  }
}

/**
 * Validates `payload` and pairs it with its envelope type.
 * @throws PermissionLogError on an invalid payload, which is never dropped.
 */
function entry<P extends PermissionEvent>(payload: P): PermissionLogEntry<P> {
  const kind: string = payload.kind;
  if (!validatePermissionEvent(payload)) {
    const issues = validatePermissionEvent.errors ?? [];
    const detail = issues
      .map((i) => `${i.instancePath || "/"} ${i.message ?? i.keyword}`)
      .join("; ");
    throw new PermissionLogError(`invalid ${kind} payload: ${detail}`, issues);
  }
  const logged = { type: payload.kind, payload };
  // The payload schema cannot relate the two; the writer does.
  if (logged.type !== logged.payload.kind) {
    throw new PermissionLogError("event type differs from payload kind");
  }
  return logged as PermissionLogEntry<P>;
}

/**
 * The events that record `verdict`, built from it alone: `permission.evaluated` for an
 * evaluated verdict (with `inputSha256` of its canonical input and the target value cut
 * to fit), `permission.rejected` for a rejection. Each payload is validated.
 * @throws PermissionLogError on a tool call ID or payload that cannot be logged; the
 * caller denies the call.
 */
export function permissionEvents(
  verdict: PermissionVerdict,
  ctx: PermissionLogContext,
): readonly PermissionLogEntry<PermissionEvaluated | PermissionRejected>[] {
  const { agentId, toolCallId } = ctx;
  checkToolCallId(toolCallId);
  // Typed, but a caller could still pass anything at run time.
  const kind: string = verdict.kind;
  if (kind !== "evaluated" && kind !== "rejected") {
    throw new PermissionLogError("not a permission verdict");
  }
  if (verdict.kind === "rejected") {
    const { guard, ruleId, reason, requestedName } = verdict;
    const named = requestedName === undefined ? {} : { requestedName };
    const payload: PermissionRejected = {
      kind: "permission.rejected",
      agentId,
      toolCallId,
      guard,
      ruleId,
      reason,
      ...named,
    };
    return [entry(payload)];
  }
  const { target } = verdict;
  const points = Array.from(target.value);
  const cut = points.length > MAX_TEXT;
  const value = cut ? points.slice(0, MAX_TEXT).join("") : target.value;
  const detail = target.detail === undefined ? {} : { detail: target.detail };
  const truncated = cut || target.truncated === true;
  const payload: PermissionEvaluated = {
    kind: "permission.evaluated",
    agentId,
    toolCallId,
    action: verdict.action,
    requested: verdict.requested,
    inputSha256: sha256(canonical(verdict.input)),
    target: {
      kind: target.kind,
      value,
      ...detail,
      ...(truncated ? { truncated: true } : {}),
    },
    tier: verdict.tier,
    guard: verdict.guard,
    ruleId: verdict.ruleId,
    policyVersion: verdict.policyVersion,
    reason: verdict.reason,
  };
  return [entry(payload)];
}

/**
 * `permission.asked`, binding the ask to the exact prompt shown by its SHA-256.
 * @throws PermissionLogError as `permissionEvents`.
 */
export function permissionAsked(
  toolCallId: string,
  presence: PermissionAsked["presence"],
  prompt: string,
): PermissionLogEntry<PermissionAsked> {
  checkToolCallId(toolCallId);
  const promptSha256 = sha256(prompt);
  return entry<PermissionAsked>({
    kind: "permission.asked",
    toolCallId,
    presence,
    promptSha256,
  });
}

/**
 * `permission.answered`, with no attestation until slice SIG. `waitMs` is a whole
 * number of milliseconds.
 * @throws PermissionLogError as `permissionEvents`.
 */
export function permissionAnswered(
  toolCallId: string,
  answer: PermissionAnswer,
  waitMs: number,
): PermissionLogEntry<PermissionAnswered> {
  checkToolCallId(toolCallId);
  const attestation = { kind: "none" } as const;
  const payload: PermissionAnswered = {
    kind: "permission.answered",
    toolCallId,
    ...answer,
    waitMs,
    attestation,
  };
  return entry(payload);
}
