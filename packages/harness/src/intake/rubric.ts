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
  /** SHA-256 of the canonical JSON of the sorted scope, or of `[]` when none was declared. */
  readonly scopeSha256: string;
}

/** Invalid intake input or a downward reclassification. The message is escaped for display. */
export class IntakeError extends Error {
  override name = "IntakeError";
}

const RANK = ["chore", "bounded", "architectural"] as const;
const SURFACES = ["schema", "publicApi", "storage", "wire"] as const;
const INTENSITIES = ["moderate", "minimal", "low", "high"] as const;
const MAX_SCOPE = 256;
const MAX_ENTRY = 1024;

/**
 * The chore categories of intake-rubric-1 (OQ-B10-3). Names compare exactly, so `README.MD`
 * and `Docs/` are in none: missing a chore is the safe direction.
 * Docs: below a top-level `docs/` directory; Markdown (`.md`, `.mdx`) anywhere. Not `.txt`,
 * since requirements.txt and CMakeLists.txt are build inputs.
 * Tests: below a `test`, `tests` or `__tests__` directory at any depth; a name with `.test.`
 * or `.spec.`. A bare `docs` or `test` entry may be a file, so it is in neither.
 * Protected tests and eval paths are Ring 0 paths, so they are at least bounded (Q52).
 */
const DOCS_SUFFIXES = [".md", ".mdx"];
const TEST_DIRS = new Set(["test", "tests", "__tests__"]);
const TEST_MARKS = [".test.", ".spec."];

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

/** An array of non-empty strings of at most MAX_ENTRY code units, without control or invisible characters. */
function texts(value: unknown, name: string, max = 1024): string[] {
  if (!Array.isArray(value) || value.length > max) {
    return fail(`${name} must be an array of at most ${String(max)} entries`);
  }
  return (value as unknown[]).map((item, i) => {
    const at = `${name}[${String(i)}]`;
    if (typeof item !== "string" || item === "" || item.length > MAX_ENTRY) {
      return fail(`${at} must be a string of 1 to 1024 characters`);
    }
    if (hasControl(item) || INVISIBLE.test(item)) {
      fail(`${at} ${show(item)} has a control or invisible character`);
    }
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

/** A scope entry: canonical and repo-relative, no backslash, `**` only as a whole segment. */
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

function isDocs(entry: string): boolean {
  const segments = entry.split("/");
  const last = segments.at(-1) ?? "**";
  if (segments.length > 1 && segments[0] === "docs") return true;
  return last !== "**" && DOCS_SUFFIXES.some((s) => tail(last).endsWith(s));
}

function isTests(entry: string): boolean {
  const segments = entry.split("/");
  const last = segments.pop() ?? "**";
  if (segments.some((s) => TEST_DIRS.has(s))) return true;
  // A literal chunk between stars is in every name the pattern matches.
  const chunks = last === "**" ? [] : last.split("*");
  return chunks.some((chunk) => TEST_MARKS.some((m) => chunk.includes(m)));
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
  const scope = [...(input.scope ?? [])].sort();
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
    const ring0 = scope.filter((e) => touchesRing0(e, input.ring0Paths));
    const docs = scope.filter(isDocs);
    const tests = scope.filter((e) => !isDocs(e) && isTests(e));
    const other = scope.filter((e) => !isDocs(e) && !isTests(e));
    cls = ring0.length > 0 || other.length > 0 ? "bounded" : "chore";
    why =
      cls === "chore"
        ? reasons([
            ["docsOnly", docs],
            ["testsOnly", tests],
          ])
        : reasons([
            ["ring0Path", ring0],
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
    scopeSha256: createHash("sha256").update(canonical(scope)).digest("hex"),
  });
}

function rank(cls: IntakeClass): number {
  const found = RANK.indexOf(cls);
  return found >= 0 ? found : fail(`unknown intake class ${show(cls)}`);
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
 * The harness may only reclassify upward (Q52): returns `to` if it ranks at least `from`.
 * @throws IntakeError on a downward move or an unknown class.
 */
export function upgradeOnly(from: IntakeClass, to: IntakeClass): IntakeClass {
  if (overrideDirection(from, to) === "down") {
    fail(`the harness may not reclassify ${from} down to ${to}`);
  }
  return to;
}
