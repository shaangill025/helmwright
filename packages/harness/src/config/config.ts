import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import {
  CONFIG_DEFAULTS,
  RING0_CONFIG_KEYS,
  validateHelmwrightConfig,
  type PermissionPolicy,
} from "@helmwright/schema";
import type { SessionLog } from "../log/session-log.ts";
import { errorMessage } from "../loop/terminal.ts";
import { permissionFaults } from "../permission/faults.ts";
import {
  DEFAULT_PERMISSION_POLICY,
  canonical,
  displayText,
  fitsAsk,
  resolvePolicy,
} from "../permission/policy.ts";

/** The project's config file, read only from the run's base commit, at the repo's top level. */
export const CONFIG_FILE = "helmwright.config.json";
/** The largest config file read (256 KiB). */
export const MAX_CONFIG_BYTES = 262_144;
/** The bound on one git call; `worktree add` (a checkout) gets GIT_CHECKOUT_TIMEOUT_MS. */
export const GIT_TIMEOUT_MS = 30_000;
export const GIT_CHECKOUT_TIMEOUT_MS = 120_000;
/**
 * Before every git subcommand: no repo hooks and no fsmonitor (each would run a program
 * on the host, outside the sandbox), no LFS download, no replace objects.
 */
const GIT_SAFETY: readonly string[] = [
  ...["-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false"],
  ...["-c", "filter.lfs.smudge=", "-c", "filter.lfs.process="],
  ...["-c", "filter.lfs.required=false", "--no-replace-objects"],
];
/** Set after every inherited GIT_* variable is removed. */
const GIT_ENV = {
  GIT_TERMINAL_PROMPT: "0",
  GIT_NO_LAZY_FETCH: "1",
  GIT_NO_REPLACE_OBJECTS: "1",
  GIT_LFS_SKIP_SMUDGE: "1",
  GIT_CONFIG_NOSYSTEM: "1",
};

/** A git call outlived its bound; its message is fixed text. */
class GitTimeoutError extends Error {}

/**
 * Runs `git -C repo <safety options> ...args` and returns its stdout. No inherited
 * GIT_* variable (GIT_DIR, GIT_CONFIG_PARAMETERS, ...) reaches git, so it reads `repo`
 * and the owner's own config. The repo's .git/config and the user's global config are
 * trusted: a filter driver they define can still run during a checkout.
 * @throws Error with fixed text after `timeoutMs` (default GIT_TIMEOUT_MS); else
 * execFileSync's error.
 */
export function runGit(
  repo: string,
  args: readonly string[],
  options: {
    readonly maxBuffer?: number | undefined;
    readonly timeoutMs?: number;
  } = {},
): Buffer {
  const { maxBuffer = 65_536, timeoutMs = GIT_TIMEOUT_MS } = options;
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
  );
  try {
    return execFileSync("git", ["-C", repo, ...GIT_SAFETY, ...args], {
      env: { ...env, ...GIT_ENV },
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer,
      timeout: timeoutMs,
      killSignal: "SIGKILL",
    });
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (code !== "ETIMEDOUT") throw error;
    const what = `git ${args[0] ?? ""} timed out after ${String(timeoutMs)} ms`;
    throw new GitTimeoutError(what);
  }
}

/** The run's config could not be loaded or is not admitted (the run is refused). */
export class ConfigError extends Error {
  /** N3: never a cause, which could hold git's raw output or unescaped text. */
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/** What `run.started` records about the config. */
export interface ConfigRecord {
  /** "file" if the base commit has a helmwright.config.json, else "default". */
  readonly source: "file" | "default";
  /** sha256 (hex) of the file's raw bytes, or of the canonical JSON of CONFIG_DEFAULTS. */
  readonly sha256: string;
  /**
   * sha256 (hex) of the canonical JSON of the Ring 0 settings after defaults are
   * applied: `{format: RING0_FORMAT}` plus each RING0_CONFIG_KEYS name, `permissions`
   * with its resolved policy. A change to the harness's default policy (or to a
   * default Ring 0 setting) changes it too.
   */
  readonly ring0Sha256: string;
}

export interface RunConfig {
  /** The repo's HEAD commit: the run's worktree and its config both come from it. */
  readonly baseCommit: string;
  /** DEFAULT_PERMISSION_POLICY, or the config's stricter override. */
  readonly policy: PermissionPolicy;
  readonly record: ConfigRecord;
  /** The object hashed for `record.ring0Sha256`. */
  readonly ring0: Readonly<Record<string, unknown>>;
  /** S1: the realpath of the repo's common git dir, shared by its linked worktrees. */
  readonly repoId: string;
  /**
   * S1: whether a commit up to the base commit touched the config file, or the clone
   * is shallow. N-b: the git calls run on the first call only, and only `ring0Status`
   * makes it, without a baseline. @throws ConfigError if git fails
   */
  readonly configHistory: () => boolean;
}

/** The version of the object hashed for `ring0Sha256`. */
export const RING0_FORMAT = "ring0/v1";
const OID = /^[0-9a-f]{40}$|^[0-9a-f]{64}$/;
const MODES = new Map([
  ["100755", "an executable file"],
  ["120000", "a symbolic link"],
  ["040000", "a directory"],
  ["160000", "a submodule"],
]);
/** Keys that name prototype machinery; refused at any level. */
const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);
const POLICY_SETTING = "permissions.policy";

