import { createHash } from "node:crypto";
import type {
  HelmwrightConfig,
  IntakeClass,
  IntakeFriction,
  IntakeReason,
  IntakeRule,
  IntakeSurfaceChange,
} from "@helmwright/schema";
import {
  INVISIBLE,
  caseFold,
  hasControl,
  isRing0Path,
} from "../permission/normalize.ts";
import { canonical, deepFreeze, displayText } from "../permission/policy.ts";

/**
 * The intake rubric (03 Intake, Q52; owner answers OQ-B10-2/3, 2026-10-07). Intake is a
 * Ring 0 step: it is deterministic and reads only its input (no tree inspection until the
 * M2 detectors, Q44). A change to its rules or categories needs a new version.
 */
export const INTAKE_RUBRIC_VERSION = "intake-rubric-1";

/** The rubric's input. `classify` checks it at run time because it comes from a task file. */
export interface IntakeInput {
  /** Repo-relative paths or globs: `*` within one segment, a whole `**` segment for any number of segments. */
  readonly scope?: readonly string[];
  readonly declared: {
    readonly newDependencies: readonly string[];
    readonly newModules: readonly string[];
    readonly surfaceChanges: readonly IntakeSurfaceChange[];
    readonly newProcessBoundary: boolean;
  };
  /** The resolved policy's Ring 0 paths and the floor. */
  readonly ring0Paths: readonly string[];
  readonly friction: Required<NonNullable<HelmwrightConfig["friction"]>>;
}

export interface IntakeResult {
  readonly class: IntakeClass;
  readonly rubricVersion: string;
  readonly reasons: readonly Readonly<IntakeReason>[];
  readonly friction: Readonly<IntakeFriction>;
  readonly sparring: "optIn";
  /** SHA-256 of the canonical JSON of the sorted unique scope, or of `[]` when none was declared. */
  readonly scopeSha256: string;
  /** SHA-256 of the canonical JSON of the sorted unique Ring 0 paths the class was computed with. */
  readonly ring0Sha256: string;
}

/** Invalid intake input or a reclassification that is not upward. The message is escaped for display. */
export class IntakeError extends Error {
  override name = "IntakeError";
}

const RANK = ["chore", "bounded", "architectural"] as const;
const SURFACES = ["schema", "publicApi", "storage", "wire"] as const;
const INTENSITIES = ["moderate", "minimal", "low", "high"] as const;
const MAX_SCOPE = 256;
const MAX_ENTRY = 1024;

/**
 * Scope dialect (S1): `*` matches within one segment and a whole `**` segment matches any
 * number of segments; nothing else is special. An entry with another glob metacharacter
 * (`! ? [ ] { } ( ) @ +`) or a segment that starts with `-`, `~` or `$` is rejected, so no
 * other glob dialect or shell can read it more widely. Any future scope enforcer (the M2
 * out-of-scope detector) must match with this module, not another glob library.
 *
 * Matching contract (S2): an entry whose last segment names files (`*.md`, `*.test.ts`,
 * `x.md`) matches those names only, with nothing below them. An entry that ends in `**`
 * (`docs/**`, `x/test/**`) matches everything below it, so it is in no category: something
 * below it may always be a build file or an instruction file. The Ring 0 check treats every
 * entry as covering everything below it.
 */
const META = /[!?[\]{}()@+]/;
const LEADING = /^[-~$]/;

/**
 * The chore categories of intake-rubric-1 (OQ-B10-3; tightened fail-safe by the coordinator
 * 2026-10-07). An entry is in a category only if every path it can match is. Category names
 * compare exactly, so `README.MD` and `Docs/` are in none; exclusions compare case-folded.
 * Excluded from both: names that may be AGENTS.md or CLAUDE.md, and paths that may be under
 * a `.claude` or `.changeset` directory at any depth.
 * Docs: Markdown (`.md`) anywhere; any file below a top-level `docs/` directory except build
 * and config files (DOCS_BUILD). Not `.mdx` (executable at build) or `.txt` (requirements.txt
 * and CMakeLists.txt are build inputs).
 * Tests: any file below a `test`, `tests` or `__tests__` directory except setup and config
 * files (TEST_SETUP); a name with `.test.` or `.spec.` that ends in a code extension.
 * Protected tests and eval paths are Ring 0 paths, so they are at least bounded (Q52).
 */
