import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  SANDBOX_BASE_IMAGE,
  buildSandboxImage,
  reapSandboxContainers,
  resolveDockerEndpoint,
  runInSandbox,
  type SandboxRequest,
  type SandboxResult,
} from "../../src/index.ts";

// Real Docker: this file fails (never skips) when Docker is unavailable.
const T = 60_000;
let image: string;
let root: string;
let workspace: string;
let outside: string;

beforeAll(async () => {
  const pull = spawnSync("docker", ["pull", SANDBOX_BASE_IMAGE], {
    encoding: "utf8",
    timeout: 300_000,
  });
  if (pull.status !== 0) {
    throw new Error(
      `docker pull failed: ${pull.error?.message ?? pull.stderr}`,
    );
  }
  image = await buildSandboxImage();
  expect(image).toMatch(/^sha256:[0-9a-f]{64}$/);
}, 600_000);

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "hw-sandbox-ws-")));
  workspace = join(root, "ws");
  mkdirSync(workspace);
  outside = realpathSync(mkdtempSync(join(tmpdir(), "hw-sandbox-out-")));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

const run = (
  argv: readonly string[],
  over: Partial<SandboxRequest> = {},
): Promise<SandboxResult> =>
  runInSandbox({
    argv,
    image,
    workspace,
    workspaceRoot: root,
    timeoutMs: 30_000,
    ...over,
  });

function expectNoContainer(name: string): void {
  const ps = spawnSync("docker", ["ps", "-aq", "--filter", `name=${name}`], {
    encoding: "utf8",
  });
  expect(ps.status).toBe(0);
  expect(ps.stdout.trim()).toBe("");
}