const sha256 = (data: string | Uint8Array) =>
  createHash("sha256").update(data).digest("hex");
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const git = (repo: string, args: readonly string[], maxBuffer?: number) =>
  runGit(repo, ["--literal-pathspecs", ...args], { maxBuffer });

/** The index past the closing quote of the JSON string that starts at `start`. */
function stringEnd(text: string, start: number): number {
  let i = start + 1;
  while (i < text.length && text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
  return i + 1;
}

/** The first duplicate or forbidden object key in `text`, which is valid JSON. */
function keyProblem(text: string): string | undefined {
  // One entry per open container: an object's keys so far, or undefined for an array.
  const open: (Set<string> | undefined)[] = [];
  let keyNext = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const keys = open.at(-1);
    if (c === '"') {
      const end = stringEnd(text, i);
      if (keyNext && keys !== undefined) {
        const key = JSON.parse(text.slice(i, end)) as string;
        const shown = displayText(JSON.stringify(key));
        if (FORBIDDEN.has(key)) return `forbidden key ${shown}`;
        if (keys.has(key)) return `duplicate key ${shown}`;
        keys.add(key);
        keyNext = false;
      }
      i = end;
      continue;
    }
    // Only structure moves the state; whitespace and literals leave it.
    if (c === "{" || c === "[") {
      open.push(c === "{" ? new Set() : undefined);
      keyNext = c === "{";
    } else if (c === "}" || c === "]" || c === ":") {
      if (c !== ":") open.pop();
      keyNext = false;
    } else if (c === ",") {
      keyNext = keys !== undefined;
    }
    i += 1;
  }
  return undefined;
}

