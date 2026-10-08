import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

/** node:26-slim (Node 26.10.0), multi-arch index digest. Has user `node` (uid 1000). */
export const SANDBOX_BASE_IMAGE =
  "node:26-slim@sha256:930557a230abacbc3f4fd9b8648abf8f4bee1e17cb72195dcdfb2f709bc85b33";
/** Build context of the sandbox image: the base without npm/npx. */
export const SANDBOX_DOCKERFILE_DIR = fileURLToPath(
  new URL("../../sandbox", import.meta.url),
);
/**
 * Label key on every sandbox container; its value is this process's instance ID, and
 * `${SANDBOX_LABEL}.owner-pid` holds the owner's pid (see `reapSandboxContainers`).
 */
export const SANDBOX_LABEL = "helmwright.sandbox";
const INSTANCE = randomUUID();
const NAME_PREFIX = "helmwright-sandbox-";
const BUILD_TIMEOUT_MS = 600_000;
export const MAX_SANDBOX_VALUE = 2_147_483_647;
export const DEFAULT_MAX_OUTPUT_BYTES = 1_048_576;
export const MAX_OUTPUT_BYTES = 67_108_864;

export interface SandboxLimits {
  readonly memoryMb: number;
  readonly cpus: number;
  readonly pids: number;
}

export const DEFAULT_SANDBOX_LIMITS: SandboxLimits = {
  memoryMb: 1024,
  cpus: 2,
  pids: 256,
};

export interface SandboxRequest {
  readonly argv: readonly string[];
  /**
   * ID of the hardened image from `buildSandboxImage` (`sha256:<64 hex>`). Tags and registry
   * references are rejected, and `--pull=never` keeps Docker from fetching anything.
   */
  readonly image: string;
  /**
   * Absolute host directory, not itself a symlink, whose realpath must be strictly inside
   * `workspaceRoot`'s realpath; it is mounted read-write at /workspace. The container can
   * plant symlinks there: callers must read its outputs without following symlinks
   * (lstat / O_NOFOLLOW), or they may read or overwrite host files.
   */
  readonly workspace: string;
  /** Absolute host directory that confines `workspace`. */
  readonly workspaceRoot: string;
  readonly timeoutMs: number;
  /**
   * The container's only variables besides the image's. Host env never passes through, and
   * credential-shaped names (…TOKEN, …SECRET, AWS_…, …) are rejected.
   */
  readonly env?: Readonly<Record<string, string>>;
  readonly limits?: SandboxLimits;
  /** Per-stream capture bound; the head is kept. Default 1 MiB, at most 64 MiB. */
  readonly maxOutputBytes?: number;
  readonly signal?: AbortSignal;
}

export interface SandboxResult {
  /** Null when the run timed out, was cancelled, or the docker client died by a signal. */
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly stdoutTruncated: boolean;
  readonly stderrTruncated: boolean;
  /** Either stream was truncated. */
  readonly truncated: boolean;
  readonly timedOut: boolean;
  readonly cancelled: boolean;
  /** Exit 126/127: the program could not be executed (or itself exited so). */
  readonly startFailed: boolean;
  /** After a timeout, cancel or client signal, the container was not confirmed removed. */
  readonly cleanupFailed: boolean;
  readonly containerName: string;
  readonly durationMs: number;
}

export interface SandboxDeps {
  /** Docker CLI executable. Default "docker". */
  readonly dockerBinary?: string;
  /** Source of the client's PATH and of the endpoint lookup. Default process.env. */
  readonly hostEnv?: Readonly<Record<string, string | undefined>>;
  /** Default `helmwright-sandbox-<uuid>`. */
  readonly containerName?: string;
  /**
   * Daemon endpoint, which must be `unix://`. Default: `resolveDockerEndpoint` with the
   * first caller's deps, once per process.
   */
  readonly resolveEndpoint?: () => Promise<string>;
  /** Bound on each docker cleanup command and on the client's exit. Default 10 s. */
  readonly cleanupTimeoutMs?: number;
  /** Bound on `buildSandboxImage`. Default 10 min. */
  readonly buildTimeoutMs?: number;
}

