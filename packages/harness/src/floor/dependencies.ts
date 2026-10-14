import type {
  DependencyField,
  FloorDependencyAdded,
  FloorDependencyMajorBump,
  FloorSignal,
} from "@helmwright/schema";
import { deepFreeze, displayText } from "../permission/policy.ts";
import { FloorError } from "./events.ts";
import {
  REGULAR,
  compare,
  decode,
  nameOf,
  own,
  packageObject,
  same,
  segments,
  type FloorChange,
} from "./rules.ts";

/**
 * The dependency detector (Q44, A-dep): pure and deterministic, it reads only the
 * base-to-candidate changes the floor already holds, with no git call and no network.
 * It finds a direct dependency added in any dependency field, a major bump of one and a
 * lockfile-only change; a removal gives no signal. A change to a field, a lockfile name or
 * the specifier grammar needs a new version.
 */
export const DEPENDENCY_DETECTOR = "dependency-1";

/** The most signals one detection gives; past it, it throws (fail closed). */
export const MAX_SIGNALS = 256;
/** The most manifests one detection reads; past it, it throws (fail closed). */
const MAX_MANIFESTS = 256;
/** A longer specifier has no major key. */
const MAX_SPECIFIER = 256;

type Unsigned<T> = T extends unknown ? Omit<T, "id"> : never;
/** A `floor.signalled` signal before its ID (`<eventId>:<index>`) is given. */
export type DependencySignal = Unsigned<FloorSignal>;
type Dependency = Unsigned<FloorDependencyAdded | FloorDependencyMajorBump>;

const RUNTIME_FIELDS: readonly DependencyField[] = deepFreeze([
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
]);
/** In this order: a tie between fields keeps the first. */
const FIELDS: readonly DependencyField[] = deepFreeze([
  ...RUNTIME_FIELDS,
  "devDependencies",
]);
/** Lockfile names, matched at any depth; a lockfile is never parsed. */
const LOCKFILES: ReadonlySet<string> = new Set([
  ...["pnpm-lock.yaml", "package-lock.json", "npm-shrinkwrap.json"],
  ...["yarn.lock", "bun.lock", "bun.lockb"],
]);
const OPERATORS = "^~=><";

/** The specifiers of `field` by name; a non-string one as its JSON text, a non-object field as none. */
function entries(
  manifest: object,
  field: DependencyField,
): Map<string, string> {
  const value = own(manifest, field);
  const map = new Map<string, string>();
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return map;
  }
  for (const [name, specifier] of Object.entries(value)) {
    map.set(
      name,
      typeof specifier === "string" ? specifier : JSON.stringify(specifier),
    );
  }
  return map;
}

/** Whether every code unit of `text` is one of `units`. */
function only(text: string, units: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    if (!units.includes(text.charAt(i))) return false;
  }
  return true;
}
const isDigits = (part: string) =>
  part.length > 0 && part.length <= 15 && only(part, "0123456789");
const isWildcard = (part: string) =>
  part === "x" || part === "X" || part === "*";

/**
 * The breaking component of a version, as [major, minor, patch] with the others 0: the
 * major if it is above 0, else the minor, else the patch. A prerelease or build is
 * ignored and a wildcard reads as 0; undefined if it is not a version.
 */
function versionKey(version: string): readonly number[] | undefined {
  const core = version.split("+")[0]?.split("-")[0] ?? "";
  const parts = core.split(".");
  if (parts.length > 3 || isWildcard(parts[0] ?? "")) return undefined;
  const numbers: number[] = [];
  let wild = false;
  for (const part of parts) {
    if (isWildcard(part)) wild = true;
    else if (!isDigits(part)) return undefined;
    else if (!wild) numbers.push(Number(part));
  }
  const [major = 0, minor = 0, patch = 0] = numbers;
  if (major > 0) return [major, 0, 0];
  return minor > 0 ? [0, minor, 0] : [0, 0, patch];
}

/** The comparators of one `||` alternative, split on spaces and tabs. */
function comparators(alternative: string): string[] {
  const words = alternative
    .split("\t")
    .join(" ")
    .split(" ")
    .filter((word) => word !== "");
  const joined: string[] = [];
  for (let i = 0; i < words.length; i += 1) {
    let word = words[i] ?? "";
    // A spaced operator, such as `>= 1.2.3`, joins the word after it.
    if (only(word, OPERATORS)) {
      i += 1;
      word += words[i] ?? "";
    }
    joined.push(word);
  }
  return joined;
}