const INSTRUCTIONS = ["agents.md", "claude.md"];
const TOOL_DIRS = [".claude", ".changeset"];
const DOCS_BUILD = [
  "py",
  "js",
  "ts",
  "mjs",
  "cjs",
  "json",
  "yml",
  "yaml",
  "toml",
  "mdx",
]
  .map((ext) => `*.${ext}`)
  .concat(["makefile", "cname"]);
const TEST_DIRS = new Set(["test", "tests", "__tests__"]);
const TEST_MARKS = [".test.", ".spec."];
const CODE = ["ts", "tsx", "js", "jsx", "mjs", "cjs", "py"];
const TEST_SETUP = [
  "conftest.py",
  "setup.*",
  "vitest.config.*",
  "jest.config.*",
  "playwright.config.*",
];

const show = (text: string) => `"${displayText(text)}"`;
const fail = (message: string): never => {
  throw new IntakeError(message);
};

/** `value` as a plain object with only `keys`. */
function record(value: unknown, keys: string[], name: string) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(`${name} must be an object`);
  }
  const extra = Object.keys(value).find((key) => !keys.includes(key));
  if (extra !== undefined) fail(`${name} has the unknown key ${show(extra)}`);
  return value as Record<string, unknown>;
}

/**
 * An array of NFC strings of 1 to MAX_ENTRY code units without control or invisible
 * characters. Holes read as undefined, so a sparse array is rejected (N1).
 */
function texts(value: unknown, name: string, max = 1024): string[] {
  if (!Array.isArray(value) || value.length > max) {
    return fail(`${name} must be an array of at most ${String(max)} entries`);
  }
  return Array.from(value as unknown[], (item, i) => {
    const at = `${name}[${String(i)}]`;
    if (typeof item !== "string" || item === "" || item.length > MAX_ENTRY) {
      return fail(`${at} must be a string of 1 to 1024 characters`);
    }
    if (hasControl(item) || INVISIBLE.test(item)) {
      fail(`${at} ${show(item)} has a control or invisible character`);
    }
    if (item.normalize("NFC") !== item) fail(`${at} ${show(item)} must be NFC`);
    return item;
  });
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  name: string,
): T {
  const found = allowed.find((item) => item === value);
  return found ?? fail(`${name} must be one of ${allowed.join(", ")}`);
}

/** A scope entry: canonical and repo-relative, in the scope dialect, without a `.git` segment. */
function checkEntry(entry: string, i: number): string {
  const at = `intake.scope[${String(i)}] ${show(entry)}`;
  const segments = entry.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) {
    fail(`${at} must be relative, without empty, . or .. segments`);
  }
  if (entry.includes("\\")) fail(`${at} must not have a backslash`);
  if (segments.some((s) => s !== "**" && s.includes("**"))) {
    fail(`${at} may use ** only as a whole segment`);
  }
  if (META.test(entry) || segments.some((s) => LEADING.test(s))) {
    fail(`${at} may use only * and ** as glob syntax`);
  }
  if (segments.some((s) => caseFold(s) === ".git")) {
    fail(`${at} must not have a .git segment`);
  }
  return entry;
}

function parse(value: unknown): IntakeInput {
  const keys = ["scope", "declared", "ring0Paths", "friction"];
  const input = record(value, keys, "intake");
  const facts = ["newDependencies", "newModules", "surfaceChanges"];
  const d = record(
    input["declared"],
    [...facts, "newProcessBoundary"],
    "intake.declared",
  );
  const f = record(
    input["friction"],
    ["defaultIntensity", "choreDowngrade"],
    "intake.friction",
  );
  const boundary = d["newProcessBoundary"];
  if (typeof boundary !== "boolean") {
    fail("intake.declared.newProcessBoundary must be a boolean");
  }
  const ring0Paths = texts(input["ring0Paths"], "intake.ring0Paths");
  if (ring0Paths.length === 0) fail("intake.ring0Paths must not be empty");
  const surfaces = "intake.declared.surfaceChanges";
  return {
    ...(input["scope"] === undefined
      ? {}
      : {
          scope: texts(input["scope"], "intake.scope", MAX_SCOPE).map(
            checkEntry,
          ),
        }),
    declared: {
      newDependencies: texts(
        d["newDependencies"],
        "intake.declared.newDependencies",
      ),
      newModules: texts(d["newModules"], "intake.declared.newModules"),
      surfaceChanges: texts(d["surfaceChanges"], surfaces).map((s) =>
        oneOf(s, SURFACES, surfaces),
      ),
      newProcessBoundary: boundary === true,
    },
    ring0Paths,
    friction: {
      defaultIntensity: oneOf(
        f["defaultIntensity"],
        INTENSITIES,
        "intake.friction.defaultIntensity",
      ),
      choreDowngrade: oneOf(
        f["choreDowngrade"],
        ["on", "off"],
        "intake.friction.choreDowngrade",
      ),
    },
  };
}