export const CONTAINER_PATH = "/workspace";
const ENV_KEY = /^[A-Z_][A-Z0-9_]*$/;
const CREDENTIAL_KEY =
  /(TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|API_KEY|PRIVATE_KEY)|^(AWS|ANTHROPIC|GITHUB|GH|NPM|OPENAI)_/;
/** True if an env-style key name looks like a credential (shared with the exfiltration guard). */
export const isCredentialKey = (name: string): boolean =>
  CREDENTIAL_KEY.test(name);
const CONTAINER_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
const CLEANUP_MS = 10_000;
/** After SIGKILL, how long to wait for the client to exit. */
const KILL_SETTLE_MS = 2_000;
const MESSAGE_CHARS = 4_096;

const fail = (field: string, problem: string): RangeError =>
  new RangeError(`SandboxRequest.${field} ${problem}`);

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const bounded = (text: string): string => text.trim().slice(0, MESSAGE_CHARS);

function checkInteger(
  field: string,
  value: number,
  min: number,
  max = MAX_SANDBOX_VALUE,
): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw fail(
      field,
      `must be an integer in [${String(min)}, ${String(max)}], got ${String(value)}`,
    );
  }
}

function checkArgv(argv: readonly string[]): void {
  if (!Array.isArray(argv) || argv.length === 0) {
    throw new TypeError("SandboxRequest.argv must be a non-empty array");
  }
  argv.forEach((arg: unknown, i) => {
    if (typeof arg !== "string" || arg.includes("\0") || (i === 0 && !arg)) {
      throw new TypeError(
        `SandboxRequest.argv[${String(i)}] must be a string without NUL (argv[0] non-empty)`,
      );
    }
  });
}

/** True if `path` is `dir` or inside it (both realpaths). */
export const contains = (dir: string, path: string): boolean =>
  path === dir || path.startsWith(dir.endsWith(sep) ? dir : dir + sep);

/** Realpath of `path`'s nearest existing ancestor, with the missing rest appended. */
export function futureRealpath(path: string): string {
  const rest: string[] = [];
  let existing = resolve(path);
  while (!existsSync(existing) && dirname(existing) !== existing) {
    rest.unshift(basename(existing));
    existing = dirname(existing);
  }
  return join(realpathSync.native(existing), ...rest);
}

/** Returns the realpath of an existing absolute directory, or throws. */
function realDirectory(field: string, path: string): string {
  if (typeof path !== "string" || path.includes("\0")) {
    throw new TypeError(`SandboxRequest.${field} must be a string without NUL`);
  }
  if (!isAbsolute(path)) throw fail(field, "must be absolute");
  let real: string;
  try {
    real = realpathSync.native(path);
  } catch {
    throw fail(field, `does not exist: ${path}`);
  }
  if (!statSync(real).isDirectory()) {
    throw fail(field, `is not a directory: ${real}`);
  }
  return real;
}

/** Returns the workspace realpath, or throws. */
function resolveWorkspace(workspace: string, workspaceRoot: string): string {
  const real = realDirectory("workspace", workspace);
  if (lstatSync(workspace).isSymbolicLink()) {
    throw fail("workspace", `must not be a symlink: ${workspace}`);
  }
  checkWorkspacePaths(real, realDirectory("workspaceRoot", workspaceRoot));
  return real;
}

/**
 * The sandbox's rules for a workspace and its root, given their realpaths (which
 * need not exist yet). @throws RangeError
 */
