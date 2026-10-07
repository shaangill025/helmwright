import type { Readable, Writable } from "node:stream";
import { displayText } from "./policy.ts";

/** One ask: the call it is for and the exact text to show, already escaped. */
export interface PresenceRequest {
  readonly toolCallId: string;
  /** Shown verbatim; `permission.asked` holds its SHA-256. */
  readonly prompt: string;
  /**
   * B9b-3c: the full values the prompt could only summarize, already escaped; lines
   * end at LF. When present, an approval counts only after the whole view was shown
   * in this ask. `permission.asked` holds its SHA-256.
   */
  readonly view?: string;
}

/**
 * How an ask ended. Only an owner at the terminal approves. `viewed` is present
 * when the request had a view: whether it was shown to its end in this ask.
 */
export type PresenceAnswer =
  | {
      readonly answer: "approved";
      readonly by: "tty";
      readonly viewed?: boolean;
    }
  | {
      readonly answer: "denied";
      readonly by: "tty" | "cancelled";
      readonly viewed?: boolean;
    };

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
const VIEW_FIRST = "(view the full value first: v)\n";
const more = (page: number, pages: number) =>
  `-- more (page ${String(page)}/${String(pages)}): space/Enter next, q stop --`;
const END = "-- end of view: space/Enter --";
/** SF4: starts every view row, so no value can pose as a marker or a prompt. */
const GUTTER = "| ";
/** SF1: page keys typed this many ms after a page is shown are dropped. */
const PAGE_KEY_MS = 150;

/** R1: a smaller terminal is told so; the view is not shown. */
const TOO_SMALL = "terminal too small to show the value (need 48×8)\n";
/** N2: a terminal size from the output, at most `max`, or `fallback` if unknown. */
const sized = (n: unknown, max: number, fallback: number) =>
  typeof n === "number" && Number.isInteger(n) && n > 0
    ? Math.min(max, n)
    : fallback;

/**
 * `text` split at LF and wrapped hard to rows of at most `width` columns. Each code
 * point from U+1100 on counts as 2 columns, so a wide character never overflows.
 */