/** Whether `text` matches a segment pattern whose only wildcard is `*`, in linear time. */
function segmentMatches(pattern: string, text: string): boolean {
  let [p, t, star, mark] = [0, 0, -1, 0];
  while (t < text.length) {
    if (pattern[p] === "*") [star, mark] = [p++, t];
    else if (p < pattern.length && pattern[p] === text[t])
      [p, t] = [p + 1, t + 1];
    else if (star !== -1) [p, t] = [star + 1, ++mark];
    else return false;
  }
  while (pattern[p] === "*") p++;
  return p === pattern.length;
}

/** The literal text after a segment pattern's last `*`: every name it matches ends with it. */
const tail = (segment: string) => segment.slice(segment.lastIndexOf("*") + 1);
const head = (segment: string) => segment.slice(0, segment.indexOf("*"));

/**
 * Whether two `*` segment patterns match a common name. With a `*` in each, they do exactly
 * when their literal heads and tails are compatible: the middle literals fit between stars.
 */
function segmentsOverlap(a: string, b: string): boolean {
  if (!a.includes("*")) return segmentMatches(b, a);
  if (!b.includes("*")) return segmentMatches(a, b);
  const [a0, b0, a1, b1] = [head(a), head(b), tail(a), tail(b)];
  return (
    (a0.startsWith(b0) || b0.startsWith(a0)) &&
    (a1.endsWith(b1) || b1.endsWith(a1))
  );
}

/**
 * Whether two globs can match a common path, where a `**` segment matches any number of
 * segments. This over-matches the permission layer's globs (its `**` only ends a pattern),
 * which is the safe direction. Memoized, so at most one visit per segment pair.
 */
function globsOverlap(a: readonly string[], b: readonly string[]): boolean {
  const seen = new Set<number>();
  const visit = (i: number, j: number): boolean => {
    const key = i * (b.length + 1) + j;
    if (seen.has(key)) return false;
    seen.add(key);
    const [x, y] = [a[i], b[j]];
    if (x === undefined && y === undefined) return true;
    if (x === "**")
      return visit(i + 1, j) || (y !== undefined && visit(i, j + 1));
    if (y === "**")
      return visit(i, j + 1) || (x !== undefined && visit(i + 1, j));
    return (
      x !== undefined &&
      y !== undefined &&
      segmentsOverlap(x, y) &&
      visit(i + 1, j + 1)
    );
  };
  return visit(0, 0);
}

/**
 * Whether an entry is, or may cover, a Ring 0 path: the permission layer's matcher on a
 * literal entry, then an overlap check of the entry and everything below it (it may be a
 * directory) against each glob, both case-folded as the permission layer does.
 */
function touchesRing0(entry: string, globs: readonly string[]): boolean {
  if (!entry.includes("*") && isRing0Path(entry, globs)) return true;
  const below = [...caseFold(entry).split("/"), "**"];
  return globs.some((glob) => globsOverlap(below, caseFold(glob).split("/")));
}

/** Whether a segment pattern may match one of `names` (lowercase patterns), case-folded. */
const mayBe = (segment: string, names: readonly string[]) =>
  names.some((name) => segmentsOverlap(caseFold(segment), name));

/** Whether an entry may match a path outside every category, whatever its category. */
function excluded(segments: readonly string[]): boolean {
  const last = segments.at(-1) ?? "**";
  const folded = segments.map(caseFold);
  return (
    last === "**" ||
    mayBe(last, INSTRUCTIONS) ||
    TOOL_DIRS.some((dir) => globsOverlap(folded, ["**", dir, "**"]))
  );
}

function isDocs(entry: string): boolean {
  const segments = entry.split("/");
  const last = segments.at(-1) ?? "**";
  if (excluded(segments)) return false;
  if (segments.length > 1 && segments[0] === "docs") {
    return !mayBe(last, DOCS_BUILD);
  }
  return tail(last).endsWith(".md");
}