export function checkWorkspacePaths(real: string, root: string): void {
  let home = homedir();
  try {
    home = realpathSync.native(home);
  } catch {
    // A missing home still compares as given.
  }
  if (root === "/" || contains(root, home)) {
    throw fail("workspaceRoot", `must not be /, home or its ancestor: ${root}`);
  }
  if (real === root || !contains(root, real)) {
    throw fail("workspace", `must be strictly inside ${root}: ${real}`);
  }
  // --mount is CSV-parsed: these characters could inject mount options.
  if (/[,"'\n\r]/.test(real)) {
    throw fail("workspace", `path must not contain , " ' or newlines: ${real}`);
  }
}

function checkEnv(env: Readonly<Record<string, string>>): [string, string][] {
  const entries = Object.entries(env);
  for (const [key, value] of entries) {
    if (!ENV_KEY.test(key)) {
      throw fail("env", `key must match ${String(ENV_KEY)}, got ${key}`);
    }
    if (CREDENTIAL_KEY.test(key)) {
      throw fail("env", `key looks like a credential: ${key}`);
    }
    if (typeof value !== "string" || value.includes("\0")) {
      throw new TypeError(
        `SandboxRequest.env.${key} must be a string without NUL`,
      );
    }
  }
  return entries;
}

function checkLimits(limits: SandboxLimits): void {
  checkInteger("limits.memoryMb", limits.memoryMb, 6);
  checkInteger("limits.pids", limits.pids, 1);
  const { cpus } = limits;
  if (!Number.isFinite(cpus) || cpus < 0.01 || cpus > 1024) {
    throw fail("limits.cpus", `must be in [0.01, 1024], got ${String(cpus)}`);
  }
}

/** The host user as `uid:gid`, so workspace files stay the caller's; never root. */
function hostUser(): string {
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  if (uid === undefined || gid === undefined) return "1000:1000";
  if (uid === 0 || gid === 0) {
    throw new Error("sandbox refuses to run as root (uid or gid 0)");
  }
  return `${String(uid)}:${String(gid)}`;
}

/**
 * Validates `request` and builds the `docker run` argv. No side effects
 * beyond reading the filesystem to resolve the workspace.
 * @throws RangeError | TypeError for an invalid request or container name;
 * Error when the harness itself runs as root.
 */
export function dockerRunArgs(
  request: SandboxRequest,
  containerName: string,
): string[] {
  return runArgs(request, containerName).args;
}

function runArgs(request: SandboxRequest, containerName: string) {
  checkArgv(request.argv);
  const { image } = request;
  if (typeof image !== "string" || !/^sha256:[0-9a-f]{64}$/.test(image)) {
    throw fail(
      "image",
      "must be an image ID (sha256:<64 hex>) from buildSandboxImage",
    );
  }
  const workspace = resolveWorkspace(request.workspace, request.workspaceRoot);
  checkInteger("timeoutMs", request.timeoutMs, 1);
  checkInteger(
    "maxOutputBytes",
    request.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
    1,
    MAX_OUTPUT_BYTES,
  );
  const limits = request.limits ?? DEFAULT_SANDBOX_LIMITS;
  checkLimits(limits);
  const env = checkEnv(request.env ?? {});
  if (!CONTAINER_NAME.test(containerName)) {
    throw new RangeError(`invalid sandbox container name: ${containerName}`);
  }
  const memory = `${String(limits.memoryMb)}m`;
  const options: (readonly [string, string])[] = [
    ["--name", containerName],
    ["--label", `${SANDBOX_LABEL}=${INSTANCE}`],
    ["--label", `${SANDBOX_LABEL}.owner-pid=${String(process.pid)}`],
    // Never fetch an image, and never run an image-defined entrypoint before argv.
    ["--pull", "never"],
    ["--entrypoint", ""],
    ["--network", "none"],
    ["--ipc", "none"],
    ["--cap-drop", "ALL"],
    ["--security-opt", "no-new-privileges"],
    ["--user", hostUser()],
    ["--pids-limit", String(limits.pids)],
    ["--memory", memory],
    ["--memory-swap", memory],
    ["--cpus", String(limits.cpus)],
    ["--ulimit", "nofile=1024:1024"],
    ["--ulimit", "fsize=1073741824"],
    ["--log-driver", "none"],
    ["--tmpfs", "/tmp:rw,noexec,nosuid,size=64m"],
    ["--mount", `type=bind,src=${workspace},dst=${CONTAINER_PATH}`],
    ["--workdir", CONTAINER_PATH],
    ...env.map(([key, value]) => ["--env", `${key}=${value}`] as const),
  ];
  const args = [
    ...["run", "--rm", "--init", "--read-only"],
    ...options.flat(),
    image,
    ...request.argv,
  ];
  return { args, workspace };
}

/**
 * Just before `docker run`: the workspace must still resolve to the mounted path, and must
 * not contain the endpoint's socket (or a container could drive the daemon).
 */
function recheckWorkspace(
  request: SandboxRequest,
  mounted: string,
  endpoint: string,
): void {
  const now = resolveWorkspace(request.workspace, request.workspaceRoot);
  if (now !== mounted || realpathSync.native(mounted) !== mounted) {
    throw fail("workspace", `changed before the run: ${mounted} -> ${now}`);
  }
  const socket = endpoint.slice("unix://".length);
  const dirs = [dirname(socket)];
  for (const resolve of [
    () => dirname(realpathSync.native(socket)),
    () => realpathSync.native(dirname(socket)),
  ]) {
    try {
      dirs.push(resolve());
    } catch {
      // Unresolvable: the literal path is still compared.
    }
  }
  if (dirs.some((dir) => contains(mounted, dir))) {
    throw fail("workspace", `must not contain the docker endpoint socket`);
  }
}

function checkEndpoint(endpoint: string): string {
  if (!/^unix:\/\/\/[^\0\n]*$/.test(endpoint)) {
    const scheme = /^[a-z][a-z0-9+.-]*:/i.exec(endpoint)?.[0] ?? "no scheme";
    throw new Error(
      `sandbox requires a local unix:// docker endpoint, got ${scheme}`,
    );
  }
  return endpoint;
}

/**
 * The daemon endpoint: DOCKER_HOST if set, else the current docker context's. Rejects
 * anything but `unix://` (tcp://, ssh://, npipe:// …): no remote daemons.
 */
export async function resolveDockerEndpoint(
  deps: Pick<SandboxDeps, "dockerBinary" | "hostEnv"> = {},
): Promise<string> {
  const hostEnv = deps.hostEnv ?? process.env;
  const fromEnv = hostEnv["DOCKER_HOST"];
  if (fromEnv !== undefined && fromEnv !== "") return checkEndpoint(fromEnv);
  const env: Record<string, string> = {};
  for (const key of ["PATH", "HOME", "DOCKER_CONFIG", "DOCKER_CONTEXT"]) {
    const value = hostEnv[key];
    if (value !== undefined) env[key] = value;
  }
  const docker = { binary: deps.dockerBinary ?? "docker", env, ms: CLEANUP_MS };
  const args = ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"];
  return checkEndpoint((await dockerOutput(docker, args)).trim());
}

let defaultEndpoint: Promise<string> | undefined;
let clientHome: string | undefined;

/**
 * The docker client's environment: the host PATH, the given `unix://` endpoint, and a
 * harness-owned HOME/DOCKER_CONFIG (0700, `{}` config), so the user's docker config
 * (credentials, proxies, contexts) never reaches the daemon or the container.
 */
export function dockerClientEnv(
  hostEnv: Readonly<Record<string, string | undefined>>,
  endpoint: string,
): Record<string, string> {
  const host = checkEndpoint(endpoint);
  if (clientHome === undefined) {
    const home = mkdtempSync(join(tmpdir(), "helmwright-docker-"));
    mkdirSync(join(home, ".docker"), { mode: 0o700 });
    writeFileSync(join(home, ".docker", "config.json"), "{}\n", {
      mode: 0o600,
    });
    process.once("exit", () => {
      rmSync(home, { recursive: true, force: true });
    });
    clientHome = home;
  }
  const env: Record<string, string> = {};
  const path = hostEnv["PATH"];
  if (path !== undefined) env["PATH"] = path;
  env["HOME"] = clientHome;
  env["DOCKER_CONFIG"] = join(clientHome, ".docker");
  env["DOCKER_HOST"] = host;
  return env;
}

interface Docker {
  readonly binary: string;
  readonly env: Record<string, string>;
  /** Bound on each cleanup/query command. */
  readonly ms: number;
}

async function dockerContext(deps: SandboxDeps): Promise<Docker> {
  let endpoint: Promise<string>;
  if (deps.resolveEndpoint !== undefined) {
    endpoint = deps.resolveEndpoint();
  } else {
    defaultEndpoint ??= resolveDockerEndpoint(deps).catch((error: unknown) => {
      defaultEndpoint = undefined;
      throw error;
    });
    endpoint = defaultEndpoint;
  }
  return {
    binary: deps.dockerBinary ?? "docker",
    env: dockerClientEnv(deps.hostEnv ?? process.env, await endpoint),
    ms: deps.cleanupTimeoutMs ?? CLEANUP_MS,
  };
}

/**
 * Builds the sandbox image from SANDBOX_DOCKERFILE_DIR (base must be present
 * locally: `--pull=false`). Resolves with the image ID (`sha256:…`).
 * @throws Error if docker is unavailable, the build fails, or it exceeds 10 min.
 */
export async function buildSandboxImage(
  deps: Omit<SandboxDeps, "containerName" | "cleanupTimeoutMs"> = {},
): Promise<string> {
  const docker = await dockerContext(deps);
  const args = ["build", "--quiet", "--pull=false", SANDBOX_DOCKERFILE_DIR];
  const proc = startDocker(docker, args, 65_536);
  const limit = deps.buildTimeoutMs ?? BUILD_TIMEOUT_MS;
  const { promise: killed, resolve: settleKilled } =
    Promise.withResolvers<null>();
  const state = { timedOut: false };
  const timer = setTimeout(() => {
    state.timedOut = true;
    proc.child.kill("SIGKILL");
    // A killed client may leave its pipes open (helpers): settle on exit, bounded.
    void within(proc.exited, KILL_SETTLE_MS).then(() => {
      settleKilled(null);
    });
  }, limit);
  const code = await Promise.race([proc.closed, killed]).finally(() => {
    clearTimeout(timer);
  });
  // Whichever settled first, a fired timer means the build was killed.
  if (state.timedOut) {
    proc.destroy();
    throw new Error(`sandbox image build timed out after ${String(limit)} ms`);
  }
  const id = proc.stdout.text().trim();
  if (code !== 0 || !/^sha256:[0-9a-f]{64}$/.test(id)) {
    const stderr = bounded(proc.stderr.text());
    throw new Error(
      `sandbox image build failed (exit ${String(code)}): ${stderr}`,
    );
  }
  return id;
}

function capture(stream: Readable | null, max: number) {
  const chunks: Buffer[] = [];
  let size = 0;
  let truncated = false;
  stream?.on("data", (chunk: Buffer) => {
    const room = max - size;
    if (chunk.length > room) truncated = true;
    if (room > 0) {
      const head = chunk.subarray(0, room);
      chunks.push(head);
      size += head.length;
    }
  });
  return {
    text: () => Buffer.concat(chunks).toString("utf8"),
    truncated: () => truncated,
  };
}

/** True if `promise` settles within `ms`. Never rejects. */
function within(promise: Promise<unknown>, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(false);
    }, ms);
    const done = () => {
      clearTimeout(timer);
      resolve(true);
    };
    promise.then(done, done);
  });
}

