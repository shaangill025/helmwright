import { Buffer } from "node:buffer";
import { lstatSync, readdirSync, realpathSync } from "node:fs";
import { join, posix, resolve } from "node:path";
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
  walkPath,
  type NormalizedPath,
} from "./normalize.ts";
import { CONTAINER_PATH, contains } from "../sandbox/docker.ts";
import { credentialIn, type CredentialFound } from "./exfiltration.ts";

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

/** The run's extra Ring 0 globs. Only `runRing0` makes one; `evaluate` checks it (SF-1). */
export type RunRing0 = readonly string[] & { readonly __brand: "RunRing0" };

/** Each array `runRing0` issued, with the worktree realpath and the globs it walked. */
const ISSUED = new WeakMap<
  object,
  { readonly worktreeReal: string; readonly ring0Paths: readonly string[] }
>();

/** One action call to rule on. Every field is untrusted and read once. */
export interface PermissionRequest {
  readonly action: string;
  readonly input: unknown;
  /** Host path of the run's worktree, mounted at /workspace in the sandbox. */
  readonly worktree: string;
  readonly runId: string;
  /** `runRing0` of this worktree and policy at run start (SF3); any other value denies. */
  readonly extraRing0Paths: RunRing0;
}

export interface PermissionTarget {
  readonly kind: "path" | "ref" | "remote" | "setting" | "argv" | "amount";
  /** Display only: normalized (a path is its resolved host path) and escaped. */
  readonly value: string;
  /** The payload to show: the spend cap, a config value, a comment body or a commit's staged paths; bounded and escaped. */
  readonly detail?: string;
  /** Present when `value` or `detail` was cut (raw, before escaping) and marked to fit. */
  readonly truncated?: true;
}

/** A cut target's whole value and detail, escaped and uncut, for the prompt's view only. */
export interface FullTarget {
  readonly value: string;
  readonly detail?: string;
}

/** A known action with valid input, ruled on under a valid policy. */
export interface EvaluatedVerdict {
  readonly kind: "evaluated";
  readonly tier: PermissionTier;
  readonly ruleId: string;
  /** Escaped: no control, format or separator characters. */
  readonly reason: string;
  /** The action ruled on: `execute` that installs dependencies is `deps.add`. */
  readonly action: PermissionAction;
  readonly requested: PermissionAction;
  /** The guard that decided. */
  readonly guard: "exfiltration" | "policy";
  /** The `version` of the policy snapshot that was checked. */
  readonly policyVersion: string;
  readonly target: PermissionTarget;
  /**
   * B9b-3c: present when `target.truncated` and the escaped value and detail together
   * are at most MAX_FULL_SHOWN code points. Never logged; `inputSha256` binds the input.
   */
  readonly fullTarget?: FullTarget;
  /** A path target's resolved host path, unescaped (SF4). Handlers act on it, never on `target.value`. */
  readonly path?: string;
  /**
   * A commit's resolved worktree-relative paths, unescaped and without pathspec magic
   * (SF-5); `.` is the root. A commit handler (none in M1 yet) must stage only these,
   * after `--` and with `--literal-pathspecs` (or `GIT_LITERAL_PATHSPECS=1`). The run's
   * Ring 0 link targets are a snapshot taken at run start, so a future write or commit
   * handler must re-check them at use time (N6).
   */
  readonly paths?: readonly string[];
  /** The frozen snapshot of the input that was ruled on. Handlers act on it, never on the request. */
  readonly input: Readonly<Record<string, unknown>>;
  readonly requestedName?: undefined;
}

/** A call denied before evaluation: an invalid policy (guard `policy`), or an unknown action or invalid input (`schema`). */
export interface RejectedVerdict {
  readonly kind: "rejected";
  readonly tier: "deny";
  readonly ruleId: string;
  /** Escaped: no control, format or separator characters. */
  readonly reason: string;
  readonly guard: "schema" | "policy";
  /** The requested action name as shown: cut to 64 code points, escaped, then a marker if cut. */
  readonly requestedName?: string;
  readonly target?: undefined;
  readonly fullTarget?: undefined;
  readonly path?: undefined;
  readonly paths?: undefined;
  readonly input?: undefined;
}

export type PermissionVerdict = EvaluatedVerdict | RejectedVerdict;