/** The key of one `||` alternative: its first comparator without `^ ~ = > >= v`. */
function alternativeKey(alternative: string): readonly number[] | undefined {
  const first = comparators(alternative)[0] ?? "";
  let at = 0;
  while (at < first.length && "^~=>".includes(first.charAt(at))) at += 1;
  if (first.charAt(at) === "v") at += 1;
  return versionKey(first.slice(at));
}

const compareKeys = (a: readonly number[], b: readonly number[]) =>
  (a[0] ?? 0) - (b[0] ?? 0) ||
  (a[1] ?? 0) - (b[1] ?? 0) ||
  (a[2] ?? 0) - (b[2] ?? 0);

/**
 * `specifier` trimmed and split as [source, range]: the source is its `npm:<name>@` or
 * `workspace:` prefix, else empty; undefined for an alias without a range.
 */
function sourced(specifier: string): readonly [string, string] | undefined {
  const range = specifier.trim();
  if (range.startsWith("npm:")) {
    // Past the `@` of a scoped name.
    const at = range.indexOf("@", "npm:".length + 1);
    if (at === -1) return undefined;
    return [range.slice(0, at + 1), range.slice(at + 1)];
  }
  if (range.startsWith("workspace:")) {
    return ["workspace:", range.slice("workspace:".length)];
  }
  return ["", range];
}

/**
 * The upper descriptor of a range (OQ-AD-9): per `||` alternative, its comparators after
 * the first (a hyphen range's upper bound among them) and whether it is open-ended (a `>`
 * comparator and no `<` one), sorted. The first comparator is left to the major key, so
 * `^1.2.0` to `~1.3.0` keeps the descriptor.
 */
function upper(range: string): string {
  const parts = range.split("||").map((alternative) => {
    const words = comparators(alternative);
    const open =
      words.some((w) => w.startsWith(">")) &&
      !words.some((w) => w.startsWith("<"));
    return JSON.stringify([open, words.slice(1)]);
  });
  return JSON.stringify(parts.sort(compare));
}

/**
 * The major key of a range, the maximum over its `||` alternatives (a hyphen range keys
 * on its lower bound); undefined for `*`, a tag, a path, git or a URL. No regex.
 */
function majorKey(range: string): readonly number[] | undefined {
  let best: readonly number[] | undefined;
  for (const alternative of range.split("||")) {
    const key = alternativeKey(alternative);
    if (key === undefined) return undefined;
    if (best === undefined || compareKeys(key, best) > 0) best = key;
  }
  return best;
}

/**
 * The bump of a changed specifier, or undefined for one in the same major (OQ-AD-2):
 * `unknown` if either side has no major key or is over MAX_SPECIFIER code units, or the
 * source changed (OQ-AD-10a); else `major` if the major keys differ; else `unknown` if the
 * upper descriptors differ (OQ-AD-9).
 */
function bumpOf(from: string, to: string): "major" | "unknown" | undefined {
  if (from.length > MAX_SPECIFIER || to.length > MAX_SPECIFIER)
    return "unknown";
  const [base, candidate] = [sourced(from), sourced(to)];
  if (base === undefined || candidate === undefined) return "unknown";
  if (base[0] !== candidate[0]) return "unknown";
  const [before, after] = [majorKey(base[1]), majorKey(candidate[1])];
  if (before === undefined || after === undefined) return "unknown";
  if (compareKeys(before, after) !== 0) return "major";
  return upper(base[1]) === upper(candidate[1]) ? undefined : "unknown";
}

const sortKey = (s: DependencySignal) =>
  s.type === "lockfile.only"
    ? [s.path, "", s.type]
    : [s.path, s.name, s.type, s.field, s.from ?? "", s.to];
const order = (a: DependencySignal, b: DependencySignal) => {
  const [left, right] = [sortKey(a), sortKey(b)];
  for (let i = 0; i < left.length; i += 1) {
    const c = compare(left[i] ?? "", right[i] ?? "");
    if (c !== 0) return c;
  }
  return left.length - right.length;
};

/** `signals` sorted in place. @throws FloorError past MAX_SIGNALS signals */
function bounded<T extends DependencySignal>(signals: T[], sort = true): T[] {
  if (signals.length > MAX_SIGNALS) {
    throw new FloorError("more than 256 dependency signals");
  }
  return sort ? signals.sort(order) : signals;
}