/** Spawns the docker CLI (argv, no shell) with the isolated client env. */
function startDocker(docker: Docker, args: readonly string[], max: number) {
  const child = spawn(docker.binary, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: docker.env,
  });
  const stdout = capture(child.stdout, max);
  const stderr = capture(child.stderr, max);
  const events: Promise<unknown[]> = once(child, "close"); // rejects on "error"
  const closed = events.then(
    ([code]) => (typeof code === "number" ? code : null),
    (error: unknown) => {
      const message = `docker is unavailable: ${messageOf(error)}`;
      throw new Error(message, { cause: error });
    },
  );
  const exited: Promise<unknown> = once(child, "exit").catch(() => undefined);
  const destroy = () => {
    child.stdout.destroy();
    child.stderr.destroy();
  };
  return { child, stdout, stderr, closed, exited, destroy };
}

/** Runs a docker command for its effect, ignoring failure. Bounded. */
async function dockerQuiet(docker: Docker, args: string[]): Promise<void> {
  const proc = startDocker(docker, args, 0);
  if (!(await within(proc.closed, docker.ms))) {
    proc.child.kill("SIGKILL");
    proc.destroy();
  }
}

/**
 * Runs a docker command for its stdout. Bounded; rejects on failure, unless it
 * failed and every stderr line matches `tolerated`.
 */
