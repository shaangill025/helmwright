import { Buffer } from "node:buffer";
import { lstatSync, readdirSync, readlinkSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, posix, resolve } from "node:path";
import {
  validatePermissionPolicy,
  type PermissionAction,
  type PermissionPolicy,
  type PermissionRule,
  type PermissionTier,
} from "@helmwright/schema";
import {
  INVISIBLE,
  caseFold,
  hasControl,
  isDependencyInstall,
  isRing0Path,
  normalizePath,
  type NormalizedPath,
} from "./normalize.ts";
import { CONTAINER_PATH, contains } from "../sandbox/docker.ts";

/** True for an existing directory, and for anything that cannot be checked (fail safe). */
function isDirectory(real: string): boolean {
  try {
    return lstatSync(real, { throwIfNoEntry: false })?.isDirectory() === true;
  } catch {
    return true;
  }
}

/** True if a path below `base` has an existing component that is a symlink, or cannot be checked (fail safe). */
function hasLink(base: string, relative: string): boolean {
  let path = base;
  for (const part of relative.split("/").filter(Boolean)) {
    path = join(path, part);
    try {
      const stat = lstatSync(path, { throwIfNoEntry: false });
      if (stat === undefined) return false;
      if (stat.isSymbolicLink()) return true;
    } catch {
      return true;
    }
  }
  return false;
}

/**
 * The input's worktree-relative path before symlinks are followed: NFC, `.` and `..`
 * collapsed, `/workspace` mapped onto the worktree. Undefined if it is outside.
 */
function lexical(
  input: string,
  worktree: string,
): { base: string; relative: string } | undefined {
  const path = posix.normalize(input.normalize("NFC"));
  const real = realpathSync.native(worktree);
  const mapped =
    path === CONTAINER_PATH || path.startsWith(CONTAINER_PATH + "/");
  const host = mapped
    ? join(real, path.slice(CONTAINER_PATH.length))
    : resolve(real, path);
  // An absolute input may name the worktree by its given path rather than its realpath.
  const base = [real, resolve(worktree)].find((dir) => contains(dir, host));
  return base === undefined
    ? undefined
    : { base, relative: posix.relative(base, host) };
}

/** One action call to rule on. Every field is untrusted and read once. */
export interface PermissionRequest {
  readonly action: string;
  readonly input: unknown;
  /** Host path of the run's worktree, mounted at /workspace in the sandbox. */
  readonly worktree: string;
  readonly runId: string;
  /** The run's extra Ring 0 globs: `ring0LinkTargets` of the worktree at run start. */
  readonly extraRing0Paths?: readonly string[];
}

export interface PermissionTarget {
  readonly kind: "path" | "ref" | "remote" | "setting" | "argv";
  /** Normalized (a path is its resolved host path) and escaped. */
  readonly value: string;
  /** The payload to show: the spend cap, a config value or a comment body; bounded and escaped. */
  readonly detail?: string;
}

export interface PermissionVerdict {
  readonly tier: PermissionTier;
  readonly ruleId: string;
  /** Escaped: no control, format or separator characters. */
  readonly reason: string;
  /** Absent when the policy, action or input was invalid. */
  readonly target?: PermissionTarget;
  /**
   * The frozen snapshot of the input that was ruled on. Handlers act on it (and on a
   * path's `target.value`), never on the request. Absent with `target`.
   */
  readonly input?: Readonly<Record<string, unknown>>;
}

/** Freezes `value` and everything reachable from it. */
function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value) as unknown[]) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

/**
 * Control (C0, DEL, C1), format, separator (spaces too), lone surrogate and
 * default-ignorable code points, and the backslash.
 */
const UNPRINTABLE =
  /[\p{Cc}\p{Cf}\p{Z}\p{Cs}\p{Default_Ignorable_Code_Point}\\]/gu;