/** Freezes `value` and everything reachable from it. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value) as unknown[]) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

/**
 * Control (C0, DEL, C1), format, separator (spaces too), lone surrogate, private-use,
 * unassigned and default-ignorable code points, U+2800 (a blank braille cell, R2),
 * the backslash, and (N-4) each combining mark after the first two of a run, so
 * marks cannot stack over text.
 */
const UNPRINTABLE =
  /[\p{Cc}\p{Cf}\p{Z}\p{Cs}\p{Co}\p{Cn}\p{Default_Ignorable_Code_Point}\u{2800}\\]|(?<=\p{M}{2})\p{M}/gu;
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
/** The event schema's bound on shown text, in code points. */
const MAX_SHOWN = 8192;
/** Raw code points that always fit MAX_SHOWN once escaped (at most 10 each, `\u{10fffd}`) with the marker. */
const MAX_SHOWN_RAW = Math.floor((MAX_SHOWN - TRUNCATED.length) / 10);
/** B9b-3c: the most code points a cut target's full form may have, value and detail together. */
export const MAX_FULL_SHOWN = 65_536;
/** Escaped `text`, or undefined if that would exceed `max` code points. */
function whole(text: string, max: number): string | undefined {
  // Each code point is at most 2 UTF-16 units, so a longer text has too many.
  if (text.length > 2 * max) return undefined;
  const shown = escape(text);
  return Array.from(shown).length <= max ? shown : undefined;
}
/** N3: whether an ask for `config.set` of `setting` to `value` can show the whole value. */
export function fitsAsk(setting: string, value: unknown): boolean {
  const detail = canonical(value);
  const room = MAX_FULL_SHOWN - Array.from(escape(setting)).length;
  const bytes = Buffer.byteLength(detail) + Buffer.byteLength(setting) + 64;
  return bytes <= MAX_INPUT_BYTES && whole(detail, room) !== undefined;
}
/** The raw text cut to `max` code points (so no escape is split), escaped, then a marker if cut; and if it was. */
function bounded(text: string, max: number): readonly [string, boolean] {
  let kept = "";
  let count = 0;
  for (const point of text) {
    if (count === max) return [escape(kept) + TRUNCATED, true];
    kept += point;
    count += 1;
  }
  return [escape(text), false];
}
/** `text` as shown on a terminal or in a log: escaped, cut to MAX_DETAIL code points. */
export function displayText(text: string): string {
  return bounded(text, MAX_DETAIL)[0];
}
/** Escaped `text` if it fits MAX_SHOWN code points, else cut as `bounded` (N4). */
function fitted(text: string): readonly [string, boolean] {
  const shown = escape(text);
  return Array.from(shown).length <= MAX_SHOWN
    ? [shown, false]
    : bounded(text, MAX_SHOWN_RAW);
}

/**
 * Text fields bar control and invisible characters; `word` and `ref` also whitespace;
 * `body` allows tab and newlines; `args` only bars NUL. `destination` and `names` bar
 * a leading `-` (an option); `pushRef` is a branch (see `pushBranch`).
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
  "spend.raiseCap": ["amount", { capUsd: "usd" }],
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

/**
 * Always-ask to edit in every target repo: only paths that are Ring 0 in any repository
 * (OQ2, 2026-10-07). A project adds its own Ring 0 paths in its committed
 * `helmwright.config.json` (`permissions.policy.ring0Paths`); helmwright's own source
 * globs are there (B6-5).
 */
