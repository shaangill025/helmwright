// Generated from schemas/permission-policy.schema.json by scripts/generate.ts. Do not edit.

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
export type PermissionTier = "allow" | "ask" | "deny" | "alwaysAsk";
export type PathGlob = string;
export type Setting = string;

/**
 * The permission policy the broker evaluates for every typed action (B9, Q51). The always-ask set is checked before any rule, in every governance mode (03); an override may add or tighten, never relax it.
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
   * @maxItems 64
   */
  alwaysAsk: PermissionAction[];
  /**
   * Worktree-relative globs, matched case-folded, whose edits always ask. `*` matches within one segment; `/**` may only end a pattern and matches the directory and everything below it.
   *
   * @maxItems 256
   *
   * Items: Relative, no `.` or `..` segments, no empty segments, and `**` only as the whole last segment. Split into simple patterns so no regex nests quantifiers (ReDoS).
   */
  ring0Paths: PathGlob[];
  /**
   * Dotted setting names (08, Ring 0) whose change always asks, as do their parents and children.
   *
   * @maxItems 64
   *
   * Items: Dotted camelCase setting name, e.g. `permissions.governance`; each segment starts with a lowercase letter.
   */
  ring0Settings: Setting[];
}
export interface PermissionRule {
  id: string;
  action: PermissionAction;
  /**
   * `worktree`: the target is strictly inside the run's worktree and not under `.git` (execute always runs there). `runBranch`: the ref is the run's own branch. `any`: every target.
   */
  scope: "worktree" | "runBranch" | "any";
  tier: PermissionTier;
}