function wrap(text: string, width: number): string[] {
  const rows: string[] = [];
  for (const line of text.split("\n")) {
    let row = "";
    let used = 0;
    for (const c of line) {
      const w = (c.codePointAt(0) ?? 0) < 0x1100 ? 1 : 2;
      if (used + w > width && row !== "") {
        rows.push(row);
        row = "";
        used = 0;
      }
      row += c;
      used += w;
    }
    rows.push(row);
  }
  return rows;
}

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
 * B9b-3c: for a request with a view, the line "v" shows the view, and "y" approves
 * only once the view was shown to its end in this ask; before that it says so and
 * waits. On a terminal under 48 columns or 8 rows (80 by 24 if unknown) "v" only
 * says so. At a TTY the view is paged on `output` (each row behind a gutter,
 * wrapped at its columns; a page and its marker fit its rows): space or Enter,
 * taken only 150 ms after a page is shown, turns the page; at the end marker
 * ("space/Enter") it completes the view. q or Ctrl-D stops (the view does
 * not count), Ctrl-C cancels as above; other keys are ignored. Elsewhere the whole
 * view is written at once. After the view the prompt's last two lines, after the
 * "view first" note its last line, are shown again and a new window starts.
 * Only this module writes the view: no external pager ($PAGER) ever runs.
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
  /** After an overlong line: drop input to the next line end (a TTY ask resets it). */
  let skipping = false;
  let queue: Promise<unknown> = Promise.resolve();

  /** One line after a new window; or, with `pageKey`, one key at once (raw only). */
  const readLine = (signal: AbortSignal, raw: boolean, pageKey = false) =>
    new Promise<Read>((done) => {
      const shownAt = performance.now();
      let open = pageKey;
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
        if (pageKey) {
          const early = performance.now() - shownAt < PAGE_KEY_MS;
          return early ? undefined : { kind: "line", text: c };
        }
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
      if (!pageKey) arm(graceMs);
      input.on("data", onData).once("end", onEnd).once("error", onEnd);
      signal.addEventListener("abort", onAbort, { once: true });
      input.resume();
    });

  /**
   * Shows `view`, each row behind GUTTER: true if it was shown to its end, false if
   * stopped (q or Ctrl-D), or how input ended. In raw mode it is paged, and only a
   * key at the end marker completes it (B1); N7: otherwise it is written at once and
   * counts as viewed (library use: the CLI asks only at a TTY).
   */
  const showView = async (
    view: string,
    signal: AbortSignal,
    raw: boolean,
  ): Promise<boolean | Read> => {
    const size = output as Writable & { columns?: unknown; rows?: unknown };
    const columns = sized(size.columns, 512, 80);
    const height = sized(size.rows, 200, 24);
    if (columns < 48 || height < 8) {
      output.write(TOO_SMALL);
      return false;
    }
    const rows = wrap(view, columns - GUTTER.length).map((r) => GUTTER + r);
    if (!raw) {
      output.write(rows.join("\n") + "\n");
      return true;
    }
    /** Terminal rows a marker takes (R1): the longest is more(n, n). */
    const tall = (marker: string) => Math.ceil(marker.length / columns);
    const page = height - 1 - tall(more(rows.length, rows.length));
    const pages = Math.ceil(rows.length / page);
    for (let at = 1; ; at += 1) {
      output.write(rows.slice((at - 1) * page, at * page).join("\n") + "\n");
      const marker = at < pages ? more(at, pages) : END;
      output.write(marker);
      let key: Read;
      do {
        key = await readLine(signal, true, true);
        if (key.kind !== "line") return key;
      } while (![" ", "\r", "\n", "q", CTRL_D].includes(key.text));
      // R1: erase each terminal row of the marker, from its last up.
      output.write(
        "\r\u001b[K" + "\u001b[A\r\u001b[K".repeat(tall(marker) - 1),
      );
      if (key.text === "q" || key.text === CTRL_D) return false;
      if (at === pages) return true;
    }
  };

  const one = async (
    request: PresenceRequest,
    signal: AbortSignal,
  ): Promise<PresenceAnswer> => {
    const { prompt, view } = request;
    let viewed = false;
    const seen = () => (view === undefined ? {} : { viewed });
    if (signal.aborted || ended || input.readableEnded || input.destroyed) {
      return { ...CANCELLED, ...seen() };
    }
    const tty = rawInput(input);
    const was = tty?.isRaw === true;
    const restore = () => {
      tty?.setRawMode(was);
    };
    let read: Read;
    try {
      tty?.setRawMode(true);
      if (tty !== undefined) {
        process.on("exit", restore);
        // Nit-1: in raw mode no terminal line is left over: each ask starts fresh.
        skipping = false;
      }
      output.write(prompt);
      for (;;) {
        read = await readLine(signal, tty !== undefined);
        if (view === undefined || read.kind !== "line") break;
        if (isApproval(read.text) && !viewed) {
          output.write(VIEW_FIRST + prompt.slice(prompt.lastIndexOf("\n") + 1));
          continue;
        }
        const line = read.text.endsWith("\r")
          ? read.text.slice(0, -1)
          : read.text;
        if (line !== "v") break;
        const shown = await showView(view, signal, tty !== undefined);
        if (typeof shown !== "boolean") {
          read = shown;
          break;
        }
        viewed ||= shown;
        // B1: the target summary and Approve lines, so they fit below the last page.
        output.write(prompt.split("\n").slice(-2).join("\n"));
      }
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
        return { ...CANCELLED, ...seen() };
      case "eof":
        // Nit-2: Ctrl-D too ends input, so every later ask is denied at once.
        ended = true;
        output.write("\n");
        return { ...CANCELLED, ...seen() };
      case "line":
        // With a view, "y" ends the loop above only once it was viewed.
        return { ...(isApproval(read.text) ? APPROVED : DENIED), ...seen() };
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