async function dockerOutput(
  docker: Docker,
  args: string[],
  tolerated?: RegExp,
): Promise<string> {
  const proc = startDocker(docker, args, 1_048_576);
  if (!(await within(proc.closed, docker.ms))) {
    proc.child.kill("SIGKILL");
    proc.destroy();
    throw new Error(`docker ${String(args[0])} timed out`);
  }
  const code = await proc.closed;
  const stderr = proc.stderr.text();
  const lines = stderr.split("\n").filter((l) => l.trim() !== "");
  const benign =
    tolerated !== undefined &&
    lines.length > 0 &&
    lines.every((l) => tolerated.test(l));
  if (code !== 0 && !benign) {
    const why = `exit ${String(code)}: ${bounded(stderr)}`;
    throw new Error(`docker ${String(args[0])} failed (${why})`);
  }
  return proc.stdout.text();
}

/** The exact-name filter for `docker ps`. */
const nameFilter = (name: string) =>
  "name=^/" + name.split(".").join("\\.") + "$";

/** A new sandbox container name, `helmwright-sandbox-<uuid>`. */
export const newSandboxContainerName = (): string => NAME_PREFIX + randomUUID();

/**
 * SF-1: resolves true once one bounded `docker ps -a` lists none of the containers
 * `names` (true at once for none); false if any is listed or docker fails.
 */