/**
 * Shown text: every unprintable code point but U+0020 becomes `\u{…}`, so it cannot
 * hide or reorder text, and `\` becomes `\\`, so literal `\u{…}` text stays distinct.
 */
const escape = (text: string) =>
  text.replace(UNPRINTABLE, (c) =>
    c === " "
      ? c
      : c === "\\"
        ? "\\\\"
        : `\\u{${(c.codePointAt(0) ?? 0).toString(16)}}`,
  );
const MAX_DETAIL = 512;
const TRUNCATED = "…[truncated]";
/** The raw text cut to MAX_DETAIL code points (so no escape is split), escaped, then a marker if cut. */
function bounded(text: string): string {
  const points = Array.from(text);
  return points.length <= MAX_DETAIL
    ? escape(text)
    : escape(points.slice(0, MAX_DETAIL).join("")) + TRUNCATED;
}

/**
 * Text fields bar control and invisible characters; `word` and `ref` also whitespace;
 * `body` allows tab and newlines; `args` only bars NUL. `destination` and `names` bar
 * a leading `-` (an option); `pushRef` also bars remote-tracking refs and tags.
 */
type Field =
  | "text"
  | "word"
  | "destination"
  | "ref"
  | "pushRef"
  | "texts"
  | "names"
  | "args"
  | "body"
  | "usd"
  | "json";
type Spec = readonly [
  PermissionTarget["kind"],
  Readonly<Record<string, Field>>,
];

const egress = { destination: "destination", ref: "ref" } as const;
/** Every typed action: its target kind and its exact input fields (Q6). */
const ACTIONS: Readonly<Record<PermissionAction, Spec>> = {
  execute: ["argv", { argv: "args" }],
  "fs.read": ["path", { path: "text" }],
  "fs.edit": ["path", { path: "text" }],
  "fs.delete": ["path", { path: "text" }],
  commit: ["ref", { ref: "ref", paths: "texts" }],
  "deps.add": ["argv", { packages: "names" }],
  "config.set": ["setting", { setting: "text", value: "json" }],
  "spend.raiseCap": ["setting", { capUsd: "usd" }],
  push: ["remote", { ...egress, ref: "pushRef" }],
  "pr.open": ["remote", egress],
  "pr.merge": ["remote", egress],
  comment: ["remote", { destination: "destination", body: "body" }],
  publish: ["remote", { destination: "destination" }],
  deploy: ["remote", { destination: "destination" }],
};

/** Typed actions without an M1 handler; they exist so the policy can rule on them (Q6). */
export const PERMISSION_ONLY_ACTIONS: readonly PermissionAction[] = deepFreeze(
  (Object.keys(ACTIONS) as PermissionAction[]).filter(
    (action) => action !== "execute",
  ),
);

/** The schema's lists are non-empty, so these are built as non-empty literals. */
type NonEmpty<T> = readonly [T, ...T[]];

/** Q51 and the owner's B9 decisions (2026-10-06): always ask, in every governance mode. */
const FLOOR_ACTIONS: NonEmpty<PermissionAction> = deepFreeze([
  "push",
  "pr.open",
  "pr.merge",
  "comment",
  "publish",
  "deploy",
  "spend.raiseCap",
]);

/** Always-ask to edit in every target repo until B6 makes the set per-project. */
const FLOOR_PATHS: NonEmpty<string> = deepFreeze([
  "packages/harness/src/loop/**",
  "packages/harness/src/log/**",
  "packages/harness/src/permission/**",
  "packages/harness/src/sandbox/**",
  "packages/harness/src/ledger/**",
  "packages/harness/src/scorer/**",
  "packages/harness/sandbox/**",
  "packages/schema/schemas/**",
  // Q56 eval files; their location is fixed when the behavioral evals land.
  "evals/**",
  "packages/*/evals/**",
  ".github/**",
  "eslint.config.*",
  "tsconfig*.json",
  "vitest.config.*",
  ".prettierrc*",
  "package.json",
  "pnpm-workspace.yaml",
  ".node-version",
  // Owner decision 2026-10-06: harness config and package-manager hooks.
  "helmwright.config.json",
  ".npmrc",
  ".pnpmfile.cjs",
]);

