import { lstatSync, readlinkSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, posix, resolve } from "node:path";
import { domainToASCII } from "node:url";
import { CONTAINER_PATH, contains, futureRealpath } from "../sandbox/docker.ts";

/**
 * A permission target path. Not kernel-equivalent: the input's `..` is collapsed
 * lexically before symlinks are followed, so `link/..` is the worktree, not the link
 * target's parent (a link target's `..` is resolved as the kernel does).
 * Callers MUST act on `real`, never on the input.
 */
export interface NormalizedPath {
  /** Host path: the realpath of the nearest existing ancestor plus the missing rest. */
  readonly real: string;
  /** `real` relative to the worktree realpath, if it is the worktree or below (`.git` too). */
  readonly relative: string | undefined;
  /** See `isInsideWorktree`. */
  readonly inside: boolean;
}

/** True if `text` has a C0 or C1 control character (NUL included) or DEL. */
export function hasControl(text: string, allowed = ""): boolean {
  // Every control character is a single UTF-16 code unit, so code units are enough here.
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    const control = code < 0x20 || (code >= 0x7f && code <= 0x9f);
    if (control && !allowed.includes(text.charAt(i))) return true;
  }
  return false;
}

/**
 * Approximate Unicode case folding (`ſ` → `s`, `K` → `k`), for Ring 0 matching. It
 * over-matches (`ı` → `i`, `ß` → `ss`), which is the safe direction.
 */
export const caseFold = (text: string): string =>
  text.toUpperCase().toLowerCase();

/** Unicode format characters (bidi, zero-width, BOM, soft hyphen), line/paragraph separators and lone surrogates. */
export const INVISIBLE = /[\p{Cf}\p{Zl}\p{Zp}\p{Cs}]/u;

/**
 * Resolves `parts` from the directory `start` as the kernel does, one component at a
 * time: each symlink is followed (even dangling: a write would follow it), a link
 * target's `..` applies to the directory reached, and an absolute link target equal
 * to or under the sandbox's `/workspace` continues from `worktreeReal`. It stops at
 * the first missing or non-directory component and appends the remaining parts.
 * @returns the links followed and the final path (its existing part a realpath), or
 * undefined past 40 links (Linux's limit), if `..` follows a missing or
 * non-directory component, or if a link target's `..` leaves the worktree.
 * @throws an fs error.
 */
export function walkPath(
  start: string,
  parts: readonly string[],
  worktreeReal: string,
): { links: string[]; final: string } | undefined {
  const pending = [...parts];
  const links: string[] = [];
  let current = start;
  // Set by an absolute link target until its first named component.
  let sandboxRoot = false;
  for (let part = pending.shift(); part !== undefined; part = pending.shift()) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      // Only link targets bring `..` here (the input is normalized first). One that leaves
      // the worktree reaches `/` in the sandbox, where `workspace` is the worktree again,
      // but the host's parent here: the two views differ, so the path does not resolve.
      const up = dirname(current);
      if (contains(worktreeReal, current) && !contains(worktreeReal, up)) {
        return undefined;
      }
      current = up;
      continue;
    }
    if (sandboxRoot && part === CONTAINER_PATH.slice(1)) {
      [current, sandboxRoot] = [worktreeReal, false];
      continue;
    }
    sandboxRoot = false;
    const next = join(current, part);
    const stat = lstatSync(next, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink() === true) {
      if (links.length >= 40) return undefined;
      links.push(next);
      const target = readlinkSync(next);
      pending.unshift(...target.split("/"));
      if (isAbsolute(target)) [current, sandboxRoot] = ["/", true];
    } else if (stat?.isDirectory() === true) {
      current = next;
    } else {
      if (pending.includes("..")) return undefined;
      return { links, final: futureRealpath(join(next, ...pending)) };
    }
  }
  return { links, final: futureRealpath(current) };
}

/** Strictly inside the worktree realpath, and not in a `.git` directory or file. */
export function isInsideWorktree(real: string, worktreeReal: string): boolean {
  if (real === worktreeReal || !contains(worktreeReal, real)) return false;
  const segments = posix.relative(worktreeReal, real).split("/");
  return !segments.some((segment) => caseFold(segment) === ".git");
}

