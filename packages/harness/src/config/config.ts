import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  CONFIG_DEFAULTS,
  RING0_CONFIG_KEYS,
  validateHelmwrightConfig,
  type PermissionPolicy,
} from "@helmwright/schema";
import { errorMessage } from "../loop/terminal.ts";
import {
  DEFAULT_PERMISSION_POLICY,
  canonical,
  displayText,
  resolvePolicy,
} from "../permission/policy.ts";

/** The project's config file, read only from the run's base commit, at the repo's top level. */
export const CONFIG_FILE = "helmwright.config.json";
/** The largest config file read (256 KiB). */
export const MAX_CONFIG_BYTES = 262_144;
/** No repo hooks: a hook would run on the host, outside the sandbox. */
export const NO_HOOKS: readonly string[] = ["-c", "core.hooksPath=/dev/null"];

/** The run's config could not be loaded or is not admitted (the run is refused). */
export class ConfigError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
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
   * applied: an object keyed by each RING0_CONFIG_KEYS name, `permissions` with its
   * resolved policy.
   */
  readonly ring0Sha256: string;
}

export interface RunConfig {
  /** The repo's HEAD commit: the run's worktree and its config both come from it. */
  readonly baseCommit: string;
  /** DEFAULT_PERMISSION_POLICY, or the config's stricter override. */
  readonly policy: PermissionPolicy;
  readonly record: ConfigRecord;
}

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

function git(repo: string, args: readonly string[], maxBuffer = 65_536) {
  return execFileSync(
    "git",
    ["-C", repo, ...NO_HOOKS, "--literal-pathspecs", ...args],
    { stdio: ["ignore", "pipe", "pipe"], maxBuffer },
  );
}

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
} {
  let policy = DEFAULT_PERMISSION_POLICY;
  if (policyOverride !== undefined) {
    try {
      policy = resolvePolicy(DEFAULT_PERMISSION_POLICY, policyOverride);
    } catch (error) {
      const why = displayText(errorMessage(error));
      throw new ConfigError(`${CONFIG_FILE}: ${POLICY_SETTING}: ${why}`, {
        cause: error,
      });
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
  return { policy, ring0Sha256: sha256(canonical(Object.fromEntries(ring0))) };
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
 * Every git call runs without repo hooks.
 * @throws ConfigError naming the file (or HEAD) and the first problem, escaped; it
 * never quotes the file's raw content.
 */
export function loadRunConfig(repo: string): RunConfig {
  let baseCommit: string;
  try {
    const args = ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"];
    baseCommit = git(repo, args).toString("utf8").trim();
  } catch (error) {
    throw new ConfigError("task.repo has no commit at HEAD", { cause: error });
  }
  if (!OID.test(baseCommit)) {
    throw new ConfigError("task.repo has no commit at HEAD");
  }
  const read = (args: readonly string[], max?: number) => {
    try {
      return git(repo, args, max);
    } catch (error) {
      const why = displayText(errorMessage(error));
      throw new ConfigError(`${CONFIG_FILE}: cannot read: ${why}`, {
        cause: error,
      });
    }
  };
  const lsTree = [
    "ls-tree",
    "-z",
    "--full-tree",
    baseCommit,
    "--",
    CONFIG_FILE,
  ];
  const entries = read(lsTree).toString("utf8").split("\0").filter(Boolean);
  if (entries.length === 0) {
    const { policy, ring0Sha256 } = settle(undefined);
    const sha = sha256(canonical(CONFIG_DEFAULTS));
    const record = { source: "default", sha256: sha, ring0Sha256 } as const;
    return { baseCommit, policy, record };
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
  const { policy, ring0Sha256 } = settle(override);
  const record = {
    source: "file",
    sha256: sha256(bytes),
    ring0Sha256,
  } as const;
  return { baseCommit, policy, record };
}