/** The first setting whose value is not its default (07 rule 1); the policy is checked apart. */
function notAdmitted(
  value: unknown,
  defaults: unknown,
  name: string,
): string | undefined {
  if (name === POLICY_SETTING) return undefined;
  if (isRecord(value) && isRecord(defaults)) {
    const known = new Map(Object.entries(defaults));
    for (const [key, inner] of Object.entries(value)) {
      const setting = name === "" ? key : `${name}.${key}`;
      const found = notAdmitted(inner, known.get(key), setting);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (value === defaults) return undefined;
  const shown = displayText(`${name} ${canonical(value)}`);
  return `${shown} is not admitted: no fixture (07 rule 1)`;
}

function schemaProblem(): string {
  const issue = validateHelmwrightConfig.errors?.[0];
  if (issue === undefined) return "does not match its schema";
  const where = issue.instancePath === "" ? "/" : issue.instancePath;
  const extra: unknown = issue.params["additionalProperty"];
  const what =
    issue.keyword === "additionalProperties" && typeof extra === "string"
      ? `unknown key ${JSON.stringify(extra)}`
      : (issue.message ?? issue.keyword);
  return displayText(`${where} ${what}`);
}

/** The policy and Ring 0 digest of an admitted config's `permissions.policy` (or none). */
function settle(policyOverride: unknown): {
  policy: PermissionPolicy;
  ring0Sha256: string;
  ring0: Readonly<Record<string, unknown>>;
} {
  let policy = DEFAULT_PERMISSION_POLICY;
  if (policyOverride !== undefined) {
    try {
      policy = resolvePolicy(DEFAULT_PERMISSION_POLICY, policyOverride);
    } catch (error) {
      const why = displayText(errorMessage(error));
      throw new ConfigError(`${CONFIG_FILE}: ${POLICY_SETTING}: ${why}`);
    }
  }
  // Every other present setting equals its default, so this is the whole config.
  const effective: unknown = {
    ...CONFIG_DEFAULTS,
    permissions: { ...CONFIG_DEFAULTS.permissions, policy },
  };
  const ring0 = RING0_CONFIG_KEYS.map((key) => {
    const value = key
      .split(".")
      .reduce<unknown>(
        (v, part) =>
          isRecord(v) ? new Map(Object.entries(v)).get(part) : undefined,
        effective,
      );
    return [key, value] as const;
  });
  const object = { format: RING0_FORMAT, ...Object.fromEntries(ring0) };
  // N3: a change that cannot be shown in full could never be approved.
  if (!RING0_CONFIG_KEYS.every((key) => fitsAsk(key, object))) {
    throw new ConfigError(
      `${CONFIG_FILE}: Ring 0 configuration is too large to approve`,
    );
  }
  return { policy, ring0Sha256: sha256(canonical(object)), ring0: object };
}

/** Validates and admits the file's raw bytes. @throws ConfigError */
function admit(bytes: Uint8Array): unknown {
  const fail = (problem: string) =>
    new ConfigError(`${CONFIG_FILE}: ${problem}`);
  let text: string;
  try {
    // ignoreBOM keeps a byte order mark, which JSON.parse then refuses.
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    throw fail("is not valid UTF-8");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // The parser's message can quote the file, so it is not shown.
    throw fail("is not valid JSON");
  }
  const problem =
    keyProblem(text) ??
    (validateHelmwrightConfig(parsed) ? undefined : schemaProblem()) ??
    notAdmitted(parsed, CONFIG_DEFAULTS, "");
  if (problem !== undefined) throw fail(problem);
  return parsed;
}

/**
 * Resolves the repo's HEAD commit and loads `helmwright.config.json` from that commit
 * only: another branch's file or an uncommitted one is never read. Absent, every
 * setting takes its default. Present, it must be a regular non-executable file (git
 * mode 100644) of at most MAX_CONFIG_BYTES, strict UTF-8 JSON with no duplicate key
 * and no `__proto__`, `constructor` or `prototype` key at any level, valid against
 * its schema, with every setting at its default (07 rule 1) except
 * `permissions.policy`, which may only make the default policy stricter.
 * Every git call goes through `runGit`.
 * @throws ConfigError naming the file (or HEAD) and the first problem, escaped; it
 * never quotes the file's raw content.
 */
export function loadRunConfig(repo: string): RunConfig {
  let baseCommit: string;
  try {
    const args = ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"];
    baseCommit = git(repo, args).toString("utf8").trim();
  } catch (error) {
    if (error instanceof GitTimeoutError) throw new ConfigError(error.message);
    throw new ConfigError("task.repo has no commit at HEAD");
  }
  if (!OID.test(baseCommit)) {
    throw new ConfigError("task.repo has no commit at HEAD");
  }
  const read = (args: readonly string[], max?: number) => {
    try {
      return git(repo, args, max);
    } catch (error) {
      const why = displayText(errorMessage(error));
      throw new ConfigError(`${CONFIG_FILE}: cannot read: ${why}`);
    }
  };
  const common = read(["rev-parse", "--git-common-dir"]).toString("utf8");
  const repoId = realpathSync(resolve(repo, common.trim()));
  const log = ["log", "-1", "--format=%H", baseCommit, "--", CONFIG_FILE];
  let history: boolean | undefined;
  const configHistory = (): boolean => {
    // Owner 2026-10-07: a shallow clone hides the file's history, so it counts as history.
    history ??=
      read(["rev-parse", "--is-shallow-repository"]).toString("utf8").trim() ===
        "true" || read(log).toString("utf8").trim() !== "";
    return history;
  };
  const lsTree = ["ls-tree", "-z", "--full-tree", baseCommit, "--"];
  const entries = read([...lsTree, CONFIG_FILE])
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  if (entries.length === 0) {
    const { policy, ring0Sha256, ring0 } = settle(undefined);
    const sha = sha256(canonical(CONFIG_DEFAULTS));
    const record = { source: "default", sha256: sha, ring0Sha256 } as const;
    return { baseCommit, policy, record, ring0, repoId, configHistory };
  }
  const [entry = ""] = entries;
  const tab = entry.indexOf("\t");
  const [mode = "", type, oid = ""] = entry.slice(0, tab).split(" ");
  if (
    entries.length !== 1 ||
    entry.slice(tab + 1) !== CONFIG_FILE ||
    mode !== "100644" ||
    type !== "blob" ||
    !OID.test(oid)
  ) {
    const kind = MODES.get(mode) ?? "an unexpected entry";
    throw new ConfigError(
      `${CONFIG_FILE}: must be a regular file (git mode 100644), not ${kind} (${displayText(mode)})`,
    );
  }
  const size = Number(read(["cat-file", "-s", oid]).toString("utf8").trim());
  if (!Number.isSafeInteger(size) || size > MAX_CONFIG_BYTES) {
    throw new ConfigError(
      `${CONFIG_FILE}: is ${String(size)} bytes, over the ${String(MAX_CONFIG_BYTES)}-byte limit`,
    );
  }
  const bytes = read(["cat-file", "blob", oid], MAX_CONFIG_BYTES + 1);
  if (bytes.length !== size) {
    throw new ConfigError(`${CONFIG_FILE}: changed size while being read`);
  }
  const parsed = admit(bytes);
  const permissions = isRecord(parsed) ? parsed["permissions"] : undefined;
  const override = isRecord(permissions) ? permissions["policy"] : undefined;
  const { policy, ring0Sha256, ring0 } = settle(override);
  const record = {
    source: "file",
    sha256: sha256(bytes),
    ring0Sha256,
  } as const;
  return { baseCommit, policy, record, ring0, repoId, configHistory };
}

/** OQ1: the event that records a repo's accepted Ring 0 config. */
export const CONFIG_ACCEPTED = "config.accepted";
const DIGEST = /^[0-9a-f]{64}$/;

/** The sha256 of each Ring 0 setting's canonical value, by RING0_CONFIG_KEYS name. */
export function ring0SettingDigests(
  ring0: Readonly<Record<string, unknown>>,
): Record<string, string> {
  const values = new Map(Object.entries(ring0));
  return Object.fromEntries(
    RING0_CONFIG_KEYS.map((key) => [key, sha256(canonical(values.get(key)))]),
  );
}

/** How a run's Ring 0 config compares with the last one accepted for its repo. */
export type Ring0Status =
  | { readonly kind: "unchanged" }
  /** No baseline, no config history, and the config is the defaults: accepted silently. */
  | { readonly kind: "default" }
  | {
      readonly kind: "changed";
      /** The baseline digest it differs from (the defaults' if there is none). */
      readonly from: string;
      /** The Ring 0 settings that differ, in RING0_CONFIG_KEYS order; never empty. */
      readonly changed: readonly string[];
      /** Fixed text when there is no valid accepted baseline. */
      readonly note?: string;
    };

const BASELINE_HOW: ReadonlySet<unknown> = new Set(["default", "approved"]);

/** N1: whether a run's asks and acceptance have no fault; an unreadable run has. */
function clean(log: Pick<SessionLog, "events">, runId: string): boolean {
  try {
    return permissionFaults(log.events({ runId })).length === 0;
  } catch {
    return false; // Fails safe: no baseline, so the config is asked.
  }
}

/**
 * OQ1: compares `config`'s Ring 0 digest with the baseline for `config.repoId`: the
 * latest `config.accepted` with that repo. N-c: each row's parsed `repo` is checked
 * again, as SQLite's json_extract and JSON.parse can read a duplicate key differently.
 * SF-1: only the latest counts; without a known `how` and a digest, or from a run
 * whose asks and acceptance have a fault (N1), it is no baseline and every Ring 0
 * setting is asked, never an older row. Rows of other types are never read (S3).
 * The baseline is scoped to this state dir. With none, the defaults are accepted
 * silently only if the config file has no history (S1); else the config is asked.
 * A change names the settings whose digests differ from the baseline's; if none can
 * be compared, every Ring 0 setting.
 */
export function ring0Status(
  log: Pick<SessionLog, "events">,
  config: Pick<RunConfig, "record" | "ring0" | "repoId" | "configHistory">,
): Ring0Status {
  const query = { type: CONFIG_ACCEPTED, repo: config.repoId };
  const latest = log
    .events(query)
    .findLast(({ payload }) => payload["repo"] === config.repoId);
  const digest: unknown = latest?.payload["ring0Sha256"];
  const valid =
    latest !== undefined &&
    BASELINE_HOW.has(latest.payload["how"]) &&
    typeof digest === "string" &&
    DIGEST.test(digest) &&
    clean(log, latest.runId);
  const defaults = settle(undefined);
  if (latest !== undefined && !valid) {
    const shown = typeof digest === "string" && DIGEST.test(digest);
    return {
      kind: "changed",
      from: shown ? digest : defaults.ring0Sha256,
      changed: [...RING0_CONFIG_KEYS],
      note: "the latest accepted baseline in this state dir is not valid",
    };
  }
  const accepted = latest?.payload;
  const from = (accepted?.["ring0Sha256"] ?? defaults.ring0Sha256) as string;
  const none = accepted === undefined;
  // N-b: the history is read only when it decides the result.
  const same = config.record.ring0Sha256 === from;
  const history = none && same && config.configHistory();
  if (same && !history) return { kind: none ? "default" : "unchanged" };
  const known: unknown = none
    ? ring0SettingDigests(defaults.ring0)
    : accepted["settings"];
  const before = new Map(isRecord(known) ? Object.entries(known) : []);
  const after = new Map(Object.entries(ring0SettingDigests(config.ring0)));
  const changed = RING0_CONFIG_KEYS.filter(
    (key) => before.get(key) !== after.get(key),
  );
  const why = history
    ? "; the config file has history, or the clone is shallow"
    : "";
  return {
    kind: "changed",
    from,
    changed: changed.length === 0 ? [...RING0_CONFIG_KEYS] : changed,
    ...(none ? { note: "no accepted baseline in this state dir" + why } : {}),
  };
}
