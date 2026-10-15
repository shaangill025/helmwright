import { spawnSync } from "node:child_process";
import type * as Fs from "node:fs";
import {
  chmodSync,
  closeSync,
  fstatSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FloorError } from "../../src/floor/events.ts";
import { KEY_FILE, recommendationKey } from "../../src/floor/key.ts";

// OQ-AD-3: the state dir's recommendation key, created on first use. linkSync,
// fstatSync and closeSync are the real ones unless a test replaces one call.
vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof Fs>();
  return {
    ...fs,
    linkSync: vi.fn(fs.linkSync),
    fstatSync: vi.fn(fs.fstatSync),
    closeSync: vi.fn(fs.closeSync),
  };
});
const realFs = await vi.importActual<typeof Fs>("node:fs");
let dir: string;
let path: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "hw-key-"));
  path = join(dir, KEY_FILE);
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const refused = () => {
  expect(() => recommendationKey(dir)).toThrow(FloorError);
};

describe("recommendationKey (OQ-AD-3)", () => {
  it("creates a 0600 key of 32 random bytes once, and reads it back", () => {
    const key = recommendationKey(dir);
    expect(key).toHaveLength(32);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readFileSync(path)).toEqual(key);
    expect(recommendationKey(dir)).toEqual(key);
    // The temporary name is gone.
    expect(readdirSync(dir)).toEqual([KEY_FILE]);
  });

  it("never replaces a key that is there", () => {
    writeFileSync(path, Buffer.alloc(32, 9), { mode: 0o600 });
    expect(recommendationKey(dir)).toEqual(Buffer.alloc(32, 9));
  });

  it("refuses a key file with another mode or size, or a symlink", () => {
    writeFileSync(path, Buffer.alloc(32, 9), { mode: 0o600 });
    chmodSync(path, 0o644);
    refused();
    chmodSync(path, 0o600);
    writeFileSync(path, Buffer.alloc(31, 9));
    refused();
    rmSync(path);
    const target = join(dir, "elsewhere");
    writeFileSync(target, Buffer.alloc(32, 9), { mode: 0o600 });
    symlinkSync(target, path);
    refused();
  });

  it("fails closed with fixed text if the state dir is missing", () => {
    expect(() => recommendationKey(join(dir, "missing"))).toThrow(
      "the recommendation key cannot be read safely",
    );
  });

  it("refuses a FIFO without blocking, a directory and a dangling symlink", () => {
    const made = spawnSync("mkfifo", [path]);
    expect(made.status).toBe(0);
    refused();
    rmSync(path);
    mkdirSync(path);
    refused();
    rmSync(path, { recursive: true });
    symlinkSync(join(dir, "nowhere"), path);
    refused();
  });

  it.each([0o400, 0o640, 0o700])("refuses a key of mode %o", (mode) => {
    writeFileSync(path, Buffer.alloc(32, 9), { mode: 0o600 });
    chmodSync(path, mode);
    refused();
  });

  it("refuses a key with a second hard link", () => {
    writeFileSync(path, Buffer.alloc(32, 9), { mode: 0o600 });
    realFs.linkSync(path, join(dir, "copy"));
    refused();
  });

  it("refuses a state dir that group or other can use", () => {
    chmodSync(dir, 0o750);
    refused();
    chmodSync(dir, 0o701);
    refused();
    // Nothing was created in it.
    expect(readdirSync(dir)).toEqual([]);
  });

  it.each([0o000, 0o077])("creates a 0600 key under umask %o", (umask) => {
    const old = process.umask(umask);
    try {
      recommendationKey(dir);
    } finally {
      process.umask(old);
    }
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it("removes the temporary name and names only the code if linking fails", () => {
    vi.mocked(linkSync).mockImplementationOnce(() => {
      throw Object.assign(new Error("EPERM: " + dir), { code: "EPERM" });
    });
    expect(() => recommendationKey(dir)).toThrow(
      new FloorError("the recommendation key cannot be read safely (EPERM)"),
    );
    expect(readdirSync(dir)).toEqual([]);
  });

  it("closes the state dir if it cannot be checked", () => {
    let dirFd: number | undefined;
    vi.mocked(fstatSync).mockImplementationOnce((fd: number) => {
      dirFd = fd;
      throw Object.assign(new Error("EIO: " + dir), { code: "EIO" });
    });
    vi.mocked(closeSync).mockClear();
    expect(() => recommendationKey(dir)).toThrow(
      new FloorError("the recommendation key cannot be read safely (EIO)"),
    );
    expect(dirFd).toBeTypeOf("number");
    expect(closeSync).toHaveBeenCalledWith(dirFd);
  });

  it("reads the key another run linked first, leaving no temporary name", async () => {
    let other: Buffer | undefined;
    let linked: unknown;
    vi.mocked(linkSync).mockImplementationOnce((temp, target) => {
      // Another run creates and links its key between this one's write and link.
      other = recommendationKey(dir);
      try {
        realFs.linkSync(temp, target);
      } catch (error) {
        linked = (error as { code?: unknown }).code;
        throw error;
      }
    });
    const [first, second] = await Promise.all([
      Promise.resolve().then(() => recommendationKey(dir)),
      Promise.resolve().then(() => recommendationKey(dir)),
    ]);
    expect(linked).toBe("EEXIST");
    expect(other).toHaveLength(32);
    expect(first).toEqual(other);
    expect(second).toEqual(other);
    expect(readFileSync(path)).toEqual(other);
    expect(readdirSync(dir)).toEqual([KEY_FILE]);
  });
});
