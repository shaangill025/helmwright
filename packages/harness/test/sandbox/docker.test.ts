import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SANDBOX_BASE_IMAGE,
  SANDBOX_DOCKERFILE_DIR,
  buildSandboxImage,
  dockerClientEnv,
  dockerRunArgs,
  reapSandboxContainers,
  resolveDockerEndpoint,
  runInSandbox,
  type SandboxDeps,
  type SandboxRequest,
} from "../../src/index.ts";

const NAME = "helmwright-sandbox-test";
const IMAGE = `sha256:${"ab".repeat(32)}`;
const FAKE_HOST = "unix:///fake/docker.sock";
let root: string;
let workspace: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "hw-sandbox-unit-")));
  workspace = join(root, "ws");
  mkdirSync(workspace);
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

const request = (over: Partial<SandboxRequest> = {}): SandboxRequest => ({
  argv: ["node", "-e", "1"],
  image: IMAGE,
  workspace,
  workspaceRoot: root,
  timeoutMs: 5_000,
  ...over,
});

/** Asserts `flag value` appears as adjacent elements before the image. */
function expectPair(args: readonly string[], flag: string, value: string) {
  const image = args.indexOf(IMAGE);
  const found = args.some(
    (arg, i) => i < image && arg === flag && args[i + 1] === value,
  );
  expect(found, `${flag} ${value}`).toBe(true);
}

interface Call {
  readonly args?: string[];
  readonly env?: Record<string, string | null>;
  readonly holder?: number;
}

const FAKE = fileURLToPath(
  new URL("fixtures/fake-docker.mjs", import.meta.url),
);

/** A docker executable that logs each invocation and behaves per `mode`. */
function fakeDocker(mode: string) {
  const binary = join(root, `docker-${mode}`);
  const log = join(root, `calls-${mode}.jsonl`);
  const script = `#!/bin/sh\nexec '${process.execPath}' '${FAKE}' '${mode}' '${log}' "$@"\n`;
  writeFileSync(binary, script, { mode: 0o755 });
  const calls = (): Call[] =>
    existsSync(log)
      ? readFileSync(log, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line) as Call)
      : [];
  const deps: SandboxDeps = {
    dockerBinary: binary,
    resolveEndpoint: () => Promise.resolve(FAKE_HOST),
    cleanupTimeoutMs: 1_500,
    containerName: NAME,
  };
  return { binary, calls, deps };
}

const commands = (calls: Call[]) => calls.map((call) => call.args?.[0]);