/** The Ring 0 settings of design 08, every permissions setting (owner, 2026-10-06), and the spend cap (Q51). */
const FLOOR_SETTINGS: NonEmpty<string> = deepFreeze([
  "intake.classification",
  "permissions",
  "harnessLoop.selfImprovementModel",
  "harnessLoop.codeEvolution",
  "harnessLoop.evalMix",
  "security.sensorSet",
  "ontology.objectModel",
  "spend.cap",
]);

// The exports are frozen copies; the floor checks use the private originals above.
export const ALWAYS_ASK_ACTIONS: NonEmpty<PermissionAction> = deepFreeze([
  ...FLOOR_ACTIONS,
]);
export const RING0_PATHS: NonEmpty<string> = deepFreeze([...FLOOR_PATHS]);
export const RING0_SETTINGS: NonEmpty<string> = deepFreeze([...FLOOR_SETTINGS]);

const rule = (
  id: string,
  action: PermissionAction,
  scope: PermissionRule["scope"],
  tier: PermissionTier,
): PermissionRule => ({ id, action, scope, tier });

/** B9 initial policy. Deletes outside the worktree and Ring 0 edits are in the always-ask floor. */
export const DEFAULT_PERMISSION_POLICY: PermissionPolicy = deepFreeze({
  version: "default-1",
  governance: "tiered",
  rules: [
    rule("execute.worktree", "execute", "worktree", "allow"),
    rule("fs.read.worktree", "fs.read", "worktree", "allow"),
    rule("fs.edit.worktree", "fs.edit", "worktree", "allow"),
    rule("fs.delete.worktree", "fs.delete", "worktree", "allow"),
    rule("fs.read.outside", "fs.read", "any", "ask"),
    rule("fs.edit.outside", "fs.edit", "any", "ask"),
    rule("commit.run-branch", "commit", "runBranch", "allow"),
    rule("deps.add", "deps.add", "any", "ask"),
  ],
  alwaysAsk: [...FLOOR_ACTIONS],
  ring0Paths: [...FLOOR_PATHS],
  ring0Settings: [...FLOOR_SETTINGS],
});

/** Strictness order: an override may only move a decision rightwards. */
const RANK: readonly PermissionTier[] = ["allow", "ask", "alwaysAsk", "deny"];
const MAX_TEXT = 4096;
const MAX_BODY = 65_536;
const MAX_CAP_USD = 1000;
/** The whole input, as JSON (N4). */
const MAX_INPUT_BYTES = 262_144;
// Checked per dot-separated segment, so no regex nests quantifiers.
const SETTING_SEGMENT = /^[a-z][A-Za-z0-9]*$/;
const isSetting = (s: string) =>
  s.split(".").every((segment) => SETTING_SEGMENT.test(segment));
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

const isText = (v: unknown, max: number): v is string =>
  typeof v === "string" && v !== "" && v.length <= max;
const isPlain = (v: unknown): v is string =>
  isText(v, MAX_TEXT) && !hasControl(v) && !INVISIBLE.test(v);
const isWord = (v: unknown): v is string => isPlain(v) && !/\s/u.test(v);
/** git's special refs, which name no branch; case-folded, as a case-insensitive filesystem would. */
const SPECIAL_REFS = new Set(
  ["HEAD", "FETCH_HEAD", "ORIG_HEAD", "MERGE_HEAD", "CHERRY_PICK_HEAD"].map(
    caseFold,
  ),
);
/**
 * An ASCII branch name git check-ref-format accepts that is not an option, a refspec
 * or a special ref; at most 255 characters per component.
 */