export async function sandboxContainersGone(
  names: readonly string[],
  deps: Omit<SandboxDeps, "containerName" | "buildTimeoutMs"> = {},
): Promise<boolean> {
  if (names.length === 0) return true;
  try {
    const docker = await dockerContext(deps);
    const filters = names.flatMap((name) => ["--filter", nameFilter(name)]);
    const out = await dockerOutput(docker, ["ps", "-a", "-q", ...filters]);
    return out.trim() === "";
  } catch {
    return false;
  }
}

/** Kills and removes the container (bounded); resolves true once confirmed gone. */
async function stopContainer(
  docker: Docker,
  name: string,
  client: ReturnType<typeof startDocker>,
): Promise<boolean> {
  await dockerQuiet(docker, ["kill", name]);
  await dockerQuiet(docker, ["rm", "-f", name]);
  if (!(await within(client.closed, docker.ms))) {
    // The container may have been created after the first removal.
    client.child.kill("SIGKILL");
    await dockerQuiet(docker, ["rm", "-f", name]);
    await within(client.exited, KILL_SETTLE_MS);
  }
  client.destroy();
  const filter = nameFilter(name);
  return dockerOutput(docker, ["ps", "-a", "-q", "--filter", filter]).then(
    (out) => out.trim() === "",
    () => false,
  );
}

/** True unless `pid` is certainly not a running process. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

/**
 * Force-removes containers named `helmwright-sandbox-…` and labelled SANDBOX_LABEL whose
 * owner pid no longer runs and, unless `includeOwn` is false, every container of this
 * process's instance (live ones included: call it when none of this process's sandboxes
 * should survive). Pass `includeOwn: false` while other sandboxes of this process may be
 * running. Resolves with how many were removed (by this call or a concurrent one: a
 * container already gone or already being removed counts as reaped). Idempotent.
 * @throws Error if docker cannot list them, or fails to remove one for another reason.
 */