const FLOOR_PATHS: NonEmpty<string> = deepFreeze([
  // Q56 eval files; their location is fixed when the behavioral evals land.
  "evals/**",
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
  // default-2 (B6-5): the floor's Ring 0 paths no longer list helmwright's source.
  version: "default-2",
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
/** Nested arrays and objects in a `json` field (SF-3); `canonical` allows one more level. */
const MAX_DEPTH = 64;
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
/** First components that name a ref namespace rather than a branch (case-folded). */
const NOT_BRANCH = new Set(["refs", "tags", "remotes", "heads"]);
/**
 * The ref a push names, as `refs/heads/<name>`: `ref` is `refs/heads/<name>` or a short
 * branch name. Undefined for any other ref namespace (`refs/...`, `tags/`, `remotes/`,
 * `heads/`), git's special-ref form (`^[A-Z_]+$`, such as REBASE_HEAD) and `stash`.
 * Push contract for the B9b handler: it pushes exactly `refs/heads/<name>:refs/heads/<name>`,
 * with `--` before the destination (`git push -- <destination> <refspec>`), never the input.
 */
function pushBranch(ref: unknown): string | undefined {
  if (!isRef(ref)) return undefined;
  const heads = "refs/heads/";
  const name = ref.startsWith(heads) ? ref.slice(heads.length) : ref;
  const first = caseFold(name.split("/")[0] ?? "");
  const special = !name.includes("/") && /^[A-Z_]+$/.test(name);
  if (NOT_BRANCH.has(first) || special || caseFold(name) === "stash") {
    return undefined;
  }
  return heads + name;
}
/** True if `v` nests at most `max` arrays or objects; it never descends past `max`. */
const shallow = (v: unknown, max: number): boolean =>
  typeof v !== "object" ||
  v === null ||
  (max > 0 && Object.values(v).every((item) => shallow(item, max - 1)));
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
      return pushBranch(v) !== undefined;
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
      return v !== undefined && shallow(v, MAX_DEPTH);
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
function decide(
  policy: PermissionPolicy,
  f: Facts,
): { tier: PermissionTier; ruleId: string; reason: string } {
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

/** What `factsFor` derives: the facts, the shown target and a path target's resolved path. */
interface Derived {
  readonly facts: Facts;
  readonly target: PermissionTarget;
  readonly fullTarget: FullTarget | undefined;
  readonly path: string | undefined;
  readonly paths: readonly string[] | undefined;
}

/** git pathspec magic: glob characters, the glob escape, and the `:` magic prefix. */
const hasMagic = (path: string) =>
  path.startsWith(":") || ["*", "?", "[", "\\"].some((c) => path.includes(c));

/**
 * Normalizes the target and derives the facts.
 * @throws PathError if a path cannot be normalized; TypeError on an invalid setting.
 */
function factsFor(
  policy: PermissionPolicy,
  requested: PermissionAction,
  fields: Readonly<Record<string, unknown>>,
  request: Run,
): Derived {
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
  const named = Array.isArray(paths)
    ? (paths as string[]).map((input) => [input, normalize(input)] as const)
    : [];
  // SF-5: what the commit handler stages, so each must be a literal path in the worktree.
  const staged = named.map(([input, p]) => {
    if (p.relative === undefined) {
      throw new PathError(new TypeError(OUTSIDE));
    }
    if (hasMagic(input) || hasMagic(p.relative)) {
      throw new PathError(new TypeError(MAGIC));
    }
    return p.relative === "" ? "." : p.relative;
  });
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
    named.some(([input, p]) => {
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
  // A push shows the ref it pushes.
  const shownRef = requested === "push" ? pushBranch(ref) : ref;
  const raw =
    resolved?.real ??
    (list === undefined
      ? [setting, fields["destination"], shownRef]
          .filter((s) => typeof s === "string")
          .join(" ") || "spend.cap"
      : canonical(list));
  // N5: an argv is cut like a detail; any other value only if it cannot fit (N4).
  const [value, valueCut] =
    list === undefined ? fitted(raw) : bounded(raw, MAX_DETAIL);
  // SF6a: a commit shows what it stages (sorted, so the shown list is canonical).
  const detail =
    requested === "config.set"
      ? canonical(fields["value"])
      : requested === "commit"
        ? canonical([...staged].sort())
        : typeof capUsd === "number"
          ? `${String(capUsd)} USD`
          : typeof body === "string"
            ? body
            : undefined;
  const [shown, cut] =
    detail === undefined ? [undefined, false] : bounded(detail, MAX_DETAIL);
  // B9b-3c: a cut target's full form, for the prompt's view; absent past the bound.
  const wholeValue = cut || valueCut ? whole(raw, MAX_FULL_SHOWN) : undefined;
  const wholeDetail =
    wholeValue === undefined || detail === undefined
      ? undefined
      : whole(detail, MAX_FULL_SHOWN - Array.from(wholeValue).length);
  const fullTarget =
    wholeValue === undefined ||
    (detail !== undefined && wholeDetail === undefined)
      ? undefined
      : {
          value: wholeValue,
          ...(wholeDetail === undefined ? {} : { detail: wholeDetail }),
        };
  return {
    fullTarget,
    path: resolved?.real,
    paths: requested === "commit" ? staged : undefined,
    facts: {
      action: install ? "deps.add" : requested,
      requested,
      inWorktree: requested === "execute" || resolved?.inside === true,
      onRunBranch: ref === runBranch || ref === `refs/heads/${runBranch}`,
      ring0,
    },
    target: {
      kind: ACTIONS[requested][0],
      value,
      ...(shown === undefined ? {} : { detail: shown }),
      ...(cut || valueCut ? { truncated: true } : {}),
    },
  };
}

const OUTSIDE = "path is outside the worktree";
const MAGIC = "path has pathspec magic (*, ?, [, a backslash, a leading :)";
/** normalizePath's own messages and the commit checks', which name no path. */
const PATH_MESSAGES = new Set([
  OUTSIDE,
  MAGIC,
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

const reject = (
  guard: RejectedVerdict["guard"],
  ruleId: string,
  reason: string,
  requestedName: string | undefined,
): RejectedVerdict =>
  deepFreeze({
    kind: "rejected",
    tier: "deny",
    ruleId,
    reason: escape(reason),
    guard,
    ...(requestedName === undefined ? {} : { requestedName }),
  });

/** An action name as shown: cut to 64 code points, escaped, then a marker if cut (N6: reads at most 65). */
const shownName = (action: string): string => bounded(action, 64)[0];

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
  const reserved = ids.find((id) =>
    /^(default|policy|schema|exfiltration)(\.|$)/.test(id),
  );
  return reserved === undefined ? undefined : `rule id ${reserved} is reserved`;
}

/** The schema's pathGlob (permission-policy.schema.json): its pattern, then its `not` pattern. */
const GLOB = /^[A-Za-z0-9._*/-]{1,128}$/;
const NOT_GLOB = /^\/|\/\/|\/$|(?:^|\/)\.\.?(?:\/|$)|\*\*[^/]|[^/]\*\*|\*\*\//;
/** The schema's bound on a glob list. */
const MAX_GLOBS = 1024;
/** Bounds on the Ring 0 link walk (SF-7). */
const MAX_WALK_DEPTH = 64;
const MAX_WALK_ENTRIES = 100_000;
/** Bounded like the schema's lists; each is a valid Ring 0 glob. */
const isGlobs = (v: unknown): v is string[] =>
  Array.isArray(v) &&
  v.length <= MAX_GLOBS &&
  v.every((g) => typeof g === "string" && GLOB.test(g) && !NOT_GLOB.test(g));

/** `given` if `runRing0` issued it (by identity) for this worktree and the policy's Ring 0 paths (SF-1). */
function issuedFor(
  given: unknown,
  worktree: string,
  policy: PermissionPolicy,
): readonly string[] | undefined {
  // A WeakMap lookup runs no Proxy trap and accepts any value.
  const issued = ISSUED.get(given as object);
  if (issued === undefined) return undefined;
  let real: string;
  try {
    real = realpathSync.native(worktree);
  } catch (error) {
    throw new PathError(error);
  }
  const walked = issued.ring0Paths;
  return real === issued.worktreeReal &&
    policy.ring0Paths.every((glob) => walked.includes(glob))
    ? (given as readonly string[])
    : undefined;
}

/** The rule ID of an exfiltration denial; rules may not use the `exfiltration.` prefix. */
export const EXFILTRATION_RULE = "exfiltration.credential";
/** What an exfiltration denial logs and shows in place of the target and detail. */
export const WITHHELD = "[withheld: credential-shaped content]";
/** N6: which actions send data out of the sandbox; guard 1 scans only these. */
export const EGRESS: Readonly<Record<PermissionAction, boolean>> = deepFreeze({
  execute: false,
  "fs.read": false,
  "fs.edit": false,
  "fs.delete": false,
  commit: false,
  "deps.add": false,
  "config.set": false,
  "spend.raiseCap": false,
  push: true,
  "pr.open": true,
  "pr.merge": true,
  comment: true,
  publish: true,
  deploy: true,
});

/**
 * Guard 1's denial. Its reason names only the field and the pattern class, and its
 * target and detail are WITHHELD, so neither the log nor a prompt has the content;
 * `inputSha256` still binds the input.
 */
function withheld(
  requested: PermissionAction,
  fields: Readonly<Record<string, unknown>>,
  found: CredentialFound,
  policyVersion: string,
): EvaluatedVerdict {
  const body = typeof fields["body"] === "string" ? { detail: WITHHELD } : {};
  return deepFreeze({
    kind: "evaluated",
    tier: "deny",
    ruleId: EXFILTRATION_RULE,
    reason: escape(`${found.field} carries ${found.pattern}`),
    action: requested,
    requested,
    guard: "exfiltration",
    policyVersion,
    target: { kind: ACTIONS[requested][0], value: WITHHELD, ...body },
    input: fields,
  });
}

/**
 * Rules on one action call. Guard 1 (exfiltration) first: an egress action whose
 * input carries credential-shaped content is denied. Then the always-ask floor (the policy's set united with the
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
  let name: string | undefined;
  try {
    const { action, input, worktree, runId, extraRing0Paths } = request;
    if (typeof action === "string") name = shownName(action);
    let rules: unknown;
    try {
      rules = snapshot(policy);
    } catch {
      // N7: a policy that is not plain data is a policy failure, with fixed text.
      return reject("policy", "policy.invalid", "policy is not JSON", name);
    }
    const problem = policyProblem(rules);
    if (problem !== undefined) {
      return reject("policy", "policy.invalid", problem, name);
    }
    // policyProblem validated it.
    const checked = rules as PermissionPolicy;
    if (typeof action !== "string" || !Object.hasOwn(ACTIONS, action)) {
      return reject("schema", "schema.unknown-action", "unknown action", name);
    }
    requested = action as PermissionAction;
    const why = `invalid input for ${requested}`;
    if (typeof worktree !== "string") {
      return reject("schema", "schema.invalid-input", why, name);
    }
    // SF-1: checked by identity before anything is read from it.
    const extra = issuedFor(extraRing0Paths, worktree, checked);
    if (extra === undefined) {
      const stale = `extraRing0Paths for ${requested} is not runRing0 of this worktree and policy`;
      return reject("schema", "schema.invalid-input", stale, name);
    }
    const fields = parseInput(ACTIONS[requested][1], snapshot(input));
    if (
      fields === undefined ||
      typeof runId !== "string" ||
      !RUN_ID.test(runId)
    ) {
      return reject("schema", "schema.invalid-input", why, name);
    }
    // Guard 1: credential-shaped content in an egress action denies, never asks.
    const found = EGRESS[requested] ? credentialIn(fields) : undefined;
    if (found !== undefined) {
      return withheld(requested, fields, found, checked.version);
    }
    const run = { worktree, runId, extraRing0Paths: extra };
    const derived = factsFor(checked, requested, fields, run);
    const { facts, target, fullTarget, path, paths } = derived;
    const { tier, ruleId, reason } = decide(checked, facts);
    // N1: frozen through, so no caller can change what was ruled on.
    return deepFreeze({
      kind: "evaluated",
      tier,
      ruleId,
      reason: escape(reason),
      action: facts.action,
      requested,
      guard: "policy",
      policyVersion: checked.version,
      target,
      ...(fullTarget === undefined ? {} : { fullTarget }),
      ...(path === undefined ? {} : { path }),
      ...(paths === undefined ? {} : { paths }),
      input: fields,
    });
  } catch (error) {
    // Fail closed with fixed text: a thrown value is never converted or inspected,
    // except our own PathError, which is recognized by identity.
    const action = requested ?? "request";
    if (typeof error === "object" && error !== null && pathErrors.has(error)) {
      const { message } = error as PathError;
      const why = message === "" ? "" : `: ${message}`;
      const reason = `${action} path rejected${why}`;
      return reject("schema", "schema.invalid-input", reason, name);
    }
    const reason = `invalid input for ${action}`;
    return reject("schema", "schema.invalid-input", reason, name);
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

/** What JSON.stringify leaves out of an object and writes as null in an array. */
const skipped = (v: unknown) =>
  v === undefined || typeof v === "function" || typeof v === "symbol";
/**
 * Canonical JSON in the style of RFC 8785 (JCS), so equal values compare and hash equal:
 * no whitespace, object keys sorted by UTF-16 code units (integer-like keys too), strings
 * and numbers as JSON.stringify writes them. `depth` is the nesting so far.
 * @throws TypeError if `value` is not JSON; RangeError past 65 nested arrays and objects.
 */
export function canonical(value: unknown, depth = 0): string {
  if (typeof value !== "object" || value === null) {
    const text = JSON.stringify(value) as string | undefined;
    if (text === undefined) throw new TypeError("value is not JSON");
    return text;
  }
  if (depth > MAX_DEPTH) throw new RangeError("value nests too deep");
  const next = (v: unknown) => (skipped(v) ? "null" : canonical(v, depth + 1));
  if (Array.isArray(value))
    return "[" + Array.from(value, next).join(",") + "]";
  const members = Object.entries(value)
    .filter(([, v]) => !skipped(v))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, v]) => JSON.stringify(key) + ":" + next(v));
  return "{" + members.join(",") + "}";
}

/**
 * Resolves `relative` from `root` with `walkPath`: the worktree-relative paths of the
 * links met (each link in a chain and each symlinked directory along the way, even if
 * the last hop leaves the worktree), and the final path reached.
 * @throws TypeError past 40 links or on `..` after a missing component; an fs error.
 */
function linksOnTheWay(
  root: string,
  relative: string,
): { links: string[]; final: string } {
  const walked = walkPath(root, relative.split("/"), root);
  if (walked === undefined) throw new TypeError("link does not resolve");
  const links = walked.links
    .filter((link) => link !== root && contains(root, link))
    .map((link) => posix.relative(root, link));
  return { links, final: walked.final };
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
 * Targets are resolved one component at a time, as the kernel does; an absolute target
 * under `/workspace` is in the worktree.
 * @throws on an fs error, over 40 links, `..` after a missing component; RangeError on a
 * target name that is not a valid Ring 0 glob, over 1024 globs, or a walk over 64 deep
 * or 100000 entries. Refuse the run then.
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
  let entries = 0;
  const walk = (dir: string, depth: number) => {
    if (depth > MAX_WALK_DEPTH) {
      throw new RangeError("Ring 0 walk is deeper than 64 directories");
    }
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      if ((entries += 1) > MAX_WALK_ENTRIES) {
        throw new RangeError("Ring 0 walk has over 100000 entries");
      }
      const relative = dir === "" ? entry.name : `${dir}/${entry.name}`;
      if (entry.isSymbolicLink() && isRing0Path(relative, prefixes)) {
        const { links, final } = linksOnTheWay(root, relative);
        if (contains(root, final)) {
          const target = posix.relative(root, final);
          found.add(target === "" ? "**" : `${target}/**`);
        }
        for (const link of links) {
          if (link !== relative) found.add(`${link}/**`);
        }
        if (found.size > MAX_GLOBS) {
          throw new RangeError("Ring 0 links have over 1024 targets");
        }
      } else if (entry.isDirectory() && isRing0Path(relative, prefixes)) {
        walk(relative, depth + 1);
      }
    }
  };
  walk("", 0);
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

/**
 * N4: an fs error as its code and its escaped worktree-relative path, never its raw
 * message or a host path. Other errors pass through (their messages are fixed or escaped).
 */
function fsFailure(error: unknown, worktreeReal: string): unknown {
  const fields = error as { code?: unknown; path?: unknown } | null;
  if (!(error instanceof Error) || typeof fields?.code !== "string") {
    return error;
  }
  const { path } = fields;
  const where =
    typeof path !== "string"
      ? ""
      : contains(worktreeReal, path)
        ? " at " + (bounded(posix.relative(worktreeReal, path), 256)[0] || ".")
        : " outside the worktree";
  return new Error(escape(fields.code) + where, { cause: error });
}

/**
 * The run's extra Ring 0 globs (SF3): `ring0LinkTargets` of the worktree for the
 * policy's Ring 0 paths united with the floor, recorded for `evaluate` (SF-1). Call it
 * at run start.
 * @throws TypeError on an invalid policy, or one that throws when read; as
 * `ring0LinkTargets` otherwise, but an fs error as `fsFailure` (N4).
 */
export function runRing0(worktree: string, policy: PermissionPolicy): RunRing0 {
  let ring0Paths: readonly string[];
  try {
    const checked = snapshot(policy);
    if (policyProblem(checked) !== undefined) throw new TypeError();
    const own = (checked as PermissionPolicy).ring0Paths;
    ring0Paths = deepFreeze(union(own, FLOOR_PATHS));
  } catch {
    throw new TypeError("invalid permission policy");
  }
  let worktreeReal = worktree;
  let targets: string[];
  try {
    worktreeReal = realpathSync.native(worktree);
    targets = ring0LinkTargets(worktreeReal, ring0Paths);
  } catch (error) {
    throw fsFailure(error, worktreeReal);
  }
  const issued = deepFreeze(targets);
  ISSUED.set(issued, { worktreeReal, ring0Paths });
  return issued as readonly string[] as RunRing0;
}