const isRef = (v: unknown): v is string =>
  isWord(v) &&
  /^[A-Za-z0-9._/-]+$/.test(v) &&
  !v.startsWith("-") &&
  !v.includes("..") &&
  !v.endsWith(".") &&
  !SPECIAL_REFS.has(caseFold(v)) &&
  v
    .split("/")
    .every(
      (part) =>
        part !== "" &&
        part.length <= 255 &&
        !part.startsWith(".") &&
        !part.endsWith(".lock"),
    );
const isList = (v: unknown, item: (x: unknown) => boolean) =>
  Array.isArray(v) && v.length > 0 && v.length <= 1024 && v.every(item);
/** True if `v` is a valid value of the field kind (a switch, not a dynamic lookup). */
function isField(kind: Field, v: unknown): boolean {
  switch (kind) {
    case "text":
      return isPlain(v);
    case "word":
      return isWord(v);
    case "destination":
      return isWord(v) && !v.startsWith("-");
    case "ref":
      return isRef(v);
    case "pushRef":
      return isRef(v) && !/^refs\/(?:remotes|tags)\//i.test(v);
    case "texts":
      return isList(v, isPlain);
    case "names":
      return isList(v, (x) => isPlain(x) && !x.startsWith("-"));
    case "args":
      return isList(v, (x) => isText(x, MAX_BODY) && !x.includes("\0"));
    case "body":
      return isText(v, MAX_BODY) && !hasControl(v, "\t\n\r");
    case "usd":
      return typeof v === "number" && v > 0 && v <= MAX_CAP_USD;
    case "json":
      return v !== undefined;
  }
}

/** A plain-data copy of `value`, read once; undefined if it is not JSON or over MAX_INPUT_BYTES. */
function snapshot(value: unknown): unknown {
  // Undefined at run time for undefined, a function or a symbol.
  const json = JSON.stringify(value) as string | undefined;
  if (json === undefined || Buffer.byteLength(json) > MAX_INPUT_BYTES) {
    return undefined;
  }
  return JSON.parse(json);
}

/** The input's fields if it has exactly the action's fields, all valid. */
function parseInput(
  fields: Readonly<Record<string, Field>>,
  input: unknown,
): Readonly<Record<string, unknown>> | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return undefined;
  }
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record);
  const valid =
    keys.length === Object.keys(fields).length &&
    keys.every((key) => {
      const kind = Object.hasOwn(fields, key) ? fields[key] : undefined;
      return kind !== undefined && isField(kind, record[key]);
    });
  return valid ? record : undefined;
}

/** What the rules and the always-ask floor see of one request. */
interface Facts {
  /** The action ruled on: `execute` that installs dependencies is ruled as `deps.add`. */
  readonly action: PermissionAction;
  readonly requested: PermissionAction;
  readonly inWorktree: boolean;
  readonly onRunBranch: boolean;
  readonly ring0?: "path" | "setting" | undefined;
}

/** United with the built-in floor, so not even an unresolved policy can drop it. */
const union = (own: readonly string[], floor: readonly string[]) => [
  ...new Set([...floor, ...own]),
];

function floorRule(policy: PermissionPolicy, f: Facts): [string, string] | [] {
  const alwaysAsk = union(policy.alwaysAsk, FLOOR_ACTIONS);
  for (const action of [f.action, f.requested]) {
    if (alwaysAsk.includes(action)) {
      return [`always-ask.${action}`, `${action} is in the always-ask set`];
    }
  }
  if (f.action === "fs.delete" && !f.inWorktree) {
    return ["always-ask.delete-outside", "deletes outside the worktree ask"];
  }
  // Every floor ID has the `always-ask.` prefix, which the schema reserves, so no rule can spoof one.
  if (f.ring0 === "path") {
    return ["always-ask.ring0-path", "Ring 0 path edits ask"];
  }
  if (f.ring0 === "setting") {
    return ["always-ask.ring0-setting", "Ring 0 settings ask"];
  }
  return [];
}