export async function reapSandboxContainers(
  deps: Omit<SandboxDeps, "containerName" | "buildTimeoutMs"> = {},
  { includeOwn = true }: { readonly includeOwn?: boolean } = {},
): Promise<number> {
  const docker = await dockerContext(deps);
  // Docker Go template, built by concatenation so its braces aren't read as JS placeholders.
  const label = (key: string) => '{{.Label "' + key + '"}}';
  const format = [
    "{{.ID}}",
    "{{.Names}}",
    label(SANDBOX_LABEL),
    label(SANDBOX_LABEL + ".owner-pid"),
  ].join("\t");
  const out = await dockerOutput(docker, [
    ...["ps", "-a", "--filter", `label=${SANDBOX_LABEL}`],
    ...["--format", format],
  ]);
  const ids = out.split("\n").flatMap((line) => {
    const [id = "", name = "", instance, pid = ""] = line.split("\t");
    const orphan =
      (includeOwn && instance === INSTANCE) ||
      (/^[1-9]\d{0,9}$/.test(pid) && !alive(Number(pid)));
    return /^[0-9a-f]+$/.test(id) && name.startsWith(NAME_PREFIX) && orphan
      ? [id]
      : [];
  });
  // Another reaper (a concurrent run) may be removing or have removed the same one.
  const gone =
    /^Error response from daemon: (No such container: \S+|removal of container \S+ is already in progress)\s*$/;
  if (ids.length > 0) await dockerOutput(docker, ["rm", "-f", ...ids], gone);
  return ids.length;
}

/**
 * Runs `request.argv` in a fresh, network-less, read-only, capability-free
 * container that sees only the workspace and `request.env`. Resolves on exit,
 * timeout, or abort (the container is killed and removed); never hangs.
 *
 * @throws RangeError | TypeError synchronously, before spawning, for an
 * invalid request. Rejects if the endpoint is not `unix://`, if the docker CLI
 * cannot be started, if the workspace changed or contains the endpoint socket, or on
 * exit 125 ("sandbox failed to start or the program exited 125; untrusted stderr: …").
 */
export function runInSandbox(
  request: SandboxRequest,
  deps: SandboxDeps = {},
): Promise<SandboxResult> {
  const name = deps.containerName ?? `${NAME_PREFIX}${randomUUID()}`;
  return execute(request, runArgs(request, name), name, deps);
}

async function execute(
  request: SandboxRequest,
  { args, workspace }: ReturnType<typeof runArgs>,
  name: string,
  deps: SandboxDeps,
): Promise<SandboxResult> {
  const started = performance.now();
  const docker = await dockerContext(deps);
  recheckWorkspace(request, workspace, docker.env["DOCKER_HOST"] ?? "");
  const base = {
    containerName: name,
    startFailed: false,
    cleanupFailed: false,
  };
  if (request.signal?.aborted === true) {
    return {
      ...base,
      exitCode: null,
      stdout: "",
      stderr: "",
      stdoutTruncated: false,
      stderrTruncated: false,
      truncated: false,
      timedOut: false,
      cancelled: true,
      durationMs: 0,
    };
  }
  const max = request.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const client = startDocker(docker, args, max);
  let reason: "timeout" | "cancelled" | "signal" | undefined;
  const { promise: interrupted, resolve: interrupt } =
    Promise.withResolvers<null>();
  const stop = (why: "timeout" | "cancelled") => {
    reason ??= why;
    interrupt(null);
  };
  const timer = setTimeout(() => {
    stop("timeout");
  }, request.timeoutMs);
  const onAbort = () => {
    stop("cancelled");
  };
  request.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const code = await Promise.race([client.closed, interrupted]);
    // Killed by a signal: docker may still be running the container.
    if (code === null) reason ??= "signal";
    let cleanupFailed = false;
    if (reason !== undefined) {
      cleanupFailed = !(await stopContainer(docker, name, client));
    } else if (code === 125) {
      // SF-1: confirmed like a stop; the run's end checks every container again.
      await stopContainer(docker, name, client);
      const stderr = bounded(client.stderr.text());
      throw new Error(
        `sandbox failed to start or the program exited 125; untrusted stderr: ${stderr}`,
      );
    }
    const stdoutTruncated = client.stdout.truncated();
    const stderrTruncated = client.stderr.truncated();
    return {
      ...base,
      exitCode: reason === undefined ? code : null,
      stdout: client.stdout.text(),
      stderr: client.stderr.text(),
      stdoutTruncated,
      stderrTruncated,
      truncated: stdoutTruncated || stderrTruncated,
      timedOut: reason === "timeout",
      cancelled: reason === "cancelled",
      startFailed: reason === undefined && (code === 126 || code === 127),
      cleanupFailed,
      durationMs: Math.round(performance.now() - started),
    };
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener("abort", onAbort);
  }
}
