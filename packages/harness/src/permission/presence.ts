import type { Readable, Writable } from "node:stream";
import { displayText } from "./policy.ts";

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
/** Longer lines deny at once; their rest, up to the next line end, is dropped. */
const MAX_LINE = 1024;
/** Default window after a prompt is shown in which typed input is dropped. */
export const PRESENCE_GRACE_MS = 250;
const MAX_GRACE_MS = 10_000;

export interface TtyPresenceOptions {
  /** Input read within this many ms after a prompt is shown is discarded: an integer in [0, 10000]. */
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
  | { kind: "line"; text: string }
  | { kind: "eof" }
  | { kind: "aborted" }
  | { kind: "interrupt" };

/** A terminal input (`tty.ReadStream`): it can switch to raw mode. */
interface RawInput {
  readonly isRaw?: boolean;
  setRawMode(raw: boolean): unknown;
}
const rawInput = (input: Readable): RawInput | undefined =>
  typeof (input as Partial<RawInput>).setRawMode === "function"
    ? (input as Readable & RawInput)
    : undefined;

const CTRL_C = "\u0003";
const CTRL_D = "\u0004";
const CONTROL = /\p{Cc}/u;
const DISCARDED = "(input discarded; answer again)\n";

/**
 * The owner at a terminal: each ask writes its prompt to `output` and waits for one
 * line on `input`. Asks are served one at a time, in order; there is no
 * approve-for-session. End of input, or an input error, denies this and every later
 * ask as "cancelled" (the owner did not answer). `input` is read only while an ask
 * waits, so it never keeps the process alive.
 *
 * Type-ahead never answers. Every byte read after the prompt is written and before
 * the window opens is discarded, a partial line too, and so is anything left from an
 * earlier ask. The window opens in a setImmediate scheduled by a timer that fires at
 * least `graceMs` after the prompt was written, so at least one poll phase that
 * discards input runs after `graceMs`: input the terminal queued earlier, or that a
 * blocked event loop delivers late, is discarded. Discarding is told to the owner
 * once per ask. Node cannot flush a terminal's input queue (no tcflush), so a byte
 * the kernel delivers only after that poll phase can still count.
 *
 * At a TTY (`input` has setRawMode) an ask waits in raw mode, so the terminal holds
 * no partial line that an Enter after the window would complete: keys are echoed
 * here (escaped; control keys never), Backspace and DEL erase, Enter (CR or LF) ends
 * the line, Ctrl-D on an empty line is end of input, and Ctrl-C cancels the ask (at
 * any time) and then raises SIGINT for the process. The previous mode is restored
 * when the ask ends in any way, and on process exit while it waits. Other inputs
 * end a line at LF.
 *
 * N-5: presence is a TTY, not proof of a human: a program that drives a pty
 * (`yes | script …`) approves once the window opens. Each answer's attestation
 * stays "none" until slice SIG.
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
  let ended = false;
  const markEnded = () => {
    ended = true;
  };
  // Q5: an error or end between asks never crashes; it ends input.
  input.on("error", markEnded).on("end", markEnded);
  /** Set after an overlong line: drop input up to the next line end. */
  let skipping = false;
  let queue: Promise<unknown> = Promise.resolve();

  const readLine = (signal: AbortSignal, raw: boolean) =>
    new Promise<Read>((done) => {
      const shownAt = performance.now();
      let open = false;
      let discarded = false;
      let timer: NodeJS.Timeout | undefined;
      let immediate: NodeJS.Immediate | undefined;
      /** The line's code points, and how many columns each echoed. */
      const keys: string[] = [];
      const echoed: number[] = [];
      const lineEnd = (c: string) => c === "\n" || (raw && c === "\r");
      const finish = (read: Read) => {
        clearTimeout(timer);
        if (immediate !== undefined) clearImmediate(immediate);
        input.off("data", onData).off("end", onEnd).off("error", onEnd);
        signal.removeEventListener("abort", onAbort);
        input.pause();
        done(read);
      };
      const key = (c: string): Read | undefined => {
        if (raw && c === CTRL_C) return { kind: "interrupt" };
        if (!open) {
          // Type-ahead: never an answer, nor the start of one.
          discarded = true;
          if (lineEnd(c)) skipping = false;
          return undefined;
        }
        if (skipping) {
          if (lineEnd(c)) skipping = false;
          return undefined;
        }
        if (lineEnd(c)) {
          if (raw) output.write("\n");
          return { kind: "line", text: keys.join("") };
        }
        if (raw && c === CTRL_D) {
          return keys.length === 0 ? { kind: "eof" } : undefined;
        }
        if (raw && (c === "\u007f" || c === "\b")) {
          keys.pop();
          output.write("\b \b".repeat(echoed.pop() ?? 0));
          return undefined;
        }
        if (keys.length >= MAX_LINE) {
          skipping = true;
          return { kind: "line", text: "" };
        }
        keys.push(c);
        // A control key is never echoed; it stays in the line, which then denies.
        const shown = !raw || CONTROL.test(c) ? "" : displayText(c);
        if (shown !== "") output.write(shown);
        echoed.push(Array.from(shown).length);
        return undefined;
      };
      const onData = (chunk: string) => {
        let read: Read | undefined;
        for (const c of chunk) {
          if (read === undefined) read = key(c);
          // The rest of the chunk is dropped, but it may end an overlong line.
          else if (skipping && lineEnd(c)) skipping = false;
        }
        if (read !== undefined) finish(read);
      };
      const onEnd = () => {
        ended = true;
        finish({ kind: "eof" });
      };
      const onAbort = () => {
        finish({ kind: "aborted" });
      };
      // The loop's cached time can lag: re-arm until graceMs has really passed.
      const arm = (ms: number) => {
        timer = setTimeout(() => {
          const left = shownAt + graceMs - performance.now();
          if (left > 0) {
            arm(Math.ceil(left));
            return;
          }
          immediate = setImmediate(() => {
            open = true;
            if (discarded) output.write(DISCARDED);
          });
        }, ms);
      };
      arm(graceMs);
      input.on("data", onData).once("end", onEnd).once("error", onEnd);
      signal.addEventListener("abort", onAbort, { once: true });
      input.resume();
    });

  const one = async (
    request: PresenceRequest,
    signal: AbortSignal,
  ): Promise<PresenceAnswer> => {
    if (signal.aborted) return CANCELLED;
    if (ended || input.readableEnded || input.destroyed) return CANCELLED;
    const tty = rawInput(input);
    const was = tty?.isRaw === true;
    const restore = () => {
      tty?.setRawMode(was);
    };
    let read: Read;
    try {
      tty?.setRawMode(true);
      if (tty !== undefined) process.on("exit", restore);
      output.write(request.prompt);
      read = await readLine(signal, tty !== undefined);
    } finally {
      process.off("exit", restore);
      restore();
    }
    switch (read.kind) {
      case "aborted":
      case "interrupt":
        output.write("\nhelmwright: ask cancelled\n");
        // Ctrl-C in raw mode raised no signal: raise it, so the run cancels as before.
        if (read.kind === "interrupt") process.kill(process.pid, "SIGINT");
        return CANCELLED;
      case "eof":
        output.write("\n");
        return CANCELLED;
      case "line":
        return isApproval(read.text) ? APPROVED : DENIED;
    }
  };

  return {
    ask(request, signal) {
      const turn = queue.then(() => one(request, signal));
      queue = turn.catch(() => undefined);
      return turn;
    },
  };
}
