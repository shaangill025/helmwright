// Generated from schemas/permission-policy.schema.json by scripts/generate.ts. Do not edit.

/**
 * Dotted lowercase segments (like event types). The `always-ask.` prefix is reserved for the IDs the policy guard records for always-ask stops.
 */
export type PermissionRuleId = string;
/**
 * A typed action name (Q6). Most have no M1 handler yet; they exist so that the policy can rule on them.
 */
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
 * `worktree`: the target is strictly inside the run's worktree and not under `.git` (execute always runs there). `runBranch`: the ref is the run's own branch. `any`: every target.
 */
export type PermissionScope = "worktree" | "runBranch" | "any";
export type PermissionTier = "allow" | "ask" | "deny" | "alwaysAsk";
/**
 * Relative, no `.` or `..` segments, no empty segments, and `**` only as the whole last segment. Split into simple patterns so no regex nests quantifiers (ReDoS).
 */
export type PathGlob = string;
/**
 * Dotted camelCase setting name, e.g. `permissions.governance`; each segment starts with a lowercase letter.
 */
export type Setting = string;

/**
 * The permission policy the broker evaluates for every typed action (B9, Q51). The always-ask set is checked before any rule, in every governance mode (03). This schema checks shape and requires non-empty always-ask and Ring 0 lists; that an override never relaxes the base policy's lists is a relation between two policies, so resolvePolicy enforces it, together with unique rule IDs.
 */
export interface PermissionPolicy {
  /**
   * Policy version, recorded with every permission decision.
   */
  version: string;
  /**
   * Governance mode (08, Ring 0). Only the default, tiered, until another mode has a fixture (07 rule 1).
   */
  governance: "tiered";
  /**
   * Evaluated in order after the always-ask checks; the first match wins and no match asks.
   *
   * @maxItems 256
   */
  rules: PermissionRule[];
  /**
   * Actions that always ask, whatever the rules or governance mode.
   *
   * @minItems 1
   * @maxItems 64
   */
  alwaysAsk: [PermissionAction, ...PermissionAction[]];
  /**
   * Worktree-relative globs, matched case-folded, whose edits always ask. `*` matches within one segment; `/**` may only end a pattern and matches the directory and everything below it.
   *
   * @minItems 1
   * @maxItems 256
   */
  ring0Paths: [PathGlob, ...PathGlob[]];
  /**
   * Dotted setting names (08, Ring 0) whose change always asks, as do their parents and children.
   *
   * @minItems 1
   * @maxItems 64
   */
  ring0Settings: [Setting, ...Setting[]];
}
export interface PermissionRule {
  id: PermissionRuleId;
  action: PermissionAction;
  scope: PermissionScope;
  tier: PermissionTier;
}
