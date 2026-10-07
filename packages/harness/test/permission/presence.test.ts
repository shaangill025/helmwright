import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { createTtyPresence, isApproval } from "../../src/index.ts";

const GRACE_MS = 40;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tick = () => sleep(10);
/** Past the grace window after a prompt is shown. */
const later = () => sleep(GRACE_MS + 30);

/** A presence on in-memory streams: what the owner types, and what was shown. */
function terminal(graceMs = GRACE_MS) {
  const input = new PassThrough();
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

  it("denies at end of input, then every later ask", async () => {
    const { input, presence } = terminal();
    const answer = presence.ask(ask("call-1"), never());
    input.end();
    expect(await answer).toEqual({ answer: "denied", by: "tty" });
    expect(await presence.ask(ask("call-2"), never())).toEqual({
      answer: "denied",
      by: "tty",
    });
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