/**
 * The dependency signals of one manifest, the pure core plan-time detection reuses (A4).
 * Per name the most material one is kept: a runtime add, then a major bump, then a dev
 * add. A runtime add is a name in a runtime field of the candidate and in none of the
 * base (a move from dev counts); a dev add is in `devDependencies` and in no field of the
 * base; a major bump is a changed specifier (see `bumpOf`) against the same field of the
 * base, or for a runtime field without the name in the base, against the first base
 * runtime field with it in FIELDS order (OQ-AD-10b; `from` is that field's specifier).
 * Text is escaped for display; the result is sorted by path, name and type.
 * @throws FloorError past MAX_SIGNALS signals, or for a signal of an empty name
 */
export function dependencySignals(
  baseManifest: object,
  candidateManifest: object,
  path: string,
): Dependency[] {
  const before = new Map(FIELDS.map((f) => [f, entries(baseManifest, f)]));
  const inBase = (name: string, fields: readonly DependencyField[]) =>
    fields.some((f) => before.get(f)?.has(name) === true);
  const best = new Map<string, readonly [number, Dependency]>();
  for (const field of FIELDS) {
    const runtime = field !== "devDependencies";
    for (const [name, to] of entries(candidateManifest, field)) {
      const shown = {
        path: displayText(path),
        field,
        name: displayText(name),
        runtime,
      };
      const from =
        before.get(field)?.get(name) ??
        (runtime
          ? RUNTIME_FIELDS.map((f) => before.get(f)?.get(name)).find(
              (specifier) => specifier !== undefined,
            )
          : undefined);
      const bump =
        from === undefined || from === to ? undefined : bumpOf(from, to);
      const add = { ...shown, type: "dependency.added", from: null } as const;
      const found: readonly [number, Dependency] | undefined =
        runtime && !inBase(name, RUNTIME_FIELDS)
          ? [0, { ...add, to: displayText(to) }]
          : !runtime && !inBase(name, FIELDS)
            ? [2, { ...add, to: displayText(to) }]
            : from !== undefined && bump !== undefined
              ? [
                  1,
                  {
                    ...shown,
                    type: "dependency.majorBump",
                    from: displayText(from),
                    to: displayText(to),
                    bump,
                  },
                ]
              : undefined;
      // The schema's `text` cannot hold it (fail closed).
      if (found !== undefined && name === "") {
        throw new FloorError("a dependency name is empty");
      }
      const kept = best.get(name);
      if (found !== undefined && (kept === undefined || found[0] < kept[0])) {
        best.set(name, found);
      }
    }
  }
  return bounded([...best.values()].map(([, signal]) => signal));
}

/** A manifest change's sides as parsed objects (absent or unreadable base: `{}`); undefined for a candidate that is not a JSON object. */
function manifests(change: FloorChange): readonly [object, object] | undefined {
  const text = (mode: string, bytes: Uint8Array | undefined) =>
    REGULAR.has(mode) && bytes !== undefined
      ? (decode(bytes) ?? "")
      : undefined;
  const after = packageObject(text(change.candidateMode, change.candidate));
  if (after === undefined) return undefined;
  return [packageObject(text(change.baseMode, change.base)) ?? {}, after];
}

/**
 * The `dependency-1` signals of `changes`: every changed `package.json` and lockfile at
 * any depth, outside `node_modules`. A candidate that is not a JSON object is already a
 * `package.changed` finding, so it gives none. `lockfile.only` is each changed lockfile
 * when no manifest changed a dependency field (a minor bump or a removal does).
 * @throws FloorError past MAX_MANIFESTS manifests or MAX_SIGNALS signals
 */
export function detectDependencies(
  changes: readonly FloorChange[],
): DependencySignal[] {
  const signals: DependencySignal[] = [];
  const lockfiles: string[] = [];
  let count = 0;
  let changed = false;
  for (const change of changes) {
    const name = nameOf(change.path);
    if (segments(change.path).includes("node_modules")) continue;
    if (LOCKFILES.has(name)) lockfiles.push(change.path);
    if (name !== "package.json") continue;
    count += 1;
    if (count > MAX_MANIFESTS) {
      throw new FloorError("more than 256 changed package.json files");
    }
    const sides = manifests(change);
    if (sides === undefined) continue;
    const [before, after] = sides;
    changed ||= FIELDS.some((f) => !same(own(before, f), own(after, f)));
    signals.push(...dependencySignals(before, after, change.path));
    bounded(signals, false);
  }
  if (!changed) {
    for (const path of lockfiles) {
      signals.push({ type: "lockfile.only", path: displayText(path) });
    }
  }
  return bounded(signals);
}
