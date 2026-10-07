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
import { canonical, deepFreeze, type PermissionVerdict } from "./policy.ts";

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
  | Pick<PermissionAnsweredApproved, "answer" | "by" | "viewed">
  | Pick<PermissionAnsweredDenied, "answer" | "by" | "viewed">;

export type PermissionLogIssue = NonNullable<
  typeof validatePermissionEvent.errors
>[number];

/** The PermissionLogErrors made here, recognized by identity alone (no Proxy trap runs). */
const logErrors = new WeakSet<object>();

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
    logErrors.add(this);
  }
}

/** `build()`, with any other throw as a PermissionLogError with fixed text (SF-3). */
function guarded<T>(what: string, build: () => T): T {
  try {
    return build();
  } catch (error) {
    if (logErrors.has(error as object)) throw error;
    throw new PermissionLogError(`${what} cannot be logged`);
  }
}

const TOOL_CALL_ID = /^[!-~]{1,256}$/;

/**
 * OQ1: the tool call ID of the run-start ask for a Ring 0 config change. The broker
 * counts it as used from the start, so an engine call with it is rejected (S2).
 */
export const RING0_CONFIG_CALL_ID = "helmwright.config.ring0";

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
  // N2: frozen, so what is appended is what was validated.
  return deepFreeze(logged) as PermissionLogEntry<P>;
}

/**
 * The events that record `verdict`, built from it alone: `permission.evaluated` for an
 * evaluated verdict (with `inputSha256` of its canonical input), `permission.rejected`
 * for a rejection, which must deny (N3). The broker runs a call only for `kind ===
 * "evaluated" && tier === "allow"` or after an approved ask; anything else denies.
 * @throws PermissionLogError on anything that cannot be logged (SF-3); the caller denies.
 */
export function permissionEvents(
  verdict: PermissionVerdict,
  ctx: PermissionLogContext,
): readonly PermissionLogEntry<PermissionEvaluated | PermissionRejected>[] {
  return guarded("permission verdict", () => events(verdict, ctx));
}

function events(
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
    const { tier, guard, ruleId, reason, requestedName } = verdict;
    if ((tier as string) !== "deny") {
      throw new PermissionLogError("a rejected verdict must deny");
    }
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
    return Object.freeze([entry(payload)]);
  }
  const { target } = verdict;
  const { value, truncated } = target;
  const detail = target.detail === undefined ? {} : { detail: target.detail };
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
  return Object.freeze([entry(payload)]);
}

/**
 * `permission.asked`, binding the ask to the exact prompt shown by its SHA-256, and
 * to its full-value view, if any (B9b-3c).
 * @throws PermissionLogError as `permissionEvents`.
 */
export function permissionAsked(
  toolCallId: string,
  presence: PermissionAsked["presence"],
  prompt: string,
  view?: string,
): PermissionLogEntry<PermissionAsked> {
  return guarded("permission ask", () => {
    checkToolCallId(toolCallId);
    const promptSha256 = sha256(prompt);
    return entry<PermissionAsked>({
      kind: "permission.asked",
      toolCallId,
      presence,
      promptSha256,
      ...(view === undefined ? {} : { viewSha256: sha256(view) }),
    });
  });
}

/**
 * `permission.answered`, with no attestation until slice SIG. `waitMs` is a whole
 * number of milliseconds. Only `answer.answer`, `answer.by` and `answer.viewed` are
 * read (SF-2).
 * @throws PermissionLogError as `permissionEvents`.
 */
export function permissionAnswered(
  toolCallId: string,
  answer: PermissionAnswer,
  waitMs: number,
): PermissionLogEntry<PermissionAnswered> {
  return guarded("permission answer", () => {
    checkToolCallId(toolCallId);
    const attestation = { kind: "none" } as const;
    const payload = {
      kind: "permission.answered",
      toolCallId,
      answer: answer.answer,
      by: answer.by,
      ...(answer.viewed === undefined ? {} : { viewed: answer.viewed }),
      waitMs,
      attestation,
    } as PermissionAnswered;
    return entry(payload);
  });
}
