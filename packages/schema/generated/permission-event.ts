// Generated from schemas/permission-event.schema.json by scripts/generate.ts. Do not edit.

/**
 * Payload of a permission event in the session log (B9), validated before it is appended. `kind` equals the event's `type`; that the two match is a relation between envelope and payload, so the writer checks it. The B9b-2 writer emits `permission.rejected` whenever the policy verdict has no target (unknown action, invalid input, invalid policy) and `permission.evaluated` otherwise.
 */
export type PermissionEvent =
  | PermissionEvaluated
  | PermissionRejected
  | PermissionAsked
  | PermissionAnswered;
/**
 * Agent or tool-call identifier.
 */
export type Id = string;
export type PermissionAction =
  | "execute"
  | "fs.read"
  | "fs.edit"
  | "fs.delete"
  | "commit"
  | "deps.add"
  | "config.set"
  | "spend.raiseCap"
  | "push"
  | "pr.open"
  | "pr.merge"
  | "comment"
  | "publish"
  | "deploy";
/**
 * Escaped display text, at most 8192 code points.
 */
export type Text = string;
export type PermissionTier = "allow" | "ask" | "deny" | "alwaysAsk";
/**
 * A policy rule ID, or an ID a guard records: `always-ask.<action or reason>` (segments may be camelCase, like spend.raiseCap), `default.ask`, `policy.*` or `schema.*`. No regex nests unbounded quantifiers (ReDoS).
 */
export type PermissionEventRuleId = string;
/**
 * Proof of who approved. Until slice SIG only `none` exists; SIG adds `{kind: "presence", …}`, a signed owner-presence attestation.
 */
export type PermissionAttestation = PermissionAttestationNone;

/**
 * The permission layer ruled on one action call. `action` is what was ruled on; it differs from `requested` when the call was reclassified (an install through execute is deps.add).
 */
export interface PermissionEvaluated {
  kind: "permission.evaluated";
  agentId: Id;
  callId: Id;
  action: PermissionAction;
  requested: PermissionAction;
  target: PermissionEventTarget;
  tier: PermissionTier;
  /**
   * The guard that decided: input parsing, the exfiltration check or the policy.
   */
  guard: "schema" | "exfiltration" | "policy";
  ruleId: PermissionEventRuleId;
  policyVersion: string;
  reason: Text;
}
/**
 * What the action acts on, normalized and escaped for display; handlers never act on it.
 */
export interface PermissionEventTarget {
  kind: "path" | "ref" | "remote" | "setting" | "argv" | "amount";
  value: Text;
  detail?: Text;
}
/**
 * A call denied before evaluation (unknown action, invalid input or invalid policy), so there is no ruled action, target or trusted policy version. A rejection is always a denial.
 */
export interface PermissionRejected {
  kind: "permission.rejected";
  agentId: Id;
  callId: Id;
  /**
   * `schema`: unknown action or invalid input. `policy`: invalid policy.
   */
  guard: "schema" | "policy";
  ruleId: PermissionEventRuleId;
  reason: Text;
  /**
   * The requested action name as shown: escaped, already truncated, at most 256 code points. Absent when the request had no string action.
   */
  requested?: string;
}
/**
 * The owner was asked to approve a call. `promptSha256` is the SHA-256 of the exact prompt shown, so an approval can be bound to what was seen.
 */
export interface PermissionAsked {
  kind: "permission.asked";
  callId: Id;
  /**
   * `tty`: an interactive terminal could show the prompt. `none`: no one can answer, so the ask is denied.
   */
  presence: "tty" | "none";
  /**
   * Lowercase hex SHA-256.
   */
  promptSha256: string;
}
/**
 * How an ask ended. Every answer but an approval from the TTY is a denial.
 */
export interface PermissionAnswered {
  kind: "permission.answered";
  callId: Id;
  answer: "approved" | "denied";
  /**
   * Who or what ended the ask: the owner at the TTY, no presence to ask, cancellation, or the prompt timeout.
   */
  by: "tty" | "noPresence" | "cancelled" | "timeout";
  /**
   * Milliseconds between the ask and the answer.
   */
  waitMs: number;
  attestation: PermissionAttestation;
}
export interface PermissionAttestationNone {
  kind: "none";
}
