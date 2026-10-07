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
 * Agent identifier.
 */
export type AgentId = string;
/**
 * The engine's tool call ID, as in the loop events: printable ASCII without spaces, 1 to 256 characters.
 */
export type ToolCallId = string;
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
 * A policy rule ID, `default.ask`, or an always-ask floor ID, `always-ask.<action or reason>` (segments may be camelCase, like spend.raiseCap). The `schema.` and `policy.` IDs belong to rejections. No regex nests unbounded quantifiers (ReDoS).
 */
export type PermissionEventRuleId = string;
/**
 * `schema.*` or `policy.*`, otherwise like a policy rule ID.
 */
export type PermissionRejectedRuleId = string;
/**
 * Lowercase hex SHA-256.
 */
export type Sha256 = string;
/**
 * How an ask ended: an approval, which only the owner at the TTY can give, or a denial.
 */
export type PermissionAnswered =
  PermissionAnsweredApproved | PermissionAnsweredDenied;
/**
 * Milliseconds between the ask and the answer.
 */
export type WaitMs = number;
/**
 * Proof of who approved. Until slice SIG only `none` exists; SIG adds `{kind: "presence", …}`, a signed owner-presence attestation.
 */
export type PermissionAttestation = PermissionAttestationNone;

/**
 * The permission layer ruled on one action call. `action` is what was ruled on; it differs from `requested` when the call was reclassified (an install through execute is deps.add).
 */
export interface PermissionEvaluated {
  kind: "permission.evaluated";
  agentId: AgentId;
  toolCallId: ToolCallId;
  action: PermissionAction;
  requested: PermissionAction;
  /**
   * Lowercase hex SHA-256 of the canonical JSON (sorted keys, no whitespace) of the input snapshot that was ruled on, so the log binds the verdict to the exact input even when the shown target is truncated.
   */
  inputSha256: string;
  target: PermissionEventTarget;
  tier: PermissionTier;
  /**
   * The guard that decided: the exfiltration check or the policy. Schema denials are `permission.rejected`.
   */
  guard: "exfiltration" | "policy";
  ruleId: PermissionEventRuleId;
  policyVersion: string;
  reason: Text;
}
/**
 * What the action acts on, normalized and escaped for display; handlers never act on it. `truncated` is true when `value` or `detail` was cut to fit; `inputSha256` still covers the whole input.
 */
export interface PermissionEventTarget {
  kind: "path" | "ref" | "remote" | "setting" | "argv" | "amount";
  value: Text;
  detail?: Text;
  truncated?: boolean;
}
/**
 * A call denied before evaluation (unknown action, invalid input or invalid policy), so there is no ruled action, target or trusted policy version. A rejection is always a denial.
 */
export interface PermissionRejected {
  kind: "permission.rejected";
  agentId: AgentId;
  toolCallId: ToolCallId;
  /**
   * `schema`: unknown action or invalid input. `policy`: invalid policy.
   */
  guard: "schema" | "policy";
  ruleId: PermissionRejectedRuleId;
  reason: Text;
  /**
   * The requested action name as shown: cut to 64 code points, then escaped (at most 9 characters each) plus a truncation marker, so at most 640 code points. Absent when the request had no string action.
   */
  requestedName?: string;
}
/**
 * The owner was asked to approve a call. `promptSha256` is the SHA-256 of the exact prompt shown, so an approval can be bound to what was seen. `viewSha256` is present when a target or detail was too long for the prompt: the SHA-256 of the full-value view the owner must page through before an approval counts.
 */
export interface PermissionAsked {
  kind: "permission.asked";
  toolCallId: ToolCallId;
  /**
   * `tty`: an interactive terminal could show the prompt. `none`: no one can answer, so the ask is denied.
   */
  presence: "tty" | "none";
  promptSha256: Sha256;
  viewSha256?: Sha256;
}
export interface PermissionAnsweredApproved {
  kind: "permission.answered";
  toolCallId: ToolCallId;
  answer: "approved";
  by: "tty";
  /**
   * Present when the ask had a full-value view: an approval counts only after the view was shown to its end.
   */
  viewed?: true;
  waitMs: WaitMs;
  attestation: PermissionAttestation;
}
export interface PermissionAttestationNone {
  kind: "none";
}
export interface PermissionAnsweredDenied {
  kind: "permission.answered";
  toolCallId: ToolCallId;
  answer: "denied";
  /**
   * `tty`: the owner denied. `noPresence`: no one could be asked. `cancelled`: the ask ended without an answer.
   */
  by: "tty" | "noPresence" | "cancelled";
  /**
   * Present when the ask had a full-value view: whether it was shown to its end.
   */
  viewed?: boolean;
  waitMs: WaitMs;
  attestation: PermissionAttestation;
}