function isTests(entry: string): boolean {
  const segments = entry.split("/");
  const last = segments.at(-1) ?? "**";
  if (excluded(segments)) return false;
  if (segments.slice(0, -1).some((s) => TEST_DIRS.has(s))) {
    if (!mayBe(last, TEST_SETUP)) return true;
  }
  // A literal chunk between stars is in every name the pattern matches.
  const marked = last
    .split("*")
    .some((chunk) => TEST_MARKS.some((m) => chunk.includes(m)));
  return marked && CODE.some((ext) => tail(last).endsWith(`.${ext}`));
}

/** A reason for each rule whose entries are given (`true` for a rule without entries). */
function reasons(
  fired: [IntakeRule, readonly string[] | boolean][],
): IntakeReason[] {
  return fired
    .filter(([, on]) => (Array.isArray(on) ? on.length > 0 : on === true))
    .map(([rule, on]) => ({
      rule,
      entries: Array.isArray(on) ? on.map(displayText) : [],
    }));
}

/**
 * Classifies a task (intake-rubric-1), rules in order: (1) no declared scope and (2) each
 * declared fact give architectural; (3) chore if every entry is docs-only or tests-only and
 * none is or may cover a Ring 0 path; (4) bounded otherwise. Pure and deterministic; the
 * result is deeply frozen and independent of the scope's order.
 * @throws IntakeError on invalid input.
 */
export function classify(value: unknown): IntakeResult {
  const input = parse(value);
  // N7: duplicates do not change the class or the hashes.
  const scope = [...new Set(input.scope)].sort();
  const ring0 = [...new Set(input.ring0Paths)].sort();
  const d = input.declared;
  let cls: IntakeClass = "architectural";
  let why = reasons([
    ["noDeclaredScope", scope.length === 0],
    ["newDependencies", d.newDependencies],
    ["newModules", d.newModules],
    ["surfaceChanges", d.surfaceChanges],
    ["newProcessBoundary", d.newProcessBoundary],
  ]);
  if (why.length === 0) {
    const hits = scope.filter((e) => touchesRing0(e, ring0));
    const docs = scope.filter(isDocs);
    const tests = scope.filter((e) => !isDocs(e) && isTests(e));
    const other = scope.filter((e) => !isDocs(e) && !isTests(e));
    cls = hits.length > 0 || other.length > 0 ? "bounded" : "chore";
    why =
      cls === "chore"
        ? reasons([
            ["docsOnly", docs],
            ["testsOnly", tests],
          ])
        : reasons([
            ["ring0Path", hits],
            ["notDocsOrTests", other],
          ]);
  }
  const downgrade = cls === "chore" && input.friction.choreDowngrade === "on";
  return deepFreeze({
    class: cls,
    rubricVersion: INTAKE_RUBRIC_VERSION,
    reasons: why,
    friction: downgrade
      ? { intensity: "minimal", source: "choreDowngrade" }
      : { intensity: input.friction.defaultIntensity, source: "default" },
    sparring: "optIn",
    scopeSha256: sha256(canonical(scope)),
    ring0Sha256: sha256(canonical(ring0)),
  });
}

const sha256 = (text: string) =>
  createHash("sha256").update(text).digest("hex");

/** @throws IntakeError, not TypeError, for a value that is not a class (N2). */
function rank(cls: unknown): number {
  const found = RANK.findIndex((known) => known === cls);
  if (found >= 0) return found;
  return fail(
    typeof cls === "string"
      ? `unknown intake class ${show(cls)}`
      : "an intake class must be a string",
  );
}

/** Whether moving from `from` to `to` lowers, raises or keeps the class. */
export function overrideDirection(
  from: IntakeClass,
  to: IntakeClass,
): "down" | "up" | "same" {
  const [a, b] = [rank(from), rank(to)];
  return b < a ? "down" : b > a ? "up" : "same";
}

/**
 * The harness may only reclassify upward (Q52), so a reclassification must raise the class
 * strictly: returns `to` if it ranks above `from`. It replaces a `≥` guard, which had no
 * caller; an owner override in either direction goes through overrideDirection instead.
 * @throws IntakeError if `to` does not rank above `from`, or on an unknown class.
 */
export function reclassifyUp(from: IntakeClass, to: IntakeClass): IntakeClass {
  if (overrideDirection(from, to) !== "up") {
    fail(
      `the harness may only reclassify up, not ${show(from)} to ${show(to)}`,
    );
  }
  return to;
}