/** The always-ask floor first (a matching deny rule still denies), then the first matching rule, else ask. */
function decide(policy: PermissionPolicy, f: Facts): PermissionVerdict {
  const match = policy.rules.find(
    (r) =>
      r.action === f.action &&
      (r.scope === "any" ||
        (r.scope === "worktree" && f.inWorktree) ||
        (r.scope === "runBranch" && f.onRunBranch)),
  );
  const [ruleId, reason] = floorRule(policy, f);
  if (ruleId !== undefined && match?.tier !== "deny") {
    return { tier: "alwaysAsk", ruleId, reason: reason ?? "" };
  }
  if (match !== undefined) {
    return { tier: match.tier, ruleId: match.id, reason: `rule ${match.id}` };
  }
  return { tier: "ask", ruleId: "default.ask", reason: "no rule matches" };
}

/** The request's own values, each read once. */
interface Run {
  readonly worktree: string;
  readonly runId: string;
  readonly extraRing0Paths: readonly string[];
}

/**
 * Normalizes the target and derives the facts.
 * @throws PathError if a path cannot be normalized; TypeError on an invalid setting.
 */
function factsFor(
  policy: PermissionPolicy,
  requested: PermissionAction,
  fields: Readonly<Record<string, unknown>>,
  request: Run,
): { facts: Facts; target: PermissionTarget } {
  const { argv, body, capUsd, path, paths, setting, ref } = fields;
  const ring0Paths = union(
    [...policy.ring0Paths, ...request.extraRing0Paths],
    FLOOR_PATHS,
  );
  // The worktree root ("") is not itself a Ring 0 path; it is outside the worktree scope.
  const isRing0 = ({ relative }: { relative: string | undefined }) =>
    relative !== undefined &&
    relative !== "" &&
    isRing0Path(relative, ring0Paths);
  // B1: git commits a link as a link and tools follow it, so a write is Ring 0 if the
  // path before or after symlinks is, or if it passes through any link (even dangling).
  const isRing0Write = (input: string, resolved: NormalizedPath) => {
    const named = lexical(input, request.worktree);
    // Lexically outside but resolved into the worktree: a link outside leads in.
    if (named === undefined) return resolved.relative !== undefined;
    return (
      isRing0(resolved) || isRing0(named) || hasLink(named.base, named.relative)
    );
  };
  const normalize = (p: string) => {
    try {
      return normalizePath(p, request.worktree);
    } catch (error) {
      throw new PathError(error);
    }
  };
  const runBranch = `helmwright/run/${request.runId}`;
  const resolved = typeof path === "string" ? normalize(path) : undefined;
  let ring0: Facts["ring0"];
  // An existing directory cannot be checked file by file, so editing or deleting it counts as Ring 0.
  if (
    requested !== "fs.read" &&
    typeof path === "string" &&
    resolved !== undefined &&
    (isDirectory(resolved.real) || isRing0Write(path, resolved))
  ) {
    ring0 = "path";
  } else if (
    Array.isArray(paths) &&
    (paths as string[])
      .map((input) => [input, normalize(input)] as const)
      .some(([input, p]) => {
        // A path that is the root, a directory or not strictly inside the worktree cannot be
        // checked file by file, so it counts as Ring 0 (B8 builds commit paths from the diff).
        return (
          !p.inside ||
          p.relative === "" ||
          isDirectory(p.real) ||
          isRing0Write(input, p)
        );
      })
  ) {
    ring0 = "path";
  } else if (typeof setting === "string") {
    if (setting.length > 128 || !isSetting(setting)) {
      throw new TypeError("invalid setting name");
    }
    const folded = caseFold(setting);
    // A parent or child of a Ring 0 setting changes it too.
    const overlaps = (s: string) =>
      folded === s || folded.startsWith(s + ".") || s.startsWith(folded + ".");
    if (
      union(policy.ring0Settings, FLOOR_SETTINGS).map(caseFold).some(overlaps)
    ) {
      ring0 = "setting";
    }
  }
  const install = Array.isArray(argv) && isDependencyInstall(argv as string[]);
  const list = argv ?? fields["packages"];
  const value =
    resolved?.real ??
    (list === undefined
      ? [setting, fields["destination"], ref]
          .filter((s) => typeof s === "string")
          .join(" ")
      : JSON.stringify(list));
  const detail =
    requested === "config.set"
      ? canonical(fields["value"])
      : typeof capUsd === "number"
        ? `${String(capUsd)} USD`
        : typeof body === "string"
          ? body
          : undefined;
  return {
    facts: {
      action: install ? "deps.add" : requested,
      requested,
      inWorktree: requested === "execute" || resolved?.inside === true,
      onRunBranch: ref === runBranch || ref === `refs/heads/${runBranch}`,
      ring0,
    },
    target: {
      kind: ACTIONS[requested][0],
      value: escape(value || "spend.cap"),
      ...(detail === undefined ? {} : { detail: bounded(detail) }),
    },
  };
}

