import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SANDBOX_BASE_IMAGE,
  SANDBOX_DOCKERFILE_DIR,
  dockerClientEnv,
  dockerRunArgs,
  runInSandbox,
  type SandboxRequest,
} from "../../src/index.ts";

const NAME = "helmwright-sandbox-test";
const IMAGE = `sha256:${"ab".repeat(32)}`;
let root: string;
let workspace: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "hw-sandbox-unit-")));
  workspace = join(root, "ws");
  mkdirSync(workspace);
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const request = (over: Partial<SandboxRequest> = {}): SandboxRequest => ({
  argv: ["node", "-e", "1"],
  image: IMAGE,
  workspace,
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
    expectPair(args, "--network", "none");
    expectPair(args, "--cap-drop", "ALL");
    expectPair(args, "--security-opt", "no-new-privileges");
    expectPair(args, "--user", "1000:1000");
    expectPair(args, "--pids-limit", "256");
    expectPair(args, "--memory", "1024m");
    expectPair(args, "--cpus", "2");
    expectPair(args, "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m");
    expectPair(args, "--mount", `type=bind,src=${workspace},dst=/workspace`);
    expectPair(args, "--workdir", "/workspace");
    for (const banned of ["--privileged", "-v", "--volume", "--env-file"]) {
      expect(flags).not.toContain(banned);
    }
    expect(flags).not.toContain("--env");
    expect(flags).not.toContain("-e");
  });

  it("applies explicit limits", () => {
    const args = dockerRunArgs(
      request({ limits: { memoryMb: 256, cpus: 0.5, pids: 32 } }),
      NAME,
    );
    expectPair(args, "--memory", "256m");
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

  it("mounts the workspace realpath, not a symlink to it", () => {
    const link = join(root, "link");
    symlinkSync(workspace, link);
    const args = dockerRunArgs(request({ workspace: link }), NAME);
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
    ["relative workspace", { workspace: "rel/dir" }],
    ["missing workspace", { workspace: "/nonexistent/hw-sandbox" }],
    ["root workspace", { workspace: "/" }],
    ["home workspace", { workspace: homedir() }],
    ["bad env key", { env: { lower: "x" } }],
    ["env key with =", { env: { "A=B": "x" } }],
    ["NUL in env value", { env: { A: "x\0y" } }],
    ["zero timeout", { timeoutMs: 0 }],
    ["fractional timeout", { timeoutMs: 1.5 }],
    ["infinite timeout", { timeoutMs: Infinity }],
    ["huge timeout", { timeoutMs: 2 ** 31 }],
    ["zero pids", { limits: { memoryMb: 1024, cpus: 2, pids: 0 } }],
    ["NaN cpus", { limits: { memoryMb: 1024, cpus: NaN, pids: 1 } }],
    ["zero output bound", { maxOutputBytes: 0 }],
  ])("rejects %s", (_label, over) => {
    // Only the RangeError/TypeError validators produce this prefix.
    expect(() => dockerRunArgs(request(over), NAME)).toThrow(
      /^SandboxRequest\./,
    );
  });

  it("rejects a workspace that is a file or has a comma in its path", () => {
    const file = join(root, "file");
    writeFileSync(file, "x");
    expect(() => dockerRunArgs(request({ workspace: file }), NAME)).toThrow(
      /SandboxRequest\.workspace/,
    );
    const comma = join(root, "a,readonly");
    mkdirSync(comma);
    expect(() => dockerRunArgs(request({ workspace: comma }), NAME)).toThrow(
      /SandboxRequest\.workspace/,
    );
  });
});

describe("dockerClientEnv", () => {
  it("forwards only PATH, HOME, DOCKER_HOST and DOCKER_CONFIG", () => {
    expect(
      dockerClientEnv({
        PATH: "/bin",
        HOME: "/h",
        DOCKER_HOST: "unix:///d.sock",
        ANTHROPIC_API_KEY: "k",
        HELMWRIGHT_TEST_SECRET: "s3cret",
      }),
    ).toEqual({ PATH: "/bin", HOME: "/h", DOCKER_HOST: "unix:///d.sock" });
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
      runInSandbox(request(), { dockerBinary: "/nonexistent/docker" }),
    ).rejects.toThrow(/docker is unavailable/);
  });
});
