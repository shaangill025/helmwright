import {
  chmodSync,
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
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FloorError } from "../../src/floor/events.ts";
import { KEY_FILE, recommendationKey } from "../../src/floor/key.ts";

// OQ-AD-3: the state dir's recommendation key, created on first use.
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
});
