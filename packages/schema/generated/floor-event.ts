// Generated from schemas/floor-event.schema.json by scripts/generate.ts. Do not edit.

/**
 * Payload of a sensor floor event in the session log (B3), validated before it is appended. `kind` equals the event's `type`; the writer checks that relation. The floor is Ring 0 (06 Ring 0 contents): a deterministic rule table on the host compares the candidate tree with the run's base commit, and a candidate cannot pass by adding a suppression, changing config discovery, replacing a test command or deleting a protected assertion.
 */
export type FloorEvent = FloorChecked | FloorSignalled;
/**
 * Rules of `floor-1` and `floor-2`. `assertion.removed` is `floor-1` only: `floor-2` replaces it with `protected.changed`, a finding for any change to a protected path. `floor.limits`: the change was too large to check, so the floor fails closed.
 */
export type FloorRule =
  | "suppression.added"
  | "config.changed"
  | "package.changed"
  | "assertion.removed"
  | "protected.changed"
  | "symlink.added"
  | "gitlink.added"
  | "encoding.unreadable"
  | "floor.limits";
/**
 * A repo-relative path escaped for display: 1 to 8192 code points without C0 or C1 controls, format characters, line or paragraph separators or lone surrogates, not absolute and without empty, `.` or `..` segments.
 */
export type Path = string;
/**
 * Escaped display text: 1 to 8192 code points without C0 or C1 controls, format characters, line or paragraph separators or lone surrogates.
 */
export type Text = string;
export type FloorSignal =
  FloorDependencyAdded | FloorDependencyMajorBump | FloorLockfileOnly;
/**
 * `<floor.signalled eventId>:<index>`; it fits the object events' `signalId` (at most 128 code units).
 */
export type SignalId = string;
/**
 * The manifest field: the runtime fields and `devDependencies`.
 */
export type DependencyField =
  | "dependencies"
  | "optionalDependencies"
  | "peerDependencies"
  | "devDependencies";
/**
 * A dependency specifier escaped for display, as `text` but possibly empty.
 */
export type Specifier = string;

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
/**
 * A floor detector's signals from the base-to-candidate changes (Q44): a direct dependency added, a major bump of one, a lockfile-only change. `final` is the authoritative check at the run's end, `early` a warning in the middle of a run that opens no decision. `materiality` is the rubric version and brief threshold that route each signal to a Brief or a Ruling (Q53).
 */
export interface FloorSignalled {
  kind: "floor.signalled";
  /**
   * The detector version.
   */
  detector: "dependency-1";
  phase: "final" | "early";
  /**
   * The run's base commit (`run.started.baseCommit`).
   */
  baseCommit: string;
  /**
   * The candidate tree the signals were found in, as in `floor.checked`.
   */
  candidateTree: string;
  materiality: {
    rubricVersion: string;
    /**
     * The `decisions.briefThreshold` value used.
     */
    threshold: "runtimeAddOrMajor" | "everySignal" | "runtimeAddOnly";
  };
  /**
   * The signals, sorted by path, name and type.
   *
   * @maxItems 256
   */
  signals: FloorSignal[];
}
/**
 * A direct dependency in `field`: a runtime one in no runtime field of the base (a move from `devDependencies` counts), a dev one in no field of the base. Every specifier kind counts.
 */
export interface FloorDependencyAdded {
  id: SignalId;
  type: "dependency.added";
  /**
   * A repo-relative path escaped for display: 1 to 8192 code points without C0 or C1 controls, format characters, line or paragraph separators or lone surrogates, not absolute and without empty, `.` or `..` segments.
   */
  path: string;
  field: DependencyField;
  /**
   * Escaped display text: 1 to 8192 code points without C0 or C1 controls, format characters, line or paragraph separators or lone surrogates.
   */
  name: string;
  /**
   * Whether `field` is a runtime field (not `devDependencies`).
   */
  runtime: boolean;
  from: null;
  to: Specifier;
}
/**
 * A changed specifier of a direct dependency in the same field, whose major key differs (`major`) or which either side's specifier gives none for (`unknown`, OQ-AD-2).
 */
export interface FloorDependencyMajorBump {
  id: SignalId;
  type: "dependency.majorBump";
  /**
   * A repo-relative path escaped for display: 1 to 8192 code points without C0 or C1 controls, format characters, line or paragraph separators or lone surrogates, not absolute and without empty, `.` or `..` segments.
   */
  path: string;
  field: DependencyField;
  /**
   * Escaped display text: 1 to 8192 code points without C0 or C1 controls, format characters, line or paragraph separators or lone surrogates.
   */
  name: string;
  /**
   * Whether `field` is a runtime field (not `devDependencies`).
   */
  runtime: boolean;
  from: Specifier;
  to: Specifier;
  bump: "major" | "unknown";
}
/**
 * A changed lockfile, when no manifest in the change changed a dependency field.
 */
export interface FloorLockfileOnly {
  id: SignalId;
  type: "lockfile.only";
  /**
   * A repo-relative path escaped for display: 1 to 8192 code points without C0 or C1 controls, format characters, line or paragraph separators or lone surrogates, not absolute and without empty, `.` or `..` segments.
   */
  path: string;
}
