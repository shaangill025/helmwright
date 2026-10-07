import { PassThrough, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { createTtyPresence, isApproval } from "../../src/index.ts";

const GRACE_MS = 40;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tick = () => sleep(10);
/** Past the grace window after a prompt is shown. */
const later = () => sleep(GRACE_MS + 30);

/** A presence on in-memory streams: what the owner types, and what was shown. */
function terminal(graceMs = GRACE_MS, input = new PassThrough()) {
  const output = new PassThrough();
  let shown = "";
  output.setEncoding("utf8").on("data", (d: string) => (shown += d));
  return {
    input,
    presence: createTtyPresence(input, output, { graceMs }),
    shown: () => shown,
    /** Types `text` once the window after the latest prompt has passed. */
    type: async (text: string) => {
      await later();
      input.write(text);
    },
  };
}

const CANCELLED = { answer: "denied", by: "cancelled" };
const DISCARDED = "(input discarded; answer again)\n";

/** A fake TTY input: records each setRawMode call. */
function ttyInput() {
  const modes: boolean[] = [];
  const input = Object.assign(new PassThrough(), {
    isTTY: true,
    isRaw: false,
    setRawMode(on: boolean) {
      input.isRaw = on;
      modes.push(on);
      return input;
    },
  });
  return { input, modes };
}

const ask = (toolCallId: string) => ({ toolCallId, prompt: toolCallId + "? " });
const never = () => new AbortController().signal;

describe("TTY presence", () => {
  it.each(["y", "y\r"])("approves only the line y (%j)", async (line) => {
    const { presence, shown, type } = terminal();
    const answer = presence.ask(ask("call-1"), never());
    await tick();
    expect(shown()).toBe("call-1? ");
    await type(line + "\n");
    expect(await answer).toEqual({ answer: "approved", by: "tty" });
  });

  it.each(["Y", "yes", " y", "y ", "", "n", "no", "‮y"])(
    "denies any other line (%j)",
    async (line) => {
      const { presence, type } = terminal();
      const answer = presence.ask(ask("call-1"), never());
      await type(line + "\n");
      expect(await answer).toEqual({ answer: "denied", by: "tty" });
    },
  );

  it("reads a line split across chunks", async () => {
    const { input, presence, type } = terminal();
    const answer = presence.ask(ask("call-1"), never());
    await type("y");
    await tick();
    input.write("\n");
    expect(await answer).toEqual({ answer: "approved", by: "tty" });
  });

  // N-1: at end of input the owner did not answer.
  it("denies at end of input as cancelled, then every later ask", async () => {
    const { input, presence } = terminal();
    const answer = presence.ask(ask("call-1"), never());
    input.end();
    expect(await answer).toEqual(CANCELLED);
    expect(await presence.ask(ask("call-2"), never())).toEqual(CANCELLED);
  });

  // Q5: an input error between asks neither crashes nor waits forever.
  it("survives an input error between asks, then denies", async () => {
    const { input, presence } = terminal();
    expect(() => input.emit("error", new Error("EIO"))).not.toThrow();
    expect(await presence.ask(ask("call-1"), never())).toEqual(CANCELLED);
  });

  it("denies at once when input ended before the ask", async () => {
    const input = new PassThrough();
    input.resume().end();
    await tick();
    expect(input.readableEnded).toBe(true);
    const { presence } = terminal(GRACE_MS, input);
    const answer = presence.ask(ask("call-1"), never());
    expect(await Promise.race([answer, sleep(200).then(() => "hung")])).toEqual(
      CANCELLED,
    );
  });

  // S-1: a line queued before the prompt and delivered after a blocked event loop
  // (longer than the window) is still type-ahead: no read opens the window early.
  it("drops buffered input delivered after a blocked event loop", async () => {
    const input = new PassThrough();
    let shown = "";
    const output = new Writable({
      write(chunk: Buffer, _encoding, done) {
        shown += chunk.toString();
        // Right after the prompt is written: block past the window.
        queueMicrotask(() => {
          const until = performance.now() + GRACE_MS + 30;
          while (performance.now() < until);
        });
        done();
      },
    });
    const presence = createTtyPresence(input, output, { graceMs: GRACE_MS });
    input.write("y\n");
    const answer = presence.ask(ask("call-1"), never());
    await later(); // ends with the block, inside the window
    await later();
    input.write("n\n");
    expect(await answer).toEqual({ answer: "denied", by: "tty" });
    expect(shown).toContain("call-1? ");
  });

  // N-2: the owner learns that what was typed in the window was dropped.
  it("says once that input in the window was discarded", async () => {
    const { input, presence, shown, type } = terminal();
    const answer = presence.ask(ask("call-1"), never());
    await tick();
    input.write("y");
    input.write("y\n");
    await type("n\n");
    expect(await answer).toEqual({ answer: "denied", by: "tty" });
    expect(shown().split(DISCARDED)).toHaveLength(2);
    const quiet = terminal();
    const next = quiet.presence.ask(ask("call-2"), never());
    await quiet.type("n\n");
    await next;
    expect(quiet.shown()).not.toContain(DISCARDED);
  });

  it("denies an overlong line; its tail answers nothing", async () => {
    const { input, presence, type } = terminal();
    const first = presence.ask(ask("call-1"), never());
    await type("x".repeat(2000));
    expect(await first).toEqual({ answer: "denied", by: "tty" });
    const second = presence.ask(ask("call-2"), never());
    await type("y\n"); // the end of the overlong line: dropped
    input.write("n\n");
    expect(await second).toEqual({ answer: "denied", by: "tty" });
  });

  it("ends an ask as cancelled on abort", async () => {
    const { presence, shown, type } = terminal();
    const controller = new AbortController();
    const answer = presence.ask(ask("call-1"), controller.signal);
    await tick();
    controller.abort();
    expect(await answer).toEqual({ answer: "denied", by: "cancelled" });
    expect(shown()).toContain("cancelled");
    // A later answer goes to the next ask, never to the cancelled one.
    const next = presence.ask(ask("call-2"), never());
    await type("y\n");
    expect(await next).toEqual({ answer: "approved", by: "tty" });
  });

  it("shows nothing for an ask already aborted", async () => {
    const { presence, shown } = terminal();
    const answer = presence.ask(ask("call-1"), AbortSignal.abort());
    expect(await answer).toEqual({ answer: "denied", by: "cancelled" });
    expect(shown()).toBe("");
  });

  it("shows one prompt at a time; a later ask waits its turn", async () => {
    const { presence, shown, type } = terminal();
    const first = presence.ask(ask("call-1"), never());
    const second = presence.ask(ask("call-2"), never());
    await tick();
    expect(shown()).toBe("call-1? ");
    await type("y\n");
    expect(await first).toEqual({ answer: "approved", by: "tty" });
    await tick();
    expect(shown()).toBe("call-1? call-2? ");
    await type("n\n");
    expect(await second).toEqual({ answer: "denied", by: "tty" });
  });

  it("cancels a queued ask without showing it", async () => {
    const { presence, shown, type } = terminal();
    const controller = new AbortController();
    const first = presence.ask(ask("call-1"), never());
    const second = presence.ask(ask("call-2"), controller.signal);
    controller.abort();
    await type("n\n");
    expect(await first).toEqual({ answer: "denied", by: "tty" });
    expect(await second).toEqual({ answer: "denied", by: "cancelled" });
    expect(shown()).not.toContain("call-2");
  });

  // Type-ahead never answers: a stray "y" must not approve a later, different action.
  it("drops a line typed before the prompt was shown", async () => {
    const { input, presence, type } = terminal();
    input.write("y\n"); // buffered before the ask: delivered right after resume
    const answer = presence.ask(ask("call-1"), never());
    await type("n\n");
    expect(await answer).toEqual({ answer: "denied", by: "tty" });
  });

  it("drops a line left over from an earlier ask", async () => {
    const { presence, type } = terminal();
    const first = presence.ask(ask("call-1"), never());
    await type("n\ny\n"); // the second line is type-ahead for the next ask
    expect(await first).toEqual({ answer: "denied", by: "tty" });
    const second = presence.ask(ask("call-2"), never());
    await type("n\n");
    expect(await second).toEqual({ answer: "denied", by: "tty" });
  });

  it("drops a line typed within the grace window", async () => {
    const { input, presence } = terminal();
    const answer = presence.ask(ask("call-1"), never());
    await tick();
    input.write("y\n");
    await later();
    input.write("n\n");
    expect(await answer).toEqual({ answer: "denied", by: "tty" });
  });

  it("drops a line that starts in the window and ends after it", async () => {
    const { input, presence } = terminal();
    const answer = presence.ask(ask("call-1"), never());
    await tick();
    input.write("y");
    await later();
    input.write("\n");
    input.write("n\n");
    expect(await answer).toEqual({ answer: "denied", by: "tty" });
  });

  it("takes a line typed after the grace window", async () => {
    const { presence, type } = terminal(100);
    const answer = presence.ask(ask("call-1"), never());
    await sleep(140);
    await type("y\n");
    expect(await answer).toEqual({ answer: "approved", by: "tty" });
  });

  describe("at a TTY (S-1)", () => {
    const tty = () => {
      const { input, modes } = ttyInput();
      return { ...terminal(GRACE_MS, input), modes, input };
    };

    it.each([
      ["Enter", "y\r", { answer: "approved", by: "tty" }],
      ["newline", "n\n", { answer: "denied", by: "tty" }],
      ["Ctrl-D", "\u0004", CANCELLED],
    ])("waits in raw mode and restores it (%s)", async (_, keys, result) => {
      const { presence, modes, type } = tty();
      const answer = presence.ask(ask("call-1"), never());
      await tick();
      expect(modes).toEqual([true]);
      await type(keys);
      expect(await answer).toEqual(result);
      expect(modes).toEqual([true, false]);
    });

    it("restores the mode on end of input, error and abort", async () => {
      for (const end of ["eof", "error", "abort"] as const) {
        const { input, presence, modes } = tty();
        const controller = new AbortController();
        const answer = presence.ask(ask("call-1"), controller.signal);
        await tick();
        if (end === "eof") input.end();
        if (end === "error") input.destroy(new Error("EIO"));
        if (end === "abort") controller.abort();
        expect(await answer).toEqual(CANCELLED);
        expect(modes).toEqual([true, false]);
      }
    });

    it("cancels on Ctrl-C, then re-raises SIGINT", async () => {
      const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
      try {
        const { presence, modes, type } = tty();
        const answer = presence.ask(ask("call-1"), never());
        await type("y\u0003");
        expect(await answer).toEqual(CANCELLED);
        expect(modes).toEqual([true, false]);
        expect(kill).toHaveBeenCalledWith(process.pid, "SIGINT");
      } finally {
        kill.mockRestore();
      }
    });

    it("echoes printable keys escaped and handles Backspace", async () => {
      const { presence, shown, type } = tty();
      const answer = presence.ask(ask("call-1"), never());
      await type("x\u007f\u202e\by\r");
      expect(await answer).toEqual({ answer: "approved", by: "tty" });
      const erase = (n: number) => "\b \b".repeat(n);
      expect(shown()).toBe(
        "call-1? x" + erase(1) + "\\u{202e}" + erase(8) + "y\n",
      );
    });

    it("never echoes a control key; it spoils the line", async () => {
      const { presence, shown, type } = tty();
      const answer = presence.ask(ask("call-1"), never());
      await type("\u001b\u0007y\r");
      expect(await answer).toEqual({ answer: "denied", by: "tty" });
      expect(shown()).toBe("call-1? y\n");
    });

    it("restores the mode if the process exits while an ask waits", async () => {
      const { presence, modes, type } = tty();
      const before = process.listeners("exit");
      const answer = presence.ask(ask("call-1"), never());
      await tick();
      const added = process
        .listeners("exit")
        .filter((l) => !before.includes(l));
      expect(added).toHaveLength(1);
      added[0]?.call(process, 0);
      expect(modes).toEqual([true, false]);
      await type("n\r");
      await answer;
      expect(process.listeners("exit")).toEqual(before);
    });
  });

  it("rejects an invalid graceMs", () => {
    const io = () => [new PassThrough(), new PassThrough()] as const;
    for (const graceMs of [-1, 1.5, 10_001, Number.NaN]) {
      expect(() => createTtyPresence(...io(), { graceMs })).toThrow(RangeError);
    }
    expect(() => createTtyPresence(...io(), { graceMs: 10_000 })).not.toThrow();
    expect(() => createTtyPresence(...io())).not.toThrow();
  });

  it("isApproval accepts y with an optional CR only", () => {
    expect(["y", "y\r"].map(isApproval)).toEqual([true, true]);
    expect(["Y", "yes", " y", "y\r\r", ""].map(isApproval)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });
});
