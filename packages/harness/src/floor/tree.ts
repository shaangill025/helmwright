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
import { isAbsolute, join } from "node:path";
import type { FloorChecked, FloorFinding } from "@helmwright/schema";
import { runGit } from "../config/config.ts";
import { caseFold } from "../permission/normalize.ts";
import { deepFreeze, displayText } from "../permission/policy.ts";
import { FloorError, floorChecked } from "./events.ts";
import { floorFindings, type FloorChange } from "./rules.ts";

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
  /** `floor.limits`, and `config.changed` for an ignored `.gitignore`. */
  readonly findings: readonly FloorFinding[];
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
    runGit(common, ["--git-dir=" + common, ...args])
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
    runGit(temp, [...init, "--object-format=" + format, dir]);
    mkdirSync(join(dir, "objects", "info"), { recursive: true });
    mkdirSync(join(dir, "info"), { recursive: true });
    const objects = join(common, "objects") + "\n";
    writeFileSync(join(dir, "objects", "info", "alternates"), objects);
    writeFileSync(join(dir, "info", "exclude"), exclude);
    const where = ["--git-dir=" + dir, "--work-tree=" + worktree];
    const git = (args: string[], maxBuffer?: number) =>
      runGit(worktree, [...where, "--attr-source=" + baseCommit, ...args], {
        maxBuffer,
      });
    git(["read-tree", head]);
    git(["add", "--all"], limits.bytes);
    const candidateTree = git(["write-tree"]).toString("utf8").trim();
    return { candidateTree, ...read(git, baseCommit, candidateTree, limits) };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

type Git = (args: string[], maxBuffer?: number) => Buffer;

const isOverBuffer = (error: unknown) =>
  (error as { code?: unknown } | null)?.code === "ENOBUFS";
const limit = (detail: string, path?: string): FloorFinding => ({
  rule: "floor.limits",
  ...(path === undefined ? {} : { path: displayText(path) }),
  detail,
});
const ignoredGitignore = (path: string): FloorFinding => ({
  rule: "config.changed",
  path: displayText(path),
  detail: "ignored .gitignore",
});
const isGitignore = (path: string) =>
  caseFold(path.split("/").at(-1) ?? "") === ".gitignore";
/** `path` as a literal inside a `:(glob)` pathspec. */
const globLiteral = (path: string) =>
  Array.from(path, (c) => (GLOB_META.has(c) ? "\\" + c : c)).join("");

/**
 * S2: ignored `.gitignore` files. A collapsed ignored directory that no rule outside it
 * ignores is ignored only by rules inside it, so its `.gitignore` files are listed too.
 */
function ignoredGitignores(git: Git, max: number): FloorFinding[] {
  const others = [
    "ls-files",
    "-z",
    "--others",
    "--ignored",
    "--exclude-standard",
  ];
  const listed = entries(git([...others, "--directory"], max));
  const dirs = listed.filter((path) => path.endsWith("/"));
  // Without --stdin check-ignore has no -z; a quoted name fails the match and is searched.
  let outer = new Set<string>();
  try {
    const args = ["-c", "core.quotePath=false", "check-ignore", "--", ...dirs];
    if (dirs.length)
      outer = new Set(git(args, max).toString("utf8").split("\n"));
  } catch (error) {
    // check-ignore exits 1 when no path is ignored.
    if ((error as { status?: unknown }).status !== 1) throw error;
  }
  const inner = dirs
    .filter((dir) => !outer.has(dir))
    .map((dir) => ":(glob)" + globLiteral(dir) + "**/.gitignore");
  const nested = inner.length
    ? entries(git([...others, "--", ...inner], max))
    : [];
  return [...listed, ...nested].filter(isGitignore).map(ignoredGitignore);
}

/** The candidate's changes with their blob bytes, bounded by `limits`. */
function read(git: Git, base: string, tree: string, limits: FloorLimits) {
  const findings: FloorFinding[] = [];
  const changes: FloorChange[] = [];
  let raw: string[];
  try {
    findings.push(...ignoredGitignores(git, limits.bytes));
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
    return { changes, findings: [...findings, limit(detail)] };
  }
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
  return { changes, findings };
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
  const { candidateTree, changes, findings } = candidateChanges(
    repo,
    baseCommit,
    limits,
  );
  return floorChecked(baseCommit, candidateTree, [
    ...findings,
    ...floorFindings(changes, protectedGlobs),
  ]);
}