describe("dockerRunArgs", () => {
  it("pins the base image by digest, and the Dockerfile builds on it", () => {
    expect(SANDBOX_BASE_IMAGE).toBe(
      "node:26-slim@sha256:930557a230abacbc3f4fd9b8648abf8f4bee1e17cb72195dcdfb2f709bc85b33",
    );
    const dockerfile = readFileSync(
      join(SANDBOX_DOCKERFILE_DIR, "Dockerfile"),
      "utf8",
    );
    const lines = dockerfile.split("\n");
    expect(lines).toContain(`FROM ${SANDBOX_BASE_IMAGE}`);
    expect(lines).toContain("USER node");
  });

  it("includes every hardening flag with defaults, then image and argv", () => {
    const args = dockerRunArgs(request(), NAME);
    expect(args[0]).toBe("run");
    const image = args.indexOf(IMAGE);
    expect(args.slice(image)).toEqual([IMAGE, "node", "-e", "1"]);
    const flags = args.slice(0, image);
    for (const flag of ["--rm", "--init", "--read-only"]) {
      expect(flags).toContain(flag);
    }
    expectPair(args, "--name", NAME);
    const labels = args.filter((_, i) => args[i - 1] === "--label");
    expect(labels).toEqual([
      expect.stringMatching(/^helmwright\.sandbox=[0-9a-f-]{36}$/),
      `helmwright.sandbox.owner-pid=${String(process.pid)}`,
    ]);
    expectPair(args, "--network", "none");
    expectPair(args, "--ipc", "none");
    expectPair(args, "--pull", "never");
    expectPair(args, "--entrypoint", "");
    expectPair(args, "--cap-drop", "ALL");
    expectPair(args, "--security-opt", "no-new-privileges");
    const user = `${String(process.getuid?.())}:${String(process.getgid?.())}`;
    expectPair(args, "--user", user);
    expectPair(args, "--pids-limit", "256");
    expectPair(args, "--memory", "1024m");
    expectPair(args, "--memory-swap", "1024m");
    expectPair(args, "--cpus", "2");
    expectPair(args, "--ulimit", "nofile=1024:1024");
    expectPair(args, "--ulimit", "fsize=1073741824");
    expectPair(args, "--log-driver", "none");
    expectPair(args, "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m");
    expectPair(args, "--mount", `type=bind,src=${workspace},dst=/workspace`);
    expectPair(args, "--workdir", "/workspace");
    for (const banned of ["--privileged", "-v", "--volume", "--env-file"]) {
      expect(flags).not.toContain(banned);
    }
    expect(flags).not.toContain("--env");
    expect(flags).not.toContain("-e");
  });

  it("refuses to run the container as root", () => {
    vi.spyOn(process, "getuid").mockReturnValue(0);
    expect(() => dockerRunArgs(request(), NAME)).toThrow(/root/);
  });

  it("refuses to run the container with gid 0", () => {
    vi.spyOn(process, "getgid").mockReturnValue(0);
    expect(() => dockerRunArgs(request(), NAME)).toThrow(/root/);
  });

  it.each([
    ["/", "/"],
    ["home", homedir()],
    ["an ancestor of home", dirname(homedir())],
    // A case-insensitive volume resolves this to home; elsewhere it does not exist.
    ["home in other case", homedir().toUpperCase()],
  ])("rejects %s as workspaceRoot", (_label, workspaceRoot) => {
    expect(() => dockerRunArgs(request({ workspaceRoot }), NAME)).toThrow(
      /^SandboxRequest\.workspaceRoot /,
    );
  });

  it("applies explicit limits", () => {
    const args = dockerRunArgs(
      request({ limits: { memoryMb: 256, cpus: 0.5, pids: 32 } }),
      NAME,
    );
    expectPair(args, "--memory", "256m");
    expectPair(args, "--memory-swap", "256m");
    expectPair(args, "--cpus", "0.5");
    expectPair(args, "--pids-limit", "32");
  });

  it("passes only the given env, as K=V argv elements", () => {
    vi.stubEnv("HELMWRIGHT_TEST_SECRET", "s3cret");
    try {
      const args = dockerRunArgs(
        request({ env: { FOO: "a b;$(x)'\"", BAR_2: "" } }),
        NAME,
      );
      expectPair(args, "--env", "FOO=a b;$(x)'\"");
      expectPair(args, "--env", "BAR_2=");
      expect(args.filter((a) => a === "--env")).toHaveLength(2);
      expect(args.join("\n")).not.toContain("s3cret");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("mounts the workspace realpath when the root is a symlink", () => {
    const link = join(root, "link");
    symlinkSync(root, link);
    const args = dockerRunArgs(
      request({ workspace: join(link, "ws"), workspaceRoot: link }),
      NAME,
    );
    expectPair(args, "--mount", `type=bind,src=${workspace},dst=/workspace`);
  });

  it.each<[string, Partial<SandboxRequest>]>([
    ["empty argv", { argv: [] }],
    ["empty program", { argv: ["", "x"] }],
    ["non-string arg", { argv: ["node", 1 as unknown as string] }],
    ["NUL in arg", { argv: ["node", "a\0b"] }],
    ["empty image", { image: "" }],
    ["image with whitespace", { image: "node:26 --privileged" }],
    ["image as a flag", { image: "--privileged" }],
    ["image tag instead of an ID", { image: "alpine" }],
    [
      "stock base image by digest",
      { image: "node:26-slim@sha256:" + "a".repeat(64) },
    ],
    ["short image ID", { image: "sha256:abc" }],
    ["relative workspace", { workspace: "rel/dir" }],
    ["missing workspace", { workspace: "/nonexistent/hw-sandbox" }],
    ["root workspace", { workspace: "/", workspaceRoot: "/" }],
    ["home workspace", { workspace: homedir() }],
    [
      "missing workspaceRoot",
      { workspaceRoot: undefined as unknown as string },
    ],
    ["workspace outside its root", { workspace: tmpdir() }],
    ["bad env key", { env: { lower: "x" } }],
    ["env key with =", { env: { "A=B": "x" } }],
    ["NUL in env value", { env: { A: "x\0y" } }],
    ["token env name", { env: { MY_TOKEN: "x" } }],
    ["secret env name", { env: { CLIENT_SECRET_V2: "x" } }],
    ["password env name", { env: { DB_PASSWORD: "x" } }],
    ["passwd env name", { env: { PASSWD: "x" } }],
    ["credential env name", { env: { GOOGLE_CREDENTIALS: "x" } }],
    ["api key env name", { env: { SERVICE_API_KEY: "x" } }],
    ["private key env name", { env: { SSH_PRIVATE_KEY: "x" } }],
    ["AWS_ env name", { env: { AWS_REGION: "x" } }],
    ["ANTHROPIC_ env name", { env: { ANTHROPIC_BASE_URL: "x" } }],
    ["GITHUB_ env name", { env: { GITHUB_ACTIONS: "x" } }],
    ["GH_ env name", { env: { GH_HOST: "x" } }],
    ["NPM_ env name", { env: { NPM_CONFIG_REGISTRY: "x" } }],
    ["OPENAI_ env name", { env: { OPENAI_ORG: "x" } }],
    ["zero timeout", { timeoutMs: 0 }],
    ["fractional timeout", { timeoutMs: 1.5 }],
    ["infinite timeout", { timeoutMs: Infinity }],
    ["huge timeout", { timeoutMs: 2 ** 31 }],
    ["zero pids", { limits: { memoryMb: 1024, cpus: 2, pids: 0 } }],
    ["NaN cpus", { limits: { memoryMb: 1024, cpus: NaN, pids: 1 } }],
    ["zero output bound", { maxOutputBytes: 0 }],
    ["output bound over 64 MiB", { maxOutputBytes: 64 * 1024 * 1024 + 1 }],
  ])("rejects %s", (_label, over) => {
    // Only the RangeError/TypeError validators produce this prefix.
    expect(() => dockerRunArgs(request(over), NAME)).toThrow(
      /^SandboxRequest\./,
    );
  });

  it("rejects a workspace equal to its root, symlinked, a file, or with a comma", () => {
    expect(() =>
      dockerRunArgs(request({ workspaceRoot: workspace }), NAME),
    ).toThrow(/SandboxRequest\.workspace/);
    const link = join(root, "link");
    symlinkSync(workspace, link);
    const file = join(root, "file");
    writeFileSync(file, "x");
    const comma = join(root, "a,readonly");
    mkdirSync(comma);
    for (const bad of [link, file, comma]) {
      expect(() => dockerRunArgs(request({ workspace: bad }), NAME)).toThrow(
        /SandboxRequest\.workspace/,
      );
    }
  });
});

describe("dockerClientEnv", () => {
  it("gives the client a private empty config and the resolved endpoint", () => {
    const env = dockerClientEnv(
      {
        PATH: "/bin",
        HOME: "/h",
        DOCKER_HOST: "tcp://evil:2375",
        DOCKER_CONFIG: "/h/.docker",
        ANTHROPIC_API_KEY: "k",
      },
      FAKE_HOST,
    );
    expect(Object.keys(env).sort()).toEqual([
      "DOCKER_CONFIG",
      "DOCKER_HOST",
      "HOME",
      "PATH",
    ]);
    expect(env).toMatchObject({ PATH: "/bin", DOCKER_HOST: FAKE_HOST });
    const config = env["DOCKER_CONFIG"] ?? "";
    expect(env["HOME"]).not.toBe("/h");
    expect(config).not.toBe("/h/.docker");
    expect(statSync(config).mode & 0o777).toBe(0o700);
    expect(readFileSync(join(config, "config.json"), "utf8").trim()).toBe("{}");
  });

  it("rejects an endpoint that is not unix://", () => {
    expect(() => dockerClientEnv({}, "tcp://10.0.0.1:2375")).toThrow(
      /unix:\/\//,
    );
  });
});

describe("resolveDockerEndpoint", () => {
  it("uses a unix:// DOCKER_HOST without running docker", async () => {
    const fake = fakeDocker("ok");
    await expect(
      resolveDockerEndpoint({
        dockerBinary: fake.binary,
        hostEnv: { DOCKER_HOST: "unix:///run/d.sock" },
      }),
    ).resolves.toBe("unix:///run/d.sock");
    expect(fake.calls()).toEqual([]);
  });

  it.each(["tcp://10.0.0.1:2375", "ssh://u@host", "npipe:////./pipe/docker"])(
    "rejects DOCKER_HOST=%s",
    async (host) => {
      await expect(
        resolveDockerEndpoint({ hostEnv: { DOCKER_HOST: host } }),
      ).rejects.toThrow(/unix:\/\//);
    },
  );

  it("otherwise asks the current docker context", async () => {
    const fake = fakeDocker("ok");
    const deps = { dockerBinary: fake.binary, hostEnv: { PATH: "/bin" } };
    await expect(resolveDockerEndpoint(deps)).resolves.toBe(FAKE_HOST);
    expect(fake.calls().map((call) => call.args)).toEqual([
      ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"],
    ]);
    const tcp = fakeDocker("tcp");
    await expect(
      resolveDockerEndpoint({ ...deps, dockerBinary: tcp.binary }),
    ).rejects.toThrow(/unix:\/\//);
  });
});

describe("runInSandbox", () => {
  it("throws synchronously, before spawning, for an invalid request", () => {
    expect(() => runInSandbox(request({ argv: [] }))).toThrow(
      /SandboxRequest\.argv/,
    );
  });

  it("rejects with 'docker is unavailable' when the CLI cannot start", async () => {
    await expect(
      runInSandbox(request(), {
        dockerBinary: "/nonexistent/docker",
        resolveEndpoint: () => Promise.resolve(FAKE_HOST),
      }),
    ).rejects.toThrow(/docker is unavailable/);
  });

  it("rejects a remote endpoint before running any container", async () => {
    const fake = fakeDocker("ok");
    const deps = {
      ...fake.deps,
      resolveEndpoint: () => Promise.resolve("tcp://10.0.0.1:2375"),
    };
    await expect(runInSandbox(request(), deps)).rejects.toThrow(/unix:\/\//);
    expect(fake.calls()).toEqual([]);
  });

  it("runs the client with the isolated env, not the host's", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "dummy-not-a-key");
    try {
      const fake = fakeDocker("stderr");
      await runInSandbox(request(), fake.deps);
      const [call] = fake.calls();
      expect(call?.env).toMatchObject({
        DOCKER_HOST: FAKE_HOST,
        ANTHROPIC_API_KEY: null,
      });
      expect(call?.env?.["HOME"]).not.toBe(process.env["HOME"]);
      expect(call?.env?.["DOCKER_CONFIG"]).not.toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("rejects on 125, marking stderr as untrusted", async () => {
    const fake = fakeDocker("start-fail");
    const run = runInSandbox(request(), fake.deps);
    await expect(run).rejects.toThrow(
      /^sandbox failed to start or the program exited 125; untrusted stderr: docker: Error/,
    );
    const error = await run.catch((e: unknown) => e);
    expect(String(error).length).toBeLessThan(5_000);
  });

  it("flags 126/127 as a start failure, keeping the exit code", async () => {
    const result = await runInSandbox(request(), fakeDocker("not-found").deps);
    expect(result).toMatchObject({ exitCode: 127, startFailed: true });
  });

  it("reports per-stream truncation and the container name", async () => {
    const result = await runInSandbox(
      request({ maxOutputBytes: 1_024 }),
      fakeDocker("stderr").deps,
    );
    expect(result).toMatchObject({
      exitCode: 0,
      stdout: "ok",
      stderr: "y".repeat(1_024),
      stdoutTruncated: false,
      stderrTruncated: true,
      truncated: true,
      startFailed: false,
      cleanupFailed: false,
      containerName: NAME,
    });
  });

  it("verifies cleanup after a timeout", async () => {
    const fake = fakeDocker("slow");
    const result = await runInSandbox(request({ timeoutMs: 100 }), fake.deps);
    expect(result).toMatchObject({ timedOut: true, cleanupFailed: false });
    expect(fake.calls().map((call) => call.args)).toContainEqual([
      "ps",
      "-a",
      "-q",
      "--filter",
      `name=^/${NAME}$`,
    ]);
  }, 10_000);

  it("bounds hanging kill/rm and reports cleanupFailed", async () => {
    const fake = fakeDocker("hang");
    const started = Date.now();
    const deps = { ...fake.deps, cleanupTimeoutMs: 1_000 };
    const result = await runInSandbox(request({ timeoutMs: 100 }), deps);
    // kill, rm, client exit, rm, ps: each bounded by cleanupTimeoutMs.
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(result).toMatchObject({ timedOut: true, cleanupFailed: true });
    expect(commands(fake.calls())).toEqual(
      expect.arrayContaining(["run", "kill", "rm", "ps"]),
    );
  }, 15_000);

  it("rejects a workspace containing the endpoint's socket, without running", async () => {
    const fake = fakeDocker("ok");
    mkdirSync(join(workspace, "run"));
    writeFileSync(join(workspace, "run", "docker.sock"), "");
    const host = `unix://${join(workspace, "run", "docker.sock")}`;
    const deps = { ...fake.deps, resolveEndpoint: () => Promise.resolve(host) };
    await expect(runInSandbox(request(), deps)).rejects.toThrow(
      /^SandboxRequest\.workspace must not contain the docker endpoint socket/,
    );
    expect(commands(fake.calls())).not.toContain("run");
  });

  it("stops, verifies and reports a client killed by a signal", async () => {
    const fake = fakeDocker("signal");
    const result = await runInSandbox(request(), fake.deps);
    expect(result).toMatchObject({
      exitCode: null,
      timedOut: false,
      cancelled: false,
      cleanupFailed: true,
    });
    expect(commands(fake.calls())).toEqual(["run", "kill", "rm", "ps"]);
  }, 10_000);

  it("returns cancelled without running anything if already aborted", async () => {
    const fake = fakeDocker("ok");
    const result = await runInSandbox(
      request({ signal: AbortSignal.abort() }),
      fake.deps,
    );
    expect(result).toMatchObject({ cancelled: true, exitCode: null });
    expect(commands(fake.calls())).not.toContain("run");
  });
});

describe("reapSandboxContainers", () => {
  it("removes only sandbox-named containers whose owner is gone", async () => {
    const fake = fakeDocker("ok");
    await expect(reapSandboxContainers(fake.deps)).resolves.toBe(1);
    const [ps, rm, ...rest] = fake.calls().map((call) => call.args);
    expect(ps?.slice(0, 4)).toEqual([
      "ps",
      "-a",
      "--filter",
      "label=helmwright.sandbox",
    ]);
    expect(rm).toEqual(["rm", "-f", "aaa111"]);
    expect(rest).toEqual([]);
  });
});

describe("buildSandboxImage", () => {
  it("is bounded even when killed docker leaves its pipes open", async () => {
    const fake = fakeDocker("hang");
    const started = Date.now();
    try {
      await expect(
        buildSandboxImage({ ...fake.deps, buildTimeoutMs: 1_500 }),
      ).rejects.toThrow(/timed out/);
      expect(Date.now() - started).toBeLessThan(6_000);
      // The pipe-holding grandchild existed, so 'close' could not have settled it.
      expect(fake.calls().some((call) => call.holder !== undefined)).toBe(true);
    } finally {
      for (const { holder } of fake.calls()) {
        if (holder !== undefined) process.kill(holder, "SIGKILL");
      }
    }
  }, 15_000);
});
