import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { existsSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute } from "node:path";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { errorMessage } from "../loop/terminal.ts";

/** node:26-slim (Node 26.10.0), multi-arch index digest. Has user `node` (uid 1000). */
export const SANDBOX_BASE_IMAGE =
  "node:26-slim@sha256:930557a230abacbc3f4fd9b8648abf8f4bee1e17cb72195dcdfb2f709bc85b33";
/** Build context of the sandbox image: the base without npm/npx. */
export const SANDBOX_DOCKERFILE_DIR = fileURLToPath(
  new URL("../../sandbox", import.meta.url),
);
const BUILD_TIMEOUT_MS = 600_000;
export const MAX_SANDBOX_VALUE = 2_147_483_647;
export const DEFAULT_MAX_OUTPUT_BYTES = 1_048_576;

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
  /** Image to run, e.g. the ID from `buildSandboxImage`. Never built or pulled here. */
  readonly image: string;
  /** Absolute host directory; its realpath is mounted read-write at /workspace. */
  readonly workspace: string;
  readonly timeoutMs: number;
  /** The container's only variables besides the image's. Host env never passes through. */
  readonly env?: Readonly<Record<string, string>>;
  readonly limits?: SandboxLimits;
  /** Per-stream capture bound; the head is kept. Default 1 MiB. */
  readonly maxOutputBytes?: number;
  readonly signal?: AbortSignal;
}

export interface SandboxResult {
  /** Null when the run timed out or was cancelled. */
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly truncated: boolean;
  readonly timedOut: boolean;
  readonly cancelled: boolean;
  readonly durationMs: number;
}

export interface SandboxDeps {
  /** Docker CLI executable. Default "docker". */
  readonly dockerBinary?: string;
  /** Source of the docker client's PATH/HOME/DOCKER_*. Default process.env. */
  readonly hostEnv?: Readonly<Record<string, string | undefined>>;
  /** Default `helmwright-sandbox-<uuid>`. */
  readonly containerName?: string;
}

const CONTAINER_PATH = "/workspace";
const ENV_KEY = /^[A-Z_][A-Z0-9_]*$/;
const CONTAINER_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
const CLIENT_ENV_KEYS = ["PATH", "HOME", "DOCKER_HOST", "DOCKER_CONFIG"];
/** Bound on each docker cleanup command and on waiting for the client to exit. */
const CLEANUP_MS = 10_000;

const fail = (field: string, problem: string): RangeError =>
  new RangeError(`SandboxRequest.${field} ${problem}`);

