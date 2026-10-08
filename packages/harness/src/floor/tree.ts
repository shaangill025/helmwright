import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, posix } from "node:path";
import type { FloorChecked, FloorFinding } from "@helmwright/schema";
import { runGit } from "../config/config.ts";
import { caseFold, isRing0Path } from "../permission/normalize.ts";
import { deepFreeze, displayText } from "../permission/policy.ts";
import { FloorError, floorChecked } from "./events.ts";
import { floorFindings, isConfig, type FloorChange } from "./rules.ts";

/** The run's repo as the host knows it, never discovered from inside the worktree. */
export interface FloorRepo {
  /** The run's worktree: absolute, the sandbox's mount, so its content is untrusted. */
  readonly worktree: string;
  /** The repo's realpath'd common git dir (RunConfig.repoId), outside the mount. */
  readonly commonDir: string;
}

export interface FloorLimits {
  /** The most changed paths checked. */
  readonly files: number;
  /** The most bytes read from git: the change list, then each blob. */
  readonly bytes: number;
}
/** Past either limit the floor fails closed with a `floor.limits` finding. */
export const FLOOR_LIMITS: FloorLimits = deepFreeze({
  files: 2000,
  bytes: 8 * 1024 * 1024,
});

export interface CandidateChanges {
  readonly candidateTree: string;
  /** The changes checked: all of them, or those before a limit was reached. */
  readonly changes: readonly FloorChange[];
  /** `floor.limits`, and `config.changed` for an ignored config or agent file. */
  readonly findings: readonly FloorFinding[];
  /** S3: the case-folded paths the base commit's configs extend or import. */
  readonly chain: ReadonlySet<string>;
}

const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const REF = /^refs\/[A-Za-z0-9._/-]+$/;
const VERSION = /^git version (\d+)\.(\d+)/;
const REGULAR = new Set(["100644", "100755"]);
const RAW = /^:([0-7]{6}) ([0-7]{6}) ([0-9a-f]+) ([0-9a-f]+) [ADMT]$/;
/** The largest git metadata file read from the trusted dirs. */
const MAX_META = 65_536;
const GLOB_META = new Set(["*", "?", "[", "\\"]);

/** @throws FloorError unless `text` (`git version` output) is git 2.40 or later (`--attr-source`). */
export function requireGitVersion(text: string): void {
  const [, major = "0", minor = "0"] = VERSION.exec(text) ?? [];
  if (Number(major) < 2 || (Number(major) === 2 && Number(minor) < 40)) {
    throw new FloorError("git 2.40 or later is required");
  }
}

/**
 * The bytes of a regular file of at most MAX_META bytes, opened without following a
 * symlink or waiting on a FIFO; an empty buffer if it is missing and `optional`.
 * @throws FloorError with fixed text otherwise
 */
function readMeta(path: string, optional = false): Buffer {
  const flags =
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
  let fd: number;
  try {
    fd = openSync(path, flags);
  } catch (error) {
    const missing = (error as { code?: unknown }).code === "ENOENT";
    if (missing && optional) return Buffer.alloc(0);
    throw new FloorError("git metadata file cannot be read safely");
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_META) {
      throw new FloorError("git metadata file is not a small regular file");
    }
    const data = Buffer.alloc(stat.size);
    let read = 0;
    while (read < data.length) {
      const n = readSync(fd, data, read, data.length - read, read);
      if (n === 0) break;
      read += n;
    }
    return data.subarray(0, read);
  } finally {
    closeSync(fd);
  }
}

/**
 * The worktree's private git dir, `<commonDir>/worktrees/<id>`: the one whose back-pointer
 * (outside the mount) names this worktree, and which the worktree's `.git` gitfile names
 * exactly as `git worktree add` wrote it. Nothing inside the worktree chooses the git dir.
 * @throws FloorError on any mismatch (fail closed)
 */
function privateGitDir(worktree: string, commonDir: string): string {
  const pointer = join(worktree, ".git");
  let ids: string[];
  try {
    ids = readdirSync(join(commonDir, "worktrees"));
  } catch {
    throw new FloorError("the common git dir has no linked worktrees");
  }
  const id = ids.find(
    (name) =>
      readMeta(join(commonDir, "worktrees", name, "gitdir"), true).toString(
        "utf8",
      ) ===
      pointer + "\n",
  );
  if (id === undefined) {
    throw new FloorError("the worktree is not linked to the common git dir");
  }
  const gitDir = join(commonDir, "worktrees", id);
  const gitfile = lstatSync(pointer, { throwIfNoEntry: false });
  const expected = "gitdir: " + gitDir + "\n";
  if (
    gitfile?.isFile() !== true ||
    readMeta(pointer).toString("utf8") !== expected
  ) {
    throw new FloorError("the worktree's .git does not match its git dir");
  }
  return gitDir;
}

