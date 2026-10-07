import type { Readable, Writable } from "node:stream";

/** One ask: the call it is for and the exact text to show, already escaped. */
export interface PresenceRequest {
  readonly toolCallId: string;
  /** Shown verbatim; `permission.asked` holds its SHA-256. */
  readonly prompt: string;
}

/** How an ask ended. Only an owner at the terminal approves. */
export type PresenceAnswer =
  | { readonly answer: "approved"; readonly by: "tty" }
  | { readonly answer: "denied"; readonly by: "tty" | "cancelled" };

/** Someone who can answer an ask (B9b-3: the owner at a TTY; slice SIG wraps it). */
export interface Presence {
  /** Never rejects; an abort of `signal` ends the ask as denied by "cancelled". */
  ask(request: PresenceRequest, signal: AbortSignal): Promise<PresenceAnswer>;
}

const APPROVED: PresenceAnswer = { answer: "approved", by: "tty" };
const DENIED: PresenceAnswer = { answer: "denied", by: "tty" };
const CANCELLED: PresenceAnswer = { answer: "denied", by: "cancelled" };
/** Longer lines deny at once; their rest, up to the next newline, is dropped. */
const MAX_LINE = 1024;
/** Default window after a prompt is shown in which typed input is dropped. */
export const PRESENCE_GRACE_MS = 250;
const MAX_GRACE_MS = 10_000;

export interface TtyPresenceOptions {
  /** Input arriving within this many ms after a prompt is shown is dropped: an integer in [0, 10000]. */
  readonly graceMs?: number;
}

/**
 * The approval rule: the line, less one trailing CR, is exactly "y". "Y", "yes",
 * " y" and every other line deny, so a stray key or pasted text never approves.
 */
export function isApproval(line: string): boolean {
  return (line.endsWith("\r") ? line.slice(0, -1) : line) === "y";
}

type Read =
  { kind: "line"; text: string } | { kind: "eof" } | { kind: "aborted" };

/**
 * The owner at a terminal: each ask writes its prompt to `output` and waits for one
 * line on `input`. Asks are served one at a time, in order; there is no
 * approve-for-session. End of input denies this and every later ask. `input` is
 * read only while an ask waits, so it never keeps the process alive.
 *
 * Type-ahead never answers (no approve-for-session): a line answers an ask only if
 * its first character arrives more than `graceMs` after the prompt was written.
 * Node cannot flush a terminal's input queue (no tcflush); input typed earlier is
 * delivered right after the read resumes, inside the window, so it is dropped, as is
 * anything left over from an earlier ask and any line begun before the window ended.
 * @throws RangeError unless `graceMs` is an integer in [0, 10000].
 */
export function createTtyPresence(
  input: Readable,
  output: Writable,
  options: TtyPresenceOptions = {},
): Presence {
  const graceMs = options.graceMs ?? PRESENCE_GRACE_MS;
  if (!Number.isInteger(graceMs) || graceMs < 0 || graceMs > MAX_GRACE_MS) {
    throw new RangeError(
      `graceMs must be an integer in [0, ${String(MAX_GRACE_MS)}]`,
    );
  }
  input.setEncoding("utf8");
  input.pause();
  let buffered = "";
  let ended = false;
  /** Set after an overlong line: drop input up to the next newline. */
  let skipping = false;
  /** When the current prompt's grace window ends (performance.now()). */
  let windowEnd = 0;
  let queue: Promise<unknown> = Promise.resolve();

  /** The next complete line in `buffered`, an overlong one, or undefined. */
  const take = (): Read | undefined => {
    for (;;) {
      const at = buffered.indexOf("\n");
      if (skipping) {
        if (at === -1) {
          buffered = "";
          return undefined;
        }
        buffered = buffered.slice(at + 1);
        skipping = false;
        continue;
      }
      if (at !== -1) {
        const text = buffered.slice(0, at);
        buffered = buffered.slice(at + 1);
        return { kind: "line", text: text.length > MAX_LINE ? "" : text };
      }
      if (buffered.length > MAX_LINE) {
        buffered = "";
        skipping = true;
        return { kind: "line", text: "" };
      }
      return undefined;
    }
  };

  const readLine = (signal: AbortSignal) =>
    new Promise<Read>((done) => {
      const ready = take();
      if (ready !== undefined) {
        done(ready);
        return;
      }
      if (ended) {
        done({ kind: "eof" });
        return;
      }
      const finish = (read: Read) => {
        input.off("data", onData).off("end", onEnd).off("error", onEnd);
        signal.removeEventListener("abort", onAbort);
        input.pause();
        done(read);
      };
      const onData = (chunk: string) => {
        if (performance.now() < windowEnd) {
          // Type-ahead: never an answer, nor the start of one.
          skipping = !chunk.endsWith("\n");
          return;
        }
        buffered += chunk;
        const read = take();
        if (read !== undefined) finish(read);
      };
      const onEnd = () => {
        ended = true;
        finish({ kind: "eof" });
      };
      const onAbort = () => {
        finish({ kind: "aborted" });
      };
      input.on("data", onData).once("end", onEnd).once("error", onEnd);
      signal.addEventListener("abort", onAbort, { once: true });
      input.resume();
    });

  const one = async (
    request: PresenceRequest,
    signal: AbortSignal,
  ): Promise<PresenceAnswer> => {
    if (signal.aborted) return CANCELLED;
    // Whatever is left from before this prompt is type-ahead, a partial line too.
    skipping ||= buffered !== "" && !buffered.endsWith("\n");
    buffered = "";
    output.write(request.prompt);
    windowEnd = performance.now() + graceMs;
    const read = await readLine(signal);
    if (read.kind === "aborted") {
      output.write("\nhelmwright: ask cancelled\n");
      return CANCELLED;
    }
    if (read.kind === "eof") {
      output.write("\n");
      return DENIED;
    }
    return isApproval(read.text) ? APPROVED : DENIED;
  };

  return {
    ask(request, signal) {
      const turn = queue.then(() => one(request, signal));
      queue = turn.catch(() => undefined);
      return turn;
    },
  };
}
