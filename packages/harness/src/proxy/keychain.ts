import { execFile } from "node:child_process";

export const KEYCHAIN_SERVICE = "helmwright-anthropic";
export const DEFAULT_SECURITY_PATH = "/usr/bin/security";

export type KeychainErrorCode = "not_found" | "unavailable" | "empty";

/**
 * The key could not be read. There is no fallback to an environment variable; the
 * message never carries the tool's output.
 */
export class KeychainError extends Error {
  readonly code: KeychainErrorCode;
  constructor(code: KeychainErrorCode, message: string) {
    super(message);
    this.name = "KeychainError";
    this.code = code;
  }
}

export interface KeychainOptions {
  /** Path of the macOS `security` tool; injectable for tests. */
  securityPath?: string;
  /** Kill the tool after this long (default 15000 ms); injectable for tests. */
  timeoutMs?: number;
}

/**
 * Exit status of `security find-generic-password` when no item matches
 * (errSecItemNotFound); checked against the real tool on macOS. Every other
 * status, a timeout and an output overrun map to "unavailable".
 */
const NOT_FOUND_STATUS = 44;

/**
 * Read the Anthropic key from the macOS Keychain (generic password, service
 * `helmwright-anthropic`): execFile with an argv array (no shell) and a scrubbed
 * environment. The caller keeps the key in process memory only.
 */
export function readKeychainKey(
  options: KeychainOptions = {},
): Promise<string> {
  const file = options.securityPath ?? DEFAULT_SECURITY_PATH;
  const env: Record<string, string> = { PATH: "/usr/bin:/bin" };
  for (const name of ["HOME", "USER", "LOGNAME"]) {
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }
  return new Promise((resolve, reject) => {
    execFile(
      file,
      ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"],
      {
        env,
        timeout: options.timeoutMs ?? 15_000,
        maxBuffer: 64 * 1024,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error !== null) {
          const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
          reject(
            missing
              ? new KeychainError(
                  "unavailable",
                  `security tool not found at ${file}`,
                )
              : (error as { code?: unknown }).code === NOT_FOUND_STATUS
                ? new KeychainError(
                    "not_found",
                    `no Keychain item for service ${KEYCHAIN_SERVICE}`,
                  )
                : new KeychainError(
                    "unavailable",
                    "the security tool could not run",
                  ),
          );
          return;
        }
        const key = stdout.replace(/\r?\n$/u, "");
        if (key.trim() === "") {
          reject(new KeychainError("empty", "the Keychain item is empty"));
          return;
        }
        resolve(key);
      },
    );
  });
}