describe("runInSandbox (docker)", () => {
  it("runs node 26 without npm or npx", { timeout: T }, async () => {
    const npm = await run(["sh", "-c", "command -v npm npx || echo none"]);
    expect(npm.stdout).toBe("none\n");
    const node = await run(["node", "-v"]);
    expect(node.stdout).toMatch(/^v26\.\d+\.\d+\n$/);
  });

  it("runs node and captures stdout", { timeout: T }, async () => {
    const result = await run(["node", "-e", "console.log(1+1)"]);
    expect(result).toMatchObject({
      exitCode: 0,
      stdout: "2\n",
      truncated: false,
      timedOut: false,
      cancelled: false,
    });
  });

  it("propagates a nonzero exit", { timeout: T }, async () => {
    const result = await run(["sh", "-c", "exit 3"]);
    expect(result.exitCode).toBe(3);
  });

  it("has no network", { timeout: T }, async () => {
    const result = await run([
      "node",
      "-e",
      "fetch('https://example.com').then(()=>process.exit(0),()=>process.exit(7))",
    ]);
    expect(result.exitCode).toBe(7);
  });

  it("cannot see host credentials", { timeout: T }, async () => {
    vi.stubEnv("HELMWRIGHT_TEST_SECRET", "s3cret");
    vi.stubEnv("ANTHROPIC_API_KEY", "dummy-not-a-key");
    try {
      const result = await run(["sh", "-c", "env"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("PATH=");
      expect(result.stdout).not.toContain("s3cret");
      expect(result.stdout).not.toContain("HELMWRIGHT_TEST_SECRET");
      expect(result.stdout).not.toContain("ANTHROPIC_API_KEY");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("runs as the host user with no capabilities", { timeout: T }, async () => {
    const id = await run(["sh", "-c", "id -u; id -g"]);
    const [uid, gid] = [process.getuid?.() ?? 1000, process.getgid?.() ?? 1000];
    expect(id.stdout).toBe(`${String(uid)}\n${String(gid)}\n`);
    // CapBnd is zero only with --cap-drop ALL; CapEff alone is zero for any non-root user.
    const caps = await run(["grep", "-E", "Cap(Eff|Bnd)", "/proc/self/status"]);
    expect(caps.stdout).toMatch(/^CapEff:\s+0+\nCapBnd:\s+0+\n$/);
    const seccomp = await run(["grep", "^Seccomp:", "/proc/self/status"]);
    expect(seccomp.stdout).toBe("Seccomp:\t2\n");
  });

  it("flags a missing program as a start failure", { timeout: T }, async () => {
    const result = await run(["/nonexistent"]);
    expect(result).toMatchObject({ exitCode: 127, startFailed: true });
  });

  it(
    "has a read-only root and a writable workspace",
    { timeout: T },
    async () => {
      const etc = await run(["touch", "/etc/x"]);
      expect(etc.exitCode).not.toBe(0);
      const out = await run(["touch", "/workspace/out.txt"]);
      expect(out.exitCode).toBe(0);
      expect(existsSync(join(workspace, "out.txt"))).toBe(true);
    },
  );

  it(
    "does not follow a symlink out of the workspace",
    { timeout: T },
    async () => {
      const secret = join(outside, "secret.txt");
      writeFileSync(secret, "host-secret");
      symlinkSync(secret, join(workspace, "link"));
      const result = await run(["cat", "/workspace/link"]);
      expect(result.stdout).not.toContain("host-secret");
      expect(result.exitCode).not.toBe(0);
    },
  );

  it("kills and removes the container on timeout", { timeout: T }, async () => {
    const name = `hw-it-${randomUUID()}`;
    const started = Date.now();
    const result = await runInSandbox(
      {
        argv: ["sleep", "30"],
        image,
        workspace,
        workspaceRoot: root,
        timeoutMs: 1_500,
      },
      { containerName: name },
    );
    expect(result).toMatchObject({
      timedOut: true,
      cancelled: false,
      cleanupFailed: false,
      containerName: name,
    });
    expect(Date.now() - started).toBeLessThan(15_000);
    expectNoContainer(name);
  });

  it("cancels on external abort", { timeout: T }, async () => {
    const name = `hw-it-${randomUUID()}`;
    const controller = new AbortController();
    setTimeout(() => {
      controller.abort();
    }, 1_500);
    const result = await runInSandbox(
      {
        argv: ["sleep", "30"],
        image,
        workspace,
        workspaceRoot: root,
        timeoutMs: 30_000,
        signal: controller.signal,
      },
      { containerName: name },
    );
    expect(result).toMatchObject({
      cancelled: true,
      timedOut: false,
      cleanupFailed: false,
    });
    expectNoContainer(name);
  });

  it(
    "rejects a workspace swapped for a symlink before docker runs",
    { timeout: T },
    async () => {
      const parent = join(root, "p");
      mkdirSync(join(parent, "ws"), { recursive: true });
      mkdirSync(join(outside, "ws"));
      const name = `hw-it-${randomUUID()}`;
      const resolveEndpoint = async () => {
        const endpoint = await resolveDockerEndpoint();
        renameSync(parent, join(root, "old"));
        symlinkSync(outside, parent);
        return endpoint;
      };
      const request = {
        argv: ["touch", "/workspace/escaped"],
        image,
        workspace: join(parent, "ws"),
        workspaceRoot: root,
        timeoutMs: 30_000,
      };
      await expect(
        runInSandbox(request, { containerName: name, resolveEndpoint }),
      ).rejects.toThrow(/^SandboxRequest\.workspace /);
      expect(existsSync(join(outside, "ws", "escaped"))).toBe(false);
      expectNoContainer(name);
    },
  );

  it(
    "rejects a workspace containing the docker socket",
    { timeout: T },
    async () => {
      const host = await resolveDockerEndpoint();
      const socketDir = dirname(realpathSync(host.slice("unix://".length)));
      const name = `hw-it-${randomUUID()}`;
      const request = {
        argv: ["true"],
        image,
        workspace: socketDir,
        workspaceRoot: dirname(socketDir),
        timeoutMs: 30_000,
      };
      // Synchronous (root is / or home) or asynchronous (socket) rejection.
      await expect(
        (async () => runInSandbox(request, { containerName: name }))(),
      ).rejects.toThrow(/^SandboxRequest\.workspace/);
      expectNoContainer(name);
    },
  );

  it(
    "reaps containers of exited owners, not of live ones",
    { timeout: T },
    async () => {
      const dead = spawnSync(process.execPath, ["-e", ""]).pid;
      const create = (owner: number) => {
        const name = `helmwright-sandbox-it-${randomUUID()}`;
        const labels = [
          ...["--label", "helmwright.sandbox=it-other-instance"],
          ...["--label", `helmwright.sandbox.owner-pid=${String(owner)}`],
        ];
        const args = ["create", "--name", name, ...labels, image];
        expect(spawnSync("docker", args).status).toBe(0);
        return name;
      };
      const orphan = create(dead);
      const live = create(process.ppid);
      try {
        // Assert the outcome, not the count: a concurrent `helmwright run` (e2e tests) also reaps
        // orphans at startup and may remove this one first.
        expect(await reapSandboxContainers()).toBeGreaterThanOrEqual(0);
        expectNoContainer(orphan);
        const ps = ["ps", "-aq", "--filter", `name=${live}`];
        expect(spawnSync("docker", ps, { encoding: "utf8" }).stdout).not.toBe(
          "",
        );
      } finally {
        spawnSync("docker", ["rm", "-f", live]);
      }
    },
  );

  it("bounds captured output", { timeout: T }, async () => {
    const result = await run(
      ["node", "-e", "process.stdout.write('x'.repeat(3*1024*1024))"],
      { maxOutputBytes: 1_024 },
    );
    expect(result.exitCode).toBe(0);
    expect(result).toMatchObject({ truncated: true, stdoutTruncated: true });
    expect(result.stdout.length).toBeLessThanOrEqual(1_024);
    expect(result.stdout).toBe("x".repeat(1_024));
  });
});
