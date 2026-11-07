import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KeychainError, readKeychainKey } from "../../src/proxy/keychain.ts";

const FAKE_KEY = "sk-ant-FAKE-not-a-real-key-0123456789";
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "hw-keychain-"));
});
afterEach(() => {
  delete process.env["ANTHROPIC_API_KEY"];
  rmSync(dir, { recursive: true, force: true });
});

const fakeSecurity = (script: string): string => {
  const path = join(dir, "security");
  writeFileSync(path, `#!/bin/sh\n${script}\n`);
  chmodSync(path, 0o755);
  return path;
};

describe("keychain", () => {
  it("reads the key with the exact argv and a scrubbed environment", async () => {
    const path = fakeSecurity(
      `[ "$*" = "find-generic-password -s helmwright-anthropic -w" ] || exit 44\n` +
        `[ -z "$ANTHROPIC_API_KEY" ] || exit 45\n` +
        `echo "${FAKE_KEY}"`,
    );
    process.env["ANTHROPIC_API_KEY"] = "should-not-leak";
    await expect(readKeychainKey({ securityPath: path })).resolves.toBe(
      FAKE_KEY,
    );
  });

  it("fails with a typed error and no env fallback", async () => {
    const path = fakeSecurity("exit 44");
    process.env["ANTHROPIC_API_KEY"] = "env-key-must-not-be-used";
    const err: unknown = await readKeychainKey({ securityPath: path }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(KeychainError);
    expect((err as KeychainError).code).toBe("not_found");
    expect((err as Error).message).not.toContain("env-key-must-not-be-used");
  });

  it("fails when the tool is missing or prints nothing", async () => {
    const missing: unknown = await readKeychainKey({
      securityPath: join(dir, "absent"),
    }).catch((e: unknown) => e);
    expect((missing as KeychainError).code).toBe("unavailable");
    const empty: unknown = await readKeychainKey({
      securityPath: fakeSecurity("echo"),
    }).catch((e: unknown) => e);
    expect((empty as KeychainError).code).toBe("empty");
  });

  const failure = async (
    script: string,
    options: { timeoutMs?: number } = {},
  ) => {
    const err: unknown = await readKeychainKey({
      securityPath: fakeSecurity(script),
      ...options,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(KeychainError);
    return err as KeychainError;
  };

  it("maps only exit status 44 to not_found", async () => {
    expect((await failure("exit 44")).code).toBe("not_found");
    for (const status of [1, 2, 36, 45, 128]) {
      expect(
        (await failure(`exit ${String(status)}`)).code,
        String(status),
      ).toBe("unavailable");
    }
  });

  it("maps an output overrun to unavailable", async () => {
    const err = await failure("head -c 200000 /dev/zero | tr '\\0' a");
    expect(err.code).toBe("unavailable");
    expect(err.message).not.toContain("aaaa");
  });

  it("maps a timeout to unavailable", async () => {
    const err = await failure("exec sleep 5", { timeoutMs: 200 });
    expect(err.code).toBe("unavailable");
  });
});