/** normalizePath's own messages, which name no path. */
const PATH_MESSAGES = new Set([
  "path must be non-empty, without control characters",
  "path or path segment too long",
  "path does not resolve",
  "resolved path has control or invisible characters",
]);
/** The PathErrors thrown, so the catch can recognize one by identity alone. */
const pathErrors = new WeakSet<object>();

/** normalizePath threw. The message is an error code, one of PATH_MESSAGES, or empty; never a path. */
class PathError extends Error {
  constructor(cause: unknown) {
    const code: unknown =
      cause instanceof Error && "code" in cause ? cause.code : undefined;
    super(
      typeof code === "string" && /^E[A-Z0-9_]{1,63}$/.test(code)
        ? code
        : cause instanceof TypeError && PATH_MESSAGES.has(cause.message)
          ? cause.message
          : "",
    );
    pathErrors.add(this);
  }
}

const deny = (ruleId: string, reason: string): PermissionVerdict => ({
  tier: "deny",
  ruleId,
  reason: escape(reason),
});

/** The first problem with a policy, or undefined if it is valid. */
function policyProblem(policy: unknown): string | undefined {
  if (!validatePermissionPolicy(policy)) {
    const error = validatePermissionPolicy.errors?.[0];
    return `${error?.instancePath ?? ""} ${error?.message ?? ""}`.trim();
  }
  const ids = policy.rules.map((r) => r.id);
  const repeated = ids.find((id, i) => ids.indexOf(id) !== i);
  if (repeated !== undefined) return `rule id ${repeated} repeats`;
  // The guards record these IDs; a rule must not be confused with one (the schema reserves always-ask.).
  const reserved = ids.find((id) => /^(default|policy|schema)\./.test(id));
  return reserved === undefined ? undefined : `rule id ${reserved} is reserved`;
}

/** The schema's pathGlob (permission-policy.schema.json): its pattern, then its `not` pattern. */
const GLOB = /^[A-Za-z0-9._*/-]{1,128}$/;
const NOT_GLOB = /^\/|\/\/|\/$|(?:^|\/)\.\.?(?:\/|$)|\*\*[^/]|[^/]\*\*|\*\*\//;
/** Bounded like the schema's lists; each is a valid Ring 0 glob. */
const isGlobs = (v: unknown): v is string[] =>
  Array.isArray(v) &&
  v.length <= 1024 &&
  v.every((g) => typeof g === "string" && GLOB.test(g) && !NOT_GLOB.test(g));

/**
 * Rules on one action call. The always-ask floor (the policy's set united with the
 * built-in one, deletes outside the worktree, Ring 0 paths and settings) comes first
 * in every governance mode; then the first matching rule; no match asks. An unknown
 * action, invalid input or invalid policy is denied. Never throws: each request field
 * is read once, and the policy and input are ruled on as JSON snapshots.
 */