/**
 * Normalizes a path from an action's input: rejects NUL and control characters,
 * composes NFC, resolves `.` and `..`, maps the sandbox's `/workspace` onto the
 * worktree (relative paths are worktree-relative), then resolves symlinks as above.
 * Callers must act on `real`, not on the input.
 * @throws TypeError on an empty or invalid path (control or format characters, over
 * 4096 characters or a segment over 255), a symlink loop, or a link target's `..`
 * after a missing component. It may also throw a
 * filesystem error (EACCES, ENAMETOOLONG, or a race); callers must treat any throw
 * as deny. The worktree must exist.
 */
export function normalizePath(input: string, worktree: string): NormalizedPath {
  if (
    typeof input !== "string" ||
    input === "" ||
    hasControl(input) ||
    INVISIBLE.test(input)
  ) {
    throw new TypeError("path must be non-empty, without control characters");
  }
  if (input.length > 4096 || input.split("/").some((s) => s.length > 255)) {
    throw new TypeError("path or path segment too long");
  }
  const worktreeReal = realpathSync.native(worktree);
  // Normalize before mapping, so /workspace/../workspace/x is the worktree's x.
  const path = posix.normalize(input.normalize("NFC"));
  const mapped =
    path === CONTAINER_PATH || path.startsWith(CONTAINER_PATH + "/");
  const host = mapped
    ? join(worktreeReal, path.slice(CONTAINER_PATH.length))
    : resolve(worktreeReal, path);
  const real = walkPath("/", host.split("/"), worktreeReal)?.final;
  if (real === undefined) throw new TypeError("path does not resolve");
  // A harmless input can resolve through a symlink to a name that spoofs the prompt.
  if (hasControl(real) || INVISIBLE.test(real)) {
    throw new TypeError("resolved path has control or invisible characters");
  }
  const within = contains(worktreeReal, real);
  return {
    real,
    relative: within ? posix.relative(worktreeReal, real) : undefined,
    inside: isInsideWorktree(real, worktreeReal),
  };
}

/** Matches one segment against a glob segment whose only wildcard is `*`, in linear time (no ReDoS). */
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

/**
 * True if a worktree-relative path matches one of the Ring 0 globs, case-folded.
 * `*` stays within a segment; a final `/**` matches the directory and everything below.
 * @throws TypeError if `relative` is not canonical: absolute, or with an empty, `.` or `..` segment.
 */
export function isRing0Path(relative: string, globs: readonly string[]) {
  const parts = relative.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new TypeError("Ring 0 path must be canonical and worktree-relative");
  }
  const segments = caseFold(relative).split("/");
  return globs.some((glob) => {
    const patterns = caseFold(glob).split("/");
    const below = patterns.at(-1) === "**";
    if (below) patterns.pop();
    const length = below ? patterns.length : segments.length;
    return (
      segments.length >= patterns.length &&
      patterns.length === length &&
      patterns.every((pattern, i) => segmentMatches(pattern, segments[i] ?? ""))
    );
  });
}

/** Wrappers that run their operands as a command, with their options that take a value. */
const WRAPPERS: Readonly<Record<string, string>> = {
  env: "-u -C -S --unset --chdir --split-string",
  command: "",
  exec: "-a",
  nice: "-n --adjustment",
  timeout: "-s -k --signal --kill-after",
  nohup: "",
  time: "-f -o --format --output",
  corepack: "",
};
const SHELLS = new Set(["sh", "bash", "dash", "zsh", "ksh", "ash"]);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
/** env's `-S STRING` (also clustered, as `-iS`), `-SSTRING` and `--split-string[=STRING]`. */
const SPLIT = /^(?:-[i0v]*S(.+)?|--split-string(?:=(.*))?)$/s;

