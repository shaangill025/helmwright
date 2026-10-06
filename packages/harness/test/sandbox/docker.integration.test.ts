import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  runInSandbox,
  type SandboxRequest,
  type SandboxResult,
} from "../../src/index.ts";

// Real Docker: this file fails (never skips) when Docker is unavailable.
const T = 60_000;
let image: string;
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
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "hw-sandbox-ws-")));
  outside = realpathSync(mkdtempSync(join(tmpdir(), "hw-sandbox-out-")));
  // The container runs as uid 1000; a CI runner's uid may differ.
  chmodSync(workspace, 0o777);
});
afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

const run = (
  argv: readonly string[],
  over: Partial<SandboxRequest> = {},
): Promise<SandboxResult> =>
  runInSandbox({ argv, image, workspace, timeoutMs: 30_000, ...over });

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

  it("runs as non-root with no capabilities", { timeout: T }, async () => {
    const uid = await run(["id", "-u"]);
    expect(uid.stdout).toBe("1000\n");
    // CapBnd is zero only with --cap-drop ALL; CapEff alone is zero for any non-root user.
    const caps = await run(["grep", "-E", "Cap(Eff|Bnd)", "/proc/self/status"]);
    expect(caps.stdout).toMatch(/^CapEff:\s+0+\nCapBnd:\s+0+\n$/);
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
      { argv: ["sleep", "30"], image, workspace, timeoutMs: 1_500 },
      { containerName: name },
    );
    expect(result.timedOut).toBe(true);
    expect(result.cancelled).toBe(false);
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
        timeoutMs: 30_000,
        signal: controller.signal,
      },
      { containerName: name },
    );
    expect(result).toMatchObject({ cancelled: true, timedOut: false });
    expectNoContainer(name);
  });

  it("bounds captured output", { timeout: T }, async () => {
    const result = await run(
      ["node", "-e", "process.stdout.write('x'.repeat(3*1024*1024))"],
      { maxOutputBytes: 1_024 },
    );
    expect(result.exitCode).toBe(0);
    expect(result.truncated).toBe(true);
    expect(result.stdout.length).toBeLessThanOrEqual(1_024);
    expect(result.stdout).toBe("x".repeat(1_024));
  });
});