export function evaluate(
  policy: PermissionPolicy,
  request: PermissionRequest,
): PermissionVerdict {
  let requested: PermissionAction | undefined;
  try {
    const { action, input, worktree, runId, extraRing0Paths } = request;
    const rules = snapshot(policy);
    const problem = policyProblem(rules);
    if (problem !== undefined) return deny("policy.invalid", problem);
    // policyProblem validated it.
    const checked = rules as PermissionPolicy;
    if (typeof action !== "string" || !Object.hasOwn(ACTIONS, action)) {
      const name = typeof action === "string" ? action.slice(0, 64) : "";
      return deny(
        "schema.unknown-action",
        `unknown action ${JSON.stringify(name)}`,
      );
    }
    requested = action as PermissionAction;
    const fields = parseInput(ACTIONS[requested][1], snapshot(input));
    const extra = snapshot(extraRing0Paths ?? []);
    if (
      fields === undefined ||
      typeof worktree !== "string" ||
      typeof runId !== "string" ||
      !RUN_ID.test(runId) ||
      !isGlobs(extra)
    ) {
      return deny("schema.invalid-input", `invalid input for ${requested}`);
    }
    const run = { worktree, runId, extraRing0Paths: extra };
    const { facts, target } = factsFor(checked, requested, fields, run);
    const { tier, ruleId, reason } = decide(checked, facts);
    const ruled = deepFreeze(fields);
    return { tier, ruleId, reason: escape(reason), target, input: ruled };
  } catch (error) {
    // Fail closed with fixed text: a thrown value is never converted or inspected,
    // except our own PathError, which is recognized by identity.
    const action = requested ?? "request";
    if (typeof error === "object" && error !== null && pathErrors.has(error)) {
      const { message } = error as PathError;
      const why = message === "" ? "" : `: ${message}`;
      return deny("schema.invalid-input", `${action} path rejected${why}`);
    }
    return deny("schema.invalid-input", `invalid input for ${action}`);
  }
}

/**
 * Validates copies of `given` and `untrusted` (a whole PermissionPolicy) and returns the
 * override's copy if it is at least as strict as the base: it may add to and tighten the
 * rules and the always-ask, Ring 0 path and Ring 0 setting sets, but never remove from
 * or relax them. A changed policy needs a new version.
 * @throws TypeError if either policy is invalid; RangeError on a relaxation, or on the
 * base's version with other content.
 */
export function resolvePolicy(
  given: PermissionPolicy,
  untrusted: unknown,
): PermissionPolicy {
  let copies: [unknown, unknown];
  try {
    copies = [structuredClone(given), structuredClone(untrusted)];
  } catch {
    throw new TypeError("invalid permission policy: not plain data");
  }
  const [base, override] = copies;
  const problem = policyProblem(base) ?? policyProblem(override);
  if (
    problem !== undefined ||
    !validatePermissionPolicy(base) ||
    !validatePermissionPolicy(override)
  ) {
    throw new TypeError(`invalid permission policy: ${problem ?? ""}`);
  }
  for (const key of ["alwaysAsk", "ring0Paths", "ring0Settings"] as const) {
    const kept: readonly string[] = override[key];
    const removed = base[key].filter((item) => !kept.includes(item));
    if (removed.length > 0) {
      throw new RangeError(
        `override relaxes ${key}: removes ${removed.join(", ")}`,
      );
    }
  }
  // Rules see only the action and two scope facts, so comparing every combination is exact.
  for (const action of Object.keys(ACTIONS) as PermissionAction[]) {
    for (const [inWorktree, onRunBranch] of [
      [true, true],
      [true, false],
      [false, true],
      [false, false],
    ] as const) {
      const facts = { action, requested: action, inWorktree, onRunBranch };
      const [before, after] = [decide(base, facts), decide(override, facts)];
      if (RANK.indexOf(after.tier) < RANK.indexOf(before.tier)) {
        throw new RangeError(
          `override relaxes ${action} (inWorktree ${String(inWorktree)}, onRunBranch ${String(onRunBranch)}): ${before.ruleId} ${before.tier} → ${after.ruleId} ${after.tier}`,
        );
      }
    }
  }
  if (
    override.version === base.version &&
    canonical(override) !== canonical(base)
  ) {
    throw new RangeError(
      `override has the same version as the base (${base.version}) but other content`,
    );
  }
  return deepFreeze(override);
}

