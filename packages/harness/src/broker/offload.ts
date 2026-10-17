import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  linkSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { validateToolEvent, type Event } from "@helmwright/schema";

/**
 * Q69: the most bytes of each output stream the sandbox captures for `execute`, so
 * that the offloaded file is complete. Past it the output is cut at source.
 */
export const OFFLOAD_SOURCE_CEILING_BYTES = 8_388_608;

/** What the log records of one offload; the pointer line is a function of it alone. */
export interface OffloadFact {
  /** Lowercase hex SHA-256 of the offloaded text (UTF-8). */
  readonly sha256: string;
  readonly bytes: number;
  /** The sandbox hit OFFLOAD_SOURCE_CEILING_BYTES, so the file is itself cut. */
  readonly truncatedAtSource: boolean;
}

/** Sets `mode` on `path` if it exists with any group/other permission bit. */
function restrict(path: string, mode: number): void {
  try {
    if ((statSync(path).mode & 0o077) !== 0) chmodSync(path, mode);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

/**
 * Writes `text` to `<dir>/<sha256>.txt` (mode 0600), once per content. It is written
 * whole to a private temporary file in `dir` and then linked to its final name, so
 * the final name never holds a partial write; an existing file is kept if it has
 * the same content. `dir` must be outside the sandbox workspace; it is made (mode
 * 0700) if missing, and an existing dir and file get their modes back.
 * @throws Error if a file of that name exists with other content.
 */
export function offload(
  text: string,
  options: { readonly dir: string },
): { sha256: string; bytes: number } {
  const sha256 = createHash("sha256").update(text, "utf8").digest("hex");
  const { dir } = options;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  restrict(dir, 0o700);
  const path = join(dir, sha256 + ".txt");
  const temp = `${path}.${String(process.pid)}.${randomBytes(6).toString("hex")}`;
  try {
    writeFileSync(temp, text, { flag: "wx", mode: 0o600 });
    try {
      linkSync(temp, path);
    } catch (error) {
      if ((error as { code?: unknown } | null)?.code !== "EEXIST") throw error;
      if (readFileSync(path, "utf8") !== text) {
        throw new Error("offload file exists and its content differs", {
          cause: error,
        });
      }
    }
  } finally {
    rmSync(temp, { force: true });
  }
  restrict(path, 0o600);
  return { sha256, bytes: Buffer.byteLength(text, "utf8") };
}

/**
 * C1 replay faults of one run's events: each `tool.output.offloaded` must have its
 * file in `dir` with the logged SHA-256 and byte count. Each fault is fixed text and
 * the event's `seq`, never payload text or a path.
 */
export function offloadFaults(events: readonly Event[], dir: string): string[] {
  const faults: string[] = [];
  for (const { seq, type, payload } of events) {
    if (type !== "tool.output.offloaded") continue;
    const { sha256, bytes } = payload;
    if (!validateToolEvent({ ...payload }) || payload["kind"] !== type) {
      faults.push(
        `seq ${String(seq)}: tool.output.offloaded is not a valid tool event`,
      );
      continue;
    }
    const fault = (why: string) =>
      faults.push(`seq ${String(seq)}: tool.output.offloaded ${why}`);
    if (typeof sha256 !== "string" || !/^[0-9a-f]{64}$/.test(sha256)) {
      fault("has no valid sha256");
      continue;
    }
    let data: Buffer;
    try {
      data = readFileSync(join(dir, sha256 + ".txt"));
    } catch {
      fault("file is missing");
      continue;
    }
    const actual = createHash("sha256").update(data).digest("hex");
    if (actual !== sha256 || data.length !== bytes) {
      fault("file does not match its logged sha256 and bytes");
    }
  }
  return faults;
}

/** The pointer line of a tool result, built from the logged facts alone (Q68a). */
export function pointerLine(fact: OffloadFact): string {
  const { sha256, bytes, truncatedAtSource } = fact;
  const cut = truncatedAtSource
    ? `, truncated at source: only the first ${String(OFFLOAD_SOURCE_CEILING_BYTES)} bytes of each stream were captured`
    : "";
  return `[output offloaded: ${String(bytes)} bytes${cut}, sha256 ${sha256}]`;
}

const isContinuation = (byte: number | undefined): boolean =>
  byte !== undefined && (byte & 0xc0) === 0x80;

/**
 * About `limit` bytes of `text`, two thirds from its head and one third from its
 * tail, each cut on a character edge, then `pointer` on its own line.
 */
export function withPreview(
  text: string,
  limit: number,
  pointer: string,
): string {
  const bytes = Buffer.from(text, "utf8");
  const headLen = Math.floor((limit * 2) / 3);
  const tailLen = limit - headLen;
  let headEnd = Math.min(headLen, bytes.length);
  while (headEnd > 0 && isContinuation(bytes[headEnd])) headEnd -= 1;
  let tailStart = Math.max(bytes.length - tailLen, headEnd);
  while (tailStart < bytes.length && isContinuation(bytes[tailStart])) {
    tailStart += 1;
  }
  const head = bytes.subarray(0, headEnd).toString("utf8");
  const tail = bytes.subarray(tailStart).toString("utf8");
  return [head, tail, pointer].join("\n");
}