/** Strips wrappers and `VAR=value` prefixes; argv[0] becomes its basename. */
function unwrap(argv: readonly string[]): string[] {
  let rest = [...argv];
  for (;;) {
    while (rest[0] !== undefined && ASSIGNMENT.test(rest[0])) rest.shift();
    const name = basename(rest[0] ?? "");
    if (!Object.hasOwn(WRAPPERS, name))
      return rest.length ? [name, ...rest.slice(1)] : [];
    const valued = (WRAPPERS[name] ?? "").split(" ");
    let i = 1;
    for (; i < rest.length; i++) {
      const arg = rest[i] ?? "";
      if (arg === "--") {
        i++;
        break;
      }
      if (name === "env" && (ASSIGNMENT.test(arg) || arg === "-")) continue;
      const split = name === "env" ? SPLIT.exec(arg) : null;
      if (split !== null) {
        // As env does: the split words replace the option and are parsed in its place.
        const attached = split[1] ?? split[2];
        const value = attached ?? rest[i + 1] ?? "";
        const words = value.replace(/["'\\]/g, "").split(/\s+/);
        rest.splice(
          i,
          attached === undefined ? 2 : 1,
          ...words.filter(Boolean),
        );
        i--;
        continue;
      }
      if (!arg.startsWith("-") || arg === "-") break;
      if (valued.includes(arg)) i++;
    }
    // timeout's DURATION operand precedes the command.
    rest = rest.slice(name === "timeout" ? i + 1 : i);
  }
}

/**
 * Splits argv into the simple commands it runs, for dependency-install detection:
 * wrappers stripped, `sh -c` scripts (up to 8 deep) split on whitespace and
 * `;&|()`{}`. Advisory only: the sandbox's lack of network and the manifest diff
 * are authoritative.
 */
export function normalizeArgv(argv: readonly string[], depth = 0): string[][] {
  const command = unwrap(argv);
  const flag = command.findIndex(
    (a, i) => i > 0 && /^-[A-Za-z]*c[A-Za-z]*$/.test(a),
  );
  if (!SHELLS.has(command[0] ?? "") || flag === -1 || depth >= 8) {
    return [command];
  }
  const operands = command.slice(flag + 1);
  while (operands[0]?.startsWith("-") === true) operands.shift();
  // Positional parameters are joined in too: over-inclusive is the safe side.
  return operands
    .join(" ")
    .split(/[;&|()`{}\n]/)
    .map((part) => part.split(/\s+/).map((t) => t.replace(/["'\\]/g, "")))
    .map((tokens) => tokens.filter((token) => token !== ""))
    .filter((tokens) => tokens.length > 0)
    .flatMap((tokens) => normalizeArgv(tokens, depth + 1));
}

/** Each package manager's add, install and update verbs (with npm's aliases and typos). */
// A Map, so command names such as `toString` or `__proto__` find nothing.
const INSTALL_VERBS: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  Object.entries({
    npm: `ins inst insta instal isnt isnta isntal isntall it cit ic clean-install
      install-clean install-test update udpate up upgrade`,
    pnpm: "update up upgrade",
    yarn: "up upgrade",
    bun: "a",
  }).map(([manager, verbs]) => [
    manager,
    new Set(`add i in install isntall ci ${verbs}`.split(/\s+/)),
  ]),
);

/** True if any command in argv runs a package manager's add, install or update. */
export function isDependencyInstall(argv: readonly string[]): boolean {
  return normalizeArgv(argv).some(([head = "", ...rest]) => {
    // corepack runs `pnpm@10.0.0` as pnpm.
    const manager = head.replace(/@.*$/s, "");
    const verbs = INSTALL_VERBS.get(manager);
    // Bare `yarn` installs; an install verb anywhere counts, even after options.
    return (
      verbs !== undefined &&
      ((manager === "yarn" && rest.length === 0) ||
        rest.some((arg) => verbs.has(arg)))
    );
  });
}

/**
 * Normalizes a destination host for allowlist comparison: lowercase, IDNA (punycode),
 * numeric IPv4 forms and IPv4-mapped IPv6 (`[::ffff:a9fe:a9fe]`) in dotted decimal
 * (2852039166 → 169.254.169.254), IPv6 compressed, no trailing dot. Undefined if it
 * is not a bare host (no port, path, user or `%`) or has an empty label.
 */
export function normalizeHost(host: string): string | undefined {
  if (typeof host !== "string" || hasControl(host)) return undefined;
  const bracketed = host.startsWith("[") && host.endsWith("]");
  if (!bracketed && /[\s/\\?#@:%[\]]/.test(host)) return undefined;
  const ascii = domainToASCII(host).toLowerCase().replace(/\.$/, "");
  const mapped = /^\[::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})\]$/.exec(ascii);
  if (mapped !== null) {
    const words = [mapped[1], mapped[2]].map((h) => parseInt(h ?? "", 16));
    return words.flatMap((n) => [n >> 8, n & 255]).join(".");
  }
  if (!bracketed && ascii.split(".").includes("")) return undefined;
  return ascii === "" ? undefined : ascii;
}
