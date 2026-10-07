import { lstatSync, realpathSync } from "node:fs";
import { join, posix, resolve } from "node:path";
import {
  validatePermissionPolicy,
  type PermissionAction,
  type PermissionPolicy,
  type PermissionRule,
  type PermissionTier,
} from "@helmwright/schema";
import {
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

/** One action call to rule on. `action` and `input` are untrusted. */
export interface PermissionRequest {
  readonly action: string;
  readonly input: unknown;
  /** Host path of the run's worktree, mounted at /workspace in the sandbox. */
  readonly worktree: string;
  readonly runId: string;
}

export interface PermissionTarget {
  readonly kind: "path" | "ref" | "remote" | "setting" | "argv";
  /** Normalized: a path is its resolved host path. */
  readonly value: string;
}

export interface PermissionVerdict {
  readonly tier: PermissionTier;
  readonly ruleId: string;
  readonly reason: string;
  /** Absent when the policy, action or input was invalid. */
  readonly target?: PermissionTarget;
}

/** `text` has no control characters, `body` allows tab and newlines, `args` only bars NUL. */
type Field = "text" | "texts" | "args" | "body" | "number" | "json";
type Spec = readonly [
  PermissionTarget["kind"],
  Readonly<Record<string, Field>>,
];

const egress = { destination: "text", ref: "text" } as const;
/** Every typed action: its target kind and its exact input fields (Q6). */
const ACTIONS: Readonly<Record<PermissionAction, Spec>> = {
  execute: ["argv", { argv: "args" }],
  "fs.read": ["path", { path: "text" }],
  "fs.edit": ["path", { path: "text" }],
  "fs.delete": ["path", { path: "text" }],
  commit: ["ref", { ref: "text", paths: "texts" }],
  "deps.add": ["argv", { packages: "texts" }],
  "config.set": ["setting", { setting: "text", value: "json" }],
  "spend.raiseCap": ["setting", { capUsd: "number" }],
  push: ["remote", egress],
  "pr.open": ["remote", egress],
  "pr.merge": ["remote", egress],
  comment: ["remote", { destination: "text", body: "body" }],
  publish: ["remote", { destination: "text" }],
  deploy: ["remote", { destination: "text" }],
};

/** Typed actions without an M1 handler; they exist so the policy can rule on them (Q6). */
export const PERMISSION_ONLY_ACTIONS = (
  Object.keys(ACTIONS) as PermissionAction[]
).filter((action) => action !== "execute");

/** The schema's lists are non-empty, so these are built as non-empty literals. */
type NonEmpty<T> = readonly [T, ...T[]];

/** Q51 and the owner's B9 decisions (2026-10-06): always ask, in every governance mode. */
export const ALWAYS_ASK_ACTIONS: NonEmpty<PermissionAction> = [
  "push",
  "pr.open",
  "pr.merge",
  "comment",
  "publish",
  "deploy",
  "spend.raiseCap",
];

/** Always-ask to edit in every target repo until B6 makes the set per-project. */
export const RING0_PATHS: NonEmpty<string> = [
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
];

/** The Ring 0 settings of design 08, every permissions setting (owner, 2026-10-06), and the spend cap (Q51). */
export const RING0_SETTINGS: NonEmpty<string> = [
  "intake.classification",
  "permissions",
  "harnessLoop.selfImprovementModel",
  "harnessLoop.codeEvolution",
  "harnessLoop.evalMix",
  "security.sensorSet",
  "ontology.objectModel",
  "spend.cap",
];

const rule = (
  id: string,
  action: PermissionAction,
  scope: PermissionRule["scope"],
  tier: PermissionTier,
): PermissionRule => ({ id, action, scope, tier });

/** B9 initial policy. Deletes outside the worktree and Ring 0 edits are in the always-ask floor. */
export const DEFAULT_PERMISSION_POLICY: PermissionPolicy = {
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
  alwaysAsk: [...ALWAYS_ASK_ACTIONS],
  ring0Paths: [...RING0_PATHS],
  ring0Settings: [...RING0_SETTINGS],
};

/** Strictness order: an override may only move a decision rightwards. */
const RANK: readonly PermissionTier[] = ["allow", "ask", "alwaysAsk", "deny"];
const MAX_TEXT = 4096;
const MAX_BODY = 65_536;
const SETTING = /^[a-z][A-Za-z0-9]*(?:\.[a-z][A-Za-z0-9]*)*$/;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

const isText = (v: unknown, max: number): v is string =>
  typeof v === "string" && v !== "" && v.length <= max;
const isPlain = (v: unknown) => isText(v, MAX_TEXT) && !hasControl(v);
const isList = (v: unknown, item: (x: unknown) => boolean) =>
  Array.isArray(v) && v.length > 0 && v.length <= 1024 && v.every(item);
const FIELDS: Readonly<Record<Field, (v: unknown) => boolean>> = {
  text: isPlain,
  texts: (v) => isList(v, isPlain),
  args: (v) => isList(v, (x) => isText(x, MAX_BODY) && !x.includes("\0")),
  body: (v) => isText(v, MAX_BODY) && !hasControl(v, "\t\n\r"),
  number: (v) => typeof v === "number" && Number.isFinite(v) && v > 0,
  json: (v) => v !== undefined,
};

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
      return kind !== undefined && FIELDS[kind](record[key]);
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
  const alwaysAsk = union(policy.alwaysAsk, ALWAYS_ASK_ACTIONS);
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

/**
 * Normalizes the target and derives the facts.
 * @throws PathError if a path cannot be normalized; TypeError on an invalid setting.
 */
function factsFor(
  policy: PermissionPolicy,
  requested: PermissionAction,
  fields: Readonly<Record<string, unknown>>,
  request: PermissionRequest,
): { facts: Facts; target: PermissionTarget } {
  const { argv, path, paths, setting, ref } = fields;
  const ring0Paths = union(policy.ring0Paths, RING0_PATHS);
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
  if (
    requested !== "fs.read" &&
    typeof path === "string" &&
    resolved !== undefined &&
    isRing0Write(path, resolved)
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
    if (setting.length > 128 || !SETTING.test(setting)) {
      throw new TypeError("invalid setting name");
    }
    const folded = caseFold(setting);
    // A parent or child of a Ring 0 setting changes it too.
    const overlaps = (s: string) =>
      folded === s || folded.startsWith(s + ".") || s.startsWith(folded + ".");
    if (
      union(policy.ring0Settings, RING0_SETTINGS).map(caseFold).some(overlaps)
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
  return {
    facts: {
      action: install ? "deps.add" : requested,
      requested,
      inWorktree: requested === "execute" || resolved?.inside === true,
      onRunBranch: ref === runBranch || ref === `refs/heads/${runBranch}`,
      ring0,
    },
    target: { kind: ACTIONS[requested][0], value: value || "spend.cap" },
  };
}

/** normalizePath threw. The reason keeps only our own message or an fs error code. */
class PathError extends Error {
  constructor(cause: unknown) {
    const code: unknown =
      cause instanceof Error && "code" in cause ? cause.code : undefined;
    super(
      cause instanceof TypeError
        ? cause.message
        : typeof code === "string"
          ? code
          : "unexpected error",
    );
  }
}

const deny = (ruleId: string, reason: string): PermissionVerdict => ({
  tier: "deny",
  ruleId,
  reason,
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

/**
 * Rules on one action call. The always-ask floor (the policy's set united with the
 * built-in one, deletes outside the worktree, Ring 0 paths and settings) comes first
 * in every governance mode; then the first matching rule; no match asks. An unknown
 * action, invalid input or invalid policy is denied. Never throws.
 */
export function evaluate(
  policy: PermissionPolicy,
  request: PermissionRequest,
): PermissionVerdict {
  const problem = policyProblem(policy);
  if (problem !== undefined) return deny("policy.invalid", problem);
  const action: unknown = request.action;
  if (typeof action !== "string" || !Object.hasOwn(ACTIONS, action)) {
    const name = typeof action === "string" ? action.slice(0, 64) : "";
    return deny(
      "schema.unknown-action",
      `unknown action ${JSON.stringify(name)}`,
    );
  }
  const requested = action as PermissionAction;
  const fields = parseInput(ACTIONS[requested][1], request.input);
  const invalid = `invalid input for ${requested}`;
  if (fields === undefined || !RUN_ID.test(request.runId)) {
    return deny("schema.invalid-input", invalid);
  }
  try {
    const { facts, target } = factsFor(policy, requested, fields, request);
    return { ...decide(policy, facts), target };
  } catch (error) {
    // Fail closed: a path that cannot be normalized (even an fs error) is denied.
    if (error instanceof PathError) {
      return deny(
        "schema.invalid-input",
        `${requested} path rejected: ${error.message}`,
      );
    }
    const why = error instanceof Error ? error.message : String(error);
    return deny("schema.invalid-input", `${invalid}: ${why}`);
  }
}

/**
 * Validates `override` (a whole PermissionPolicy) and returns it if it is at least
 * as strict as `base`: it may add to and tighten the rules and the always-ask,
 * Ring 0 path and Ring 0 setting sets, but never remove from or relax them.
 * @throws TypeError if either policy is invalid; RangeError on a relaxation.
 */
export function resolvePolicy(
  base: PermissionPolicy,
  override: unknown,
): PermissionPolicy {
  const problem = policyProblem(base) ?? policyProblem(override);
  if (problem !== undefined || !validatePermissionPolicy(override)) {
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
  return structuredClone(override);
}
