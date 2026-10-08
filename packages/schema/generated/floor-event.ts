// Generated from schemas/floor-event.schema.json by scripts/generate.ts. Do not edit.

/**
 * Payload of a sensor floor event in the session log (B3), validated before it is appended. `kind` equals the event's `type`; the writer checks that relation. The floor is Ring 0 (06 Ring 0 contents): a deterministic rule table on the host compares the candidate tree with the run's base commit, and a candidate cannot pass by adding a suppression, changing config discovery, replacing a test command or deleting a protected assertion.
 */
export type FloorEvent = FloorChecked;
/**
 * Rules of `floor-1`. `floor.limits`: the change was too large to check, so the floor fails closed.
 */
export type FloorRule =
  | "suppression.added"
  | "config.changed"
  | "package.changed"
  | "assertion.removed"
  | "symlink.added"
  | "floor.limits";
/**
 * A repo-relative path escaped for display: 1 to 8192 code points without C0 or C1 controls, format characters, line or paragraph separators or lone surrogates, not absolute and without empty, `.` or `..` segments.
 */
export type Path = string;
/**
 * Escaped display text: 1 to 8192 code points without C0 or C1 controls, format characters, line or paragraph separators or lone surrogates.
 */
export type Text = string;

/**
 * The floor checked the candidate tree. `verdict` is `reject` if and only if there is at least one finding; `truncated` is true when more findings were found than are listed.
 */
export interface FloorChecked {
  kind: "floor.checked";
  /**
   * The rule table version, such as `floor-1`.
   */
  rules: string;
  /**
   * The run's base commit (`run.started.baseCommit`).
   */
  baseCommit: string;
  /**
   * The candidate tree: the worktree's HEAD plus its working tree, without ignored files. Its objects need not be kept; the same content gives the same ID.
   */
  candidateTree: string;
  verdict: "pass" | "reject";
  /**
   * The findings, sorted by path, line, rule and detail.
   *
   * @maxItems 256
   */
  findings: FloorFinding[];
  truncated: boolean;
}
/**
 * One rule that fired. `path` is absent only for a `floor.limits` finding about the whole change list; `line` is the 1-based line in the candidate file.
 */
export interface FloorFinding {
  rule: FloorRule;
  path?: Path;
  line?: number;
  detail: Text;
}
