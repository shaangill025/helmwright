import { randomBytes, randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readSync,
  rmSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";
import { FloorError } from "./events.ts";

/** The recommendation key's file in the state dir (OQ-AD-3); its bytes are never logged. */
export const KEY_FILE = "recommendation.key";
const KEY_BYTES = 32;

/** An errno code as fixed text, never the error's message (which can hold a path). */
const ERRNO = /^E[A-Z0-9]{1,15}$/;

/** The key at `path`: a regular file of KEY_BYTES bytes with one link, mode 0600, owned by this user. */
function readKey(path: string): Buffer {
  const flags =
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
  const fd = openSync(path, flags);
  try {
    const stat = fstatSync(fd);
    const key = Buffer.alloc(KEY_BYTES);
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      (stat.mode & 0o777) !== 0o600 ||
      stat.uid !== process.getuid?.() ||
      stat.size !== KEY_BYTES ||
      readSync(fd, key, 0, KEY_BYTES, 0) !== KEY_BYTES
    ) {
      throw new FloorError(
        "the recommendation key is not a 0600 file of 32 bytes, one link, owned by this user",
      );
    }
    return key;
  } finally {
    closeSync(fd);
  }
}

/**
 * The state dir, opened: a directory of this user with no group or other bits, as
 * openSessionLog leaves it, so no other user can swap the key's name.
 */
function openStateDir(stateDir: string): number {
  const fd = openSync(stateDir, constants.O_RDONLY | constants.O_DIRECTORY);
  try {
    const stat = fstatSync(fd);
    if (
      !stat.isDirectory() ||
      stat.uid !== process.getuid?.() ||
      (stat.mode & 0o077) !== 0
    ) {
      throw new FloorError("the state dir is not this user's alone");
    }
    return fd;
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}

/**
 * Writes a new random key next to `path` and links it there, which never replaces a
 * key another run linked first; the temporary name is removed either way. A new link
 * is made durable by fsyncing `dirFd`, the state dir.
 */
function createKey(path: string, dirFd: number): void {
  const temp = path + "." + randomUUID();
  try {
    // "wx": O_CREAT | O_EXCL, which also refuses a symlink.
    const fd = openSync(temp, "wx", 0o600);
    try {
      fchmodSync(fd, 0o600); // whatever the umask
      writeSync(fd, randomBytes(KEY_BYTES));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    linkSync(temp, path);
    fsyncSync(dirFd);
  } catch (error) {
    if ((error as { code?: unknown }).code !== "EEXIST") throw error;
  } finally {
    rmSync(temp, { force: true });
  }
}

/**
 * The state dir's recommendation key (OQ-AD-3), created on first use: 32 random bytes
 * in `<stateDir>/recommendation.key`, mode 0600, so A3 can derive each nonce again.
 * `stateDir` must be this user's with no group or other bits (openSessionLog makes it
 * so); otherwise it is refused.
 * @throws FloorError with fixed text if it cannot be created or read (naming only the
 * errno code), the state dir is not this user's alone, or the file is not a 0600
 * regular file of 32 bytes with one link owned by this user (fail closed)
 */
export function recommendationKey(stateDir: string): Buffer {
  const path = join(stateDir, KEY_FILE);
  let dirFd: number | undefined;
  try {
    dirFd = openStateDir(stateDir);
    if (lstatSync(path, { throwIfNoEntry: false }) === undefined) {
      createKey(path, dirFd);
    }
    return readKey(path);
  } catch (error) {
    if (error instanceof FloorError) throw error;
    // No cause: like the floor's other errors, the text is all that is kept.
    const code = (error as { code?: unknown }).code;
    const shown =
      typeof code === "string" && ERRNO.test(code) ? " (" + code + ")" : "";
    throw new FloorError(
      "the recommendation key cannot be read safely" + shown,
    );
  } finally {
    if (dirFd !== undefined) closeSync(dirFd);
  }
}