/**
 * The changes from `baseCommit` to the candidate tree: the worktree's HEAD (read from its
 * private git dir) plus its working tree, untracked files included and ignored files
 * excluded, which is what a commit of the worktree would hold. B1: the git dirs come from
 * the host (`repo.commonDir`), never from discovery in the worktree. The tree is written
 * through a temporary git dir whose index and new objects are deleted afterwards; it
 * borrows the repo's objects and info/exclude. Attributes come from `baseCommit`
 * (`--attr-source`), so the candidate's .gitattributes cannot select a filter; a changed
 * ignore or attributes file is itself `config.changed`. Content is read from git objects
 * only, so no symlink is followed on the host. Every git call goes through runGit.
 * @throws FloorError (fail closed); a git error otherwise.
 */
export function candidateChanges(
  repo: FloorRepo,
  baseCommit: string,
  limits: FloorLimits = FLOOR_LIMITS,
): CandidateChanges {
  if (!isAbsolute(repo.worktree) || !isAbsolute(repo.commonDir)) {
    throw new FloorError("worktree and common git dir must be absolute paths");
  }
  if (!OID.test(baseCommit)) {
    throw new FloorError("base commit must be a full object ID");
  }
  const [worktree, common] = [repo.worktree, repo.commonDir].map((path) =>
    realpathSync(path),
  ) as [string, string];
  const trusted = (args: string[]) =>
    gitCall(args, () => runGit(common, ["--git-dir=" + common, ...args]))
      .toString("utf8")
      .trim();
  requireGitVersion(trusted(["version"]));
  const gitDir = privateGitDir(worktree, common);
  const headText = readMeta(join(gitDir, "HEAD")).toString("utf8").trim();
  const ref = headText.startsWith("ref: ") ? headText.slice(5) : headText;
  if (!OID.test(ref) && !REF.test(ref)) {
    throw new FloorError("the worktree's HEAD is not a ref or an object ID");
  }
  const head = trusted([
    ...["rev-parse", "--verify", "--end-of-options"],
    ref + "^{commit}",
  ]);
  const format = trusted(["rev-parse", "--show-object-format"]);
  const exclude = readMeta(join(common, "info", "exclude"), true);
  const temp = mkdtempSync(join(tmpdir(), "helmwright-floor-"));
  try {
    const dir = join(temp, "git");
    const init = ["init", "--quiet", "--bare", "--template="];
    gitCall(init, () =>
      runGit(temp, [...init, "--object-format=" + format, dir]),
    );
    mkdirSync(join(dir, "objects", "info"), { recursive: true });
    mkdirSync(join(dir, "info"), { recursive: true });
    const objects = join(common, "objects") + "\n";
    writeFileSync(join(dir, "objects", "info", "alternates"), objects);
    writeFileSync(join(dir, "info", "exclude"), exclude);
    const where = ["--git-dir=" + dir, "--work-tree=" + worktree];
    const git = (args: string[], maxBuffer?: number) =>
      gitCall(args, () =>
        runGit(worktree, [...where, "--attr-source=" + baseCommit, ...args], {
          maxBuffer,
        }),
      );
    git(["read-tree", head]);
    git(["add", "--all"], limits.bytes);
    const candidateTree = git(["write-tree"]).toString("utf8").trim();
    return { candidateTree, ...read(git, baseCommit, candidateTree, limits) };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

type Git = (args: string[], maxBuffer?: number) => Buffer;

/**
 * SF-3: runs one git call. A failed one becomes a FloorError with fixed text, `git
 * <subcommand> failed (exit N)`, never its command line, stderr or a path. A timeout
 * (fixed text already) and ENOBUFS (a `floor.limits` finding) are thrown as they are.
 */
function gitCall(args: readonly string[], call: () => Buffer): Buffer {
  try {
    return call();
  } catch (error) {
    if (isOverBuffer(error)) throw error;
    const { status, code } = (error ?? {}) as Record<string, unknown>;
    if (status === undefined && code === undefined && error instanceof Error) {
      throw error; // runGit's timeout error
    }
    const exit =
      typeof status === "number" ? " (exit " + String(status) + ")" : "";
    throw new FloorError("git " + (args[0] ?? "") + " failed" + exit);
  }
}

const isOverBuffer = (error: unknown) =>
  (error as { code?: unknown } | null)?.code === "ENOBUFS";
const limit = (detail: string, path?: string): FloorFinding => ({
  rule: "floor.limits",
  ...(path === undefined ? {} : { path: displayText(path) }),
  detail,
});
const ignoredFile = (path: string, detail: string): FloorFinding => ({
  rule: "config.changed",
  path: displayText(path),
  detail,
});
const isGitignore = (path: string) =>
  caseFold(path.split("/").at(-1) ?? "") === ".gitignore";

/**
 * S4: the finding for one ignored path (a collapsed directory ends in `/`), or undefined.
 * An ignored .gitignore or config file (agent files included, F4) is reported; a file inside a
 * collapsed ignored directory, such as node_modules/.bin or a build cache, is not: B15
 * runs the tools on a clean export of the candidate tree, never in the worktree.
 */
function ignoredFinding(listed: string): FloorFinding | undefined {
  if (isGitignore(listed)) return ignoredFile(listed, "ignored .gitignore");
  const dir = listed.endsWith("/");
  const path = dir ? listed.slice(0, -1) : listed;
  // A directory counts as config when it is, or is in, a config directory.
  return isConfig(dir ? path + "/-" : path)
    ? ignoredFile(path, "ignored")
    : undefined;
}
/** `path` as a literal inside a `:(glob)` pathspec. */
const globLiteral = (path: string) =>
  Array.from(path, (c) => (GLOB_META.has(c) ? "\\" + c : c)).join("");

/**
 * S2, S4: ignored `.gitignore`, agent and config files. A collapsed ignored directory
 * that no rule outside it ignores is ignored only by rules inside it, so its files are
 * listed too.
 */
function ignoredFiles(git: Git, max: number): FloorFinding[] {
  const others = [
    "ls-files",
    "-z",
    "--others",
    "--ignored",
    "--exclude-standard",
  ];
  const listed = entries(git([...others, "--directory"], max));
  // R1: names without the trailing slash, so only rules outside a directory decide
  // whether it is ignored. check-ignore refuses --literal-pathspecs, so each name gets a
  // `./` prefix: magic is parsed only at a leading `:`, and the output echoes the input.
  const dirs = listed
    .filter((path) => path.endsWith("/"))
    .map((path) => path.slice(0, -1));
  // runGit gives no stdin, so no --stdin -z: a quoted name fails the match and is searched.
  let outer = new Set<string>();
  try {
    const local = dirs.map((dir) => "./" + dir);
    const args = ["-c", "core.quotePath=false", "check-ignore", "--", ...local];
    if (dirs.length)
      outer = new Set(git(args, max).toString("utf8").split("\n"));
  } catch (error) {
    // check-ignore exits 1 when no path is ignored.
    if ((error as { status?: unknown }).status !== 1) throw error;
  }
  const inner = dirs
    .filter((dir) => !outer.has("./" + dir))
    .map((dir) => ":(glob)" + globLiteral(dir) + "/**/.gitignore");
  const nested = inner.length
    ? entries(git([...others, "--", ...inner], max))
    : [];
  const found = new Set([...listed, ...nested]);
  return [...found].flatMap((path) => ignoredFinding(path) ?? []);
}

/** The candidate's changes with their blob bytes, bounded by `limits`. */
function read(git: Git, base: string, tree: string, limits: FloorLimits) {
  const findings: FloorFinding[] = [];
  const changes: FloorChange[] = [];
  let raw: string[];
  try {
    findings.push(...ignoredFiles(git, limits.bytes));
    const diff = [
      "diff-tree",
      "-r",
      "-z",
      "--raw",
      "--no-renames",
      "--no-abbrev",
    ];
    const options = ["--no-ext-diff", "--no-textconv"];
    raw = entries(git([...diff, ...options, base, tree], limits.bytes));
  } catch (error) {
    if (!isOverBuffer(error)) throw error;
    const detail = "change list over the byte limit";
    return {
      changes,
      chain: new Set<string>(),
      findings: [...findings, limit(detail)],
    };
  }
  const { chain, findings: chainLimits } = configChain(git, base, limits.bytes);
  findings.push(...chainLimits);
  let budget = limits.bytes;
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const path = raw[i + 1] ?? "";
    const fields = RAW.exec(raw[i] ?? "");
    if (fields === null) throw new FloorError("unexpected diff-tree output");
    if (changes.length === limits.files) {
      findings.push(limit(`over ${String(limits.files)} changed files`, path));
      break;
    }
    const [, baseMode = "", candidateMode = "", from = "", to = ""] = fields;
    const blob = (mode: string, oid: string) => {
      if (!REGULAR.has(mode)) return undefined;
      const data = git(["cat-file", "blob", oid], budget + 1);
      budget -= data.length;
      if (budget < 0) throw Object.assign(new Error(), { code: "ENOBUFS" });
      return data;
    };
    try {
      const [b, c] = [blob(baseMode, from), blob(candidateMode, to)];
      changes.push({ path, baseMode, candidateMode, base: b, candidate: c });
    } catch (error) {
      if (!isOverBuffer(error)) throw error;
      findings.push(limit(`over ${String(limits.bytes)} bytes read`, path));
      break;
    }
  }
  return { changes, chain, findings };
}

/** S3: base configs whose chains are followed, as TypeScript (`ts`) or module (`js`) configs. */
const CHAIN_ROOTS = deepFreeze({
  ts: ["tsconfig*.json", "jsconfig*.json"],
  js: [
    "eslint.config.*",
    "vitest.config.*",
    "vitest.workspace.*",
    "vite.config.*",
  ],
});
/** The most chain paths, and the most base files read to find them. */
const MAX_CHAIN = 64;
const MAX_CHAIN_READS = 128;
/** How many links are followed from a root config. */
const CHAIN_DEPTH = 2;
const TREE_ENTRY = /^([0-7]{6}) blob ([0-9a-f]+)$/;
/** A relative string literal with no glob character, of at most 200 characters. */
const RELATIVE = /["'`](\.\.?\/[^"'`\s*?{}[\]]{1,200})["'`]/g;
/** A module or data file a config can import or read. */
const MODULE = /\.(?:[cm]?[jt]sx?|json5?|jsonc|ya?ml|toml)$/;
const LITERAL_DATA = /\.(?:json5?|jsonc|ya?ml|toml)$/;

/** The extensions Node, TypeScript and Vite try for an extensionless import. */
const EXTENSIONS = deepFreeze(
  ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"].map((e) => "." + e),
);

/**
 * `rel` (relative to `dir`) as a repo file path, or undefined if it leaves the repo or
 * names a directory (such as `./`).
 */
function resolvePath(dir: string, rel: string): string | undefined {
  const path = posix.normalize(posix.join(dir, rel));
  return path === ".." ||
    path.startsWith("../") ||
    posix.isAbsolute(path) ||
    path === "." ||
    path.endsWith("/")
    ? undefined
    : path;
}

/**
 * JSON with comments and trailing commas (as tsconfig allows) as a value, or undefined:
 * one linear pass drops comments outside strings and a comma before `}` or `]`.
 */
function parseJsonc(text: string): unknown {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const c = text.charAt(i);
    const next = text.charAt(i + 1);
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text.charAt(j) !== '"') {
        j += text.charAt(j) === "\\" ? 2 : 1;
      }
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (c === "/" && next === "/") {
      const end = text.indexOf("\n", i);
      i = end === -1 ? text.length : end;
    } else if (c === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
    } else if (c === ",") {
      let j = i + 1;
      while (/\s/.test(text.charAt(j))) j += 1;
      if (text.charAt(j) !== "}" && text.charAt(j) !== "]") out += c;
      i += 1;
    } else {
      out += c;
      i += 1;
    }
  }
  try {
    return JSON.parse(out);
  } catch {
    return undefined;
  }
}

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null && Object.hasOwn(value, key)
    ? (value as Record<string, unknown>)[key]
    : undefined;
const isRelative = (path: unknown): path is string =>
  typeof path === "string" && (path.startsWith("./") || path.startsWith("../"));

/** The repo paths a TypeScript config names: relative `extends` and `references[].path`. */
function tsLinks(dir: string, text: string): string[] {
  const value = parseJsonc(text);
  const extended = field(value, "extends");
  const references = field(value, "references");
  const links: string[] = [];
  for (const rel of [extended].flat().filter(isRelative)) {
    links.push(rel, ...(rel.endsWith(".json") ? [] : [rel + ".json"]));
  }
  for (const ref of Array.isArray(references) ? references : []) {
    const rel = field(ref, "path");
    if (isRelative(rel)) {
      links.push(rel.endsWith(".json") ? rel : rel + "/tsconfig.json");
    }
  }
  return links.flatMap((rel) => resolvePath(dir, rel) ?? []);
}

/**
 * The repo paths of relative module-like string literals in a module config. An
 * extensionless literal, such as `./vitest.shared`, gives each file it could resolve to
 * (`rel` or `rel/index` with each of EXTENSIONS) once one of them is in the base, so a
 * file that shadows the base's own is in the chain too; those not in the base are guesses.
 */
function jsLinks(dir: string, text: string, inBase: (path: string) => boolean) {
  const links: { path: string; guess: boolean }[] = [];
  for (const [, rel = ""] of text.matchAll(RELATIVE)) {
    if (MODULE.test(rel)) {
      const path = resolvePath(dir, rel);
      if (path !== undefined) links.push({ path, guess: false });
      continue;
    }
    const files = EXTENSIONS.flatMap((ext) => [
      rel + ext,
      rel + "/index" + ext,
    ]).flatMap((file) => resolvePath(dir, file) ?? []);
    if (files.some(inBase)) {
      links.push(...files.map((path) => ({ path, guess: !inBase(path) })));
    }
  }
  return links;
}

/**
 * S3: the paths the base commit's configs extend, reference or import, up to
 * CHAIN_DEPTH links from a root config. The base is trusted, so its files are read
 * through git; an unparseable base tsconfig has no chain. Past a bound the floor fails
 * closed with a `floor.limits` finding; the path bound does not count a guess (jsLinks).
 */
function configChain(git: Git, base: string, max: number) {
  const chain = new Set<string>();
  const findings: FloorFinding[] = [];
  const blobs = new Map<string, string>();
  try {
    const list = ["ls-tree", "-r", "-z", "--full-tree", base];
    for (const entry of entries(git(list, max))) {
      const tab = entry.indexOf("\t");
      const oid = TREE_ENTRY.exec(entry.slice(0, tab))?.[2];
      if (oid !== undefined) blobs.set(entry.slice(tab + 1), oid);
    }
    type Item = { path: string; ts: boolean; depth: number };
    const kind = (path: string) => {
      const name = caseFold(path.split("/").at(-1) ?? "");
      if (isRing0Path(name, CHAIN_ROOTS.ts)) return "ts";
      return isRing0Path(name, CHAIN_ROOTS.js) ? "js" : undefined;
    };
    const queue: Item[] = [...blobs.keys()].flatMap((path) => {
      const k = kind(path);
      return k === undefined ? [] : [{ path, ts: k === "ts", depth: 0 }];
    });
    let reads = 0;
    let paths = 0;
    const inBase = (path: string) => blobs.has(path);
    for (let item = queue.shift(); item; item = queue.shift()) {
      const oid = blobs.get(item.path);
      if (oid === undefined || item.depth >= CHAIN_DEPTH) continue;
      if (++reads > MAX_CHAIN_READS) {
        const detail = `config chain over ${String(MAX_CHAIN_READS)} files read`;
        return { chain, findings: [limit(detail)] };
      }
      const text = git(["cat-file", "blob", oid], MAX_META).toString("utf8");
      const dir = posix.dirname(item.path);
      const links = item.ts
        ? tsLinks(dir, text).map((path) => ({ path, guess: false }))
        : jsLinks(dir, text, inBase);
      for (const { path, guess } of links) {
        if (chain.has(caseFold(path))) continue;
        chain.add(caseFold(path));
        if (!guess) paths += 1;
        const ts = item.ts || kind(path) === "ts";
        if (!LITERAL_DATA.test(path) || ts) {
          queue.push({ path, ts, depth: item.depth + 1 });
        }
      }
      if (paths > MAX_CHAIN) {
        const detail = `config chain over ${String(MAX_CHAIN)} paths`;
        return { chain, findings: [limit(detail)] };
      }
    }
  } catch (error) {
    if (!isOverBuffer(error)) throw error;
    findings.push(limit("config chain over the byte limit"));
  }
  return { chain, findings };
}

/** The NUL-separated entries of git's `-z` output. */
function entries(output: Buffer): string[] {
  const parts = output.toString("utf8").split("\0");
  parts.pop();
  return parts;
}

/**
 * Checks the candidate of `repo` against `baseCommit` with the floor's rules.
 * `protectedGlobs` are the run's Ring 0 paths (the resolved policy's and the floor's).
 * @throws FloorError or a git error; the caller fails the run (fail closed).
 */
export function checkCandidate(
  repo: FloorRepo,
  baseCommit: string,
  protectedGlobs: readonly string[],
  limits: FloorLimits = FLOOR_LIMITS,
): FloorChecked {
  const { candidateTree, changes, findings, chain } = candidateChanges(
    repo,
    baseCommit,
    limits,
  );
  return floorChecked(baseCommit, candidateTree, [
    ...findings,
    ...floorFindings(changes, protectedGlobs, chain),
  ]);
}