/** JSON with object keys sorted, so equal policies compare equal. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    typeof v === "object" && v !== null && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : v,
  );

/**
 * The worktree-relative paths of the links met while resolving `relative` as the
 * kernel does, one component at a time: each link in a chain and each symlinked
 * directory along the way, even if the last hop leaves the worktree.
 * @throws TypeError past 40 links (Linux's limit); an fs error.
 */
function linksOnTheWay(root: string, relative: string): string[] {
  const pending = relative.split("/");
  const links: string[] = [];
  let current = root;
  for (let part = pending.shift(); part !== undefined; part = pending.shift()) {
    const next = part === ".." ? dirname(current) : join(current, part);
    const stat = lstatSync(next, { throwIfNoEntry: false });
    if (stat === undefined) break;
    if (!stat.isSymbolicLink()) {
      current = next;
      continue;
    }
    if (links.length >= 40) throw new TypeError("too many symlinks");
    links.push(next);
    const target = readlinkSync(next);
    pending.unshift(...target.split("/").filter((s) => s !== "" && s !== "."));
    if (isAbsolute(target)) current = "/";
  }
  return links
    .filter((link) => link !== root && contains(root, link))
    .map((link) => posix.relative(root, link));
}

/**
 * The Ring 0 globs for the worktree paths that existing symlinks at Ring 0 names, or
 * at a leading part of one, resolve to (`package.json` -> `config/pkg.json` gives
 * `config/pkg.json/**`, which matches the path and everything below it; a link to the
 * worktree root gives `**`), plus every other link on the way (`a/**` for
 * `package.json` -> `a` -> `config/pkg.json`). A link at a leading part, such as
 * `packages/harness/src` -> `hsrc`, adds its whole target, which over-includes.
 * B9b computes them at run start and passes them as `extraRing0Paths`, so a commit of
 * the link's target asks. Only directories that a Ring 0 glob or a leading part of
 * one matches are walked; symlinked directories are not followed.
 * @throws on an fs error, over 40 links, a link that normalizePath rejects, or a target
 * whose name is not a valid Ring 0 glob (RangeError); refuse the run then.
 */
export function ring0LinkTargets(
  worktree: string,
  ring0Paths: readonly string[],
): string[] {
  const root = realpathSync.native(worktree);
  // Each glob's leading parts, and the glob itself.
  const prefixes = ring0Paths.flatMap((glob) =>
    glob.split("/").map((_, i, parts) => parts.slice(0, i + 1).join("/")),
  );
  const found = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const relative = dir === "" ? entry.name : `${dir}/${entry.name}`;
      if (entry.isSymbolicLink() && isRing0Path(relative, prefixes)) {
        const target = normalizePath(relative, root).relative;
        if (target !== undefined)
          found.add(target === "" ? "**" : `${target}/**`);
        for (const link of linksOnTheWay(root, relative)) {
          if (link !== relative) found.add(`${link}/**`);
        }
      } else if (entry.isDirectory() && isRing0Path(relative, prefixes)) {
        walk(relative);
      }
    }
  };
  walk("");
  // A name that is not a valid Ring 0 glob would deny every request in the run; refuse
  // the run here instead, with a clear reason.
  const unsupported = [...found].filter((g) => !isGlobs([g]));
  if (unsupported.length > 0) {
    throw new RangeError(
      `Ring 0 link targets with unsupported names (ASCII letters, digits, ._-/ only, at most 128 characters): ${unsupported.map((g) => escape(g)).join(", ")}`,
    );
  }
  return [...found];
}