function checkInteger(field: string, value: number, min: number): void {
  if (!Number.isInteger(value) || value < min || value > MAX_SANDBOX_VALUE) {
    throw fail(
      field,
      `must be an integer in [${String(min)}, ${String(MAX_SANDBOX_VALUE)}], got ${String(value)}`,
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

/** Returns the workspace realpath, or throws. */
function resolveWorkspace(workspace: string): string {
  if (typeof workspace !== "string" || workspace.includes("\0")) {
    throw new TypeError(
      "SandboxRequest.workspace must be a string without NUL",
    );
  }
  if (!isAbsolute(workspace)) throw fail("workspace", "must be absolute");
  let real: string;
  try {
    real = realpathSync(workspace);
  } catch {
    throw fail("workspace", `does not exist: ${workspace}`);
  }
  if (!statSync(real).isDirectory()) {
    throw fail("workspace", `is not a directory: ${real}`);
  }
  const home = homedir();
  const realHome = existsSync(home) ? realpathSync(home) : home;
  if (real === "/" || real === home || real === realHome) {
    throw fail("workspace", `must not be / or the home directory: ${real}`);
  }
  // --mount is CSV-parsed: these characters could inject mount options.
  if (/[,"'\n\r]/.test(real)) {
    throw fail("workspace", `path must not contain , " ' or newlines: ${real}`);
  }
  return real;
}

function checkEnv(env: Readonly<Record<string, string>>): [string, string][] {
  const entries = Object.entries(env);
  for (const [key, value] of entries) {
    if (!ENV_KEY.test(key)) {
      throw fail("env", `key must match ${String(ENV_KEY)}, got ${key}`);
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

/**
 * Validates `request` and builds the `docker run` argv. No side effects
 * beyond reading the filesystem to resolve the workspace.
 * @throws RangeError | TypeError for an invalid request or container name.
 */
export function dockerRunArgs(
  request: SandboxRequest,
  containerName: string,
): string[] {
  checkArgv(request.argv);
  const { image } = request;
  if (typeof image !== "string" || !/^[^\s\0-]\S*$/.test(image)) {
    throw fail("image", "must be non-empty, without whitespace or leading -");
  }
  const workspace = resolveWorkspace(request.workspace);
  checkInteger("timeoutMs", request.timeoutMs, 1);
  checkInteger(
    "maxOutputBytes",
    request.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
    1,
  );
  const limits = request.limits ?? DEFAULT_SANDBOX_LIMITS;
  checkLimits(limits);
  const env = checkEnv(request.env ?? {});
  if (!CONTAINER_NAME.test(containerName)) {
    throw new RangeError(`invalid sandbox container name: ${containerName}`);
  }
  const options: (readonly [string, string])[] = [
    ["--name", containerName],
    ["--network", "none"],
    ["--cap-drop", "ALL"],
    ["--security-opt", "no-new-privileges"],
    ["--user", "1000:1000"],
    ["--pids-limit", String(limits.pids)],
    ["--memory", `${String(limits.memoryMb)}m`],
    ["--cpus", String(limits.cpus)],
    ["--tmpfs", "/tmp:rw,noexec,nosuid,size=64m"],
    ["--mount", `type=bind,src=${workspace},dst=${CONTAINER_PATH}`],
    ["--workdir", CONTAINER_PATH],
    ...env.map(([key, value]) => ["--env", `${key}=${value}`] as const),
  ];
  return [
    ...["run", "--rm", "--init", "--read-only"],
    ...options.flat(),
    image,
    ...request.argv,
  ];
}

/**
 * Builds the sandbox image from SANDBOX_DOCKERFILE_DIR (base must be present
 * locally: `--pull=false`). Resolves with the image ID (`sha256:…`).
 * @throws Error if docker is unavailable, the build fails, or it exceeds 10 min.
 */
export async function buildSandboxImage(
  deps: Pick<SandboxDeps, "dockerBinary" | "hostEnv"> = {},
): Promise<string> {
  const args = ["build", "--quiet", "--pull=false", SANDBOX_DOCKERFILE_DIR];
  const { child, stdout, stderr, closed } = startDocker(args, deps, 65_536);
  const timer = setTimeout(() => child.kill("SIGKILL"), BUILD_TIMEOUT_MS);
  const code = await closed.finally(() => {
    clearTimeout(timer);
  });
  const id = stdout.text().trim();
  if (code !== 0 || !/^sha256:[0-9a-f]{64}$/.test(id)) {
    const why = `exit ${String(code)}, signal ${String(child.signalCode)}`;
    throw new Error(`sandbox image build failed (${why}): ${stderr.text()}`);
  }
  return id;
}

/** The docker client's environment: only what it needs to reach the daemon. */
export function dockerClientEnv(
  hostEnv: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of CLIENT_ENV_KEYS) {
    const value = hostEnv[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
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

/** Spawns the docker CLI (argv, no shell) with the minimal client env. */
function startDocker(args: readonly string[], deps: SandboxDeps, max: number) {
  const child = spawn(deps.dockerBinary ?? "docker", args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: dockerClientEnv(deps.hostEnv ?? process.env),
  });
  const stdout = capture(child.stdout, max);
  const stderr = capture(child.stderr, max);
  const events: Promise<unknown[]> = once(child, "close"); // rejects on "error"
  const closed = events.then(
    ([code]) => (typeof code === "number" ? code : null),
    (error: unknown) => {
      const message = `docker is unavailable: ${errorMessage(error)}`;
      throw new Error(message, { cause: error });
    },
  );
  return { child, stdout, stderr, closed };
}

/** Runs a docker command for its effect, ignoring failure. Bounded. */
async function dockerQuiet(deps: SandboxDeps, args: string[]): Promise<void> {
  const { child, closed } = startDocker(args, deps, 0);
  if (!(await within(closed, CLEANUP_MS))) child.kill("SIGKILL");
}

/** Kills and removes the container; waits (bounded) for the client to exit. */
async function stopContainer(
  deps: SandboxDeps,
  name: string,
  client: ChildProcess,
  exited: Promise<unknown>,
): Promise<void> {
  await dockerQuiet(deps, ["kill", name]);
  await dockerQuiet(deps, ["rm", "-f", name]);
  if (await within(exited, CLEANUP_MS)) return;
  // The container may have been created after the first removal.
  client.kill("SIGKILL");
  await dockerQuiet(deps, ["rm", "-f", name]);
  await within(exited, CLEANUP_MS);
}

/**
 * Runs `request.argv` in a fresh, network-less, read-only, capability-free
 * container that sees only the workspace and `request.env`. Resolves on exit,
 * timeout, or abort (the container is killed and removed); never hangs.
 *
 * @throws RangeError | TypeError synchronously, before spawning, for an
 * invalid request. Rejects if the docker CLI cannot be started.
 */
export function runInSandbox(
  request: SandboxRequest,
  deps: SandboxDeps = {},
): Promise<SandboxResult> {
  const name = deps.containerName ?? `helmwright-sandbox-${randomUUID()}`;
  const args = dockerRunArgs(request, name);
  return execute(request, args, name, deps);
}

async function execute(
  request: SandboxRequest,
  args: readonly string[],
  name: string,
  deps: SandboxDeps,
): Promise<SandboxResult> {
  const started = performance.now();
  if (request.signal?.aborted === true) {
    return {
      exitCode: null,
      stdout: "",
      stderr: "",
      truncated: false,
      timedOut: false,
      cancelled: true,
      durationMs: 0,
    };
  }
  const max = request.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const { child, stdout, stderr, closed } = startDocker(args, deps, max);
  let reason: "timeout" | "cancelled" | undefined;
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
    const code = await Promise.race([closed, interrupted]);
    if (reason !== undefined) await stopContainer(deps, name, child, closed);
    return {
      exitCode: reason === undefined ? code : null,
      stdout: stdout.text(),
      stderr: stderr.text(),
      truncated: stdout.truncated() || stderr.truncated(),
      timedOut: reason === "timeout",
      cancelled: reason === "cancelled",
      durationMs: Math.round(performance.now() - started),
    };
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener("abort", onAbort);
  }
}
