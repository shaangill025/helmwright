import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DesyncError,
  MESSAGE_APPENDED,
  assertNoDesync,
  deriveMessages,
  openSessionLog,
  type Message,
  type SessionLog,
} from "../../src/index.ts";

let dir: string;
let log: SessionLog;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "hw-msg-"));
  log = openSessionLog(join(dir, "session.db"));
});
afterEach(() => {
  log.close();
  rmSync(dir, { recursive: true, force: true });
});

const MESSAGES: readonly Message[] = [
  { role: "system", text: "You are a harness." },
  { role: "user", text: "Read a.txt" },
  {
    role: "assistant",
    text: "Reading.",
    toolCalls: [
      { id: "c1", name: "read", input: { path: "a.txt", lines: [1, 2] } },
      { id: "c2", name: "noop", input: null },
    ],
  },
  { role: "tool", toolCallId: "c1", status: "ok", text: "hello" },
  { role: "tool", toolCallId: "c2", status: "denied", text: "no" },
  { role: "assistant", text: "Done.", toolCalls: [] },
];

let nextId = 0;
function append(runId: string, type: string, payload: Record<string, unknown>) {
  nextId += 1;
  return log.append({
    eventId: `m-${String(nextId)}`,
    graphId: "graph-1",
    runId,
    nodeId: "node-1",
    type,
    at: new Date().toISOString(),
    payload,
  });
}

describe("deriveMessages", () => {
  it("round-trips every message kind through the log, per run", () => {
    append("run-1", "run.started", {});
    for (const message of MESSAGES) {
      append("run-1", MESSAGE_APPENDED, { message });
      append("run-2", MESSAGE_APPENDED, {
        message: { role: "user", text: "other" },
      });
    }
    const derived = deriveMessages(log.events(), "run-1");
    expect(derived).toEqual(MESSAGES);
    expect(deriveMessages(log.events(), "run-2")).toHaveLength(MESSAGES.length);
    expect(deriveMessages(log.events(), "run-3")).toEqual([]);
  });

  it.each([
    ["no message", {}],
    ["extra payload key", { message: MESSAGES[1], note: 1 }],
    ["unknown role", { message: { role: "robot", text: "x" } }],
    ["missing text", { message: { role: "user" } }],
    ["extra message key", { message: { role: "user", text: "x", y: 1 } }],
    [
      "toolCalls not array",
      { message: { role: "assistant", text: "", toolCalls: {} } },
    ],
    [
      "bad tool call",
      { message: { role: "assistant", text: "", toolCalls: [{ id: "c" }] } },
    ],
    [
      "bad status",
      { message: { role: "tool", toolCallId: "c", status: "maybe", text: "" } },
    ],
  ])("throws on a malformed payload: %s", (_name, payload) => {
    append("run-1", MESSAGE_APPENDED, { message: MESSAGES[0] });
    const bad = append("run-1", MESSAGE_APPENDED, payload);
    expect(() => deriveMessages(log.events(), "run-1")).toThrow(
      `malformed ${MESSAGE_APPENDED} event at seq ${String(bad.seq)}`,
    );
  });
});

describe("assertNoDesync", () => {
  it("passes on an equal context and names the first differing index", () => {
    for (const message of MESSAGES)
      append("run-1", MESSAGE_APPENDED, { message });
    const derived = deriveMessages(log.events(), "run-1");
    expect(() => {
      assertNoDesync(MESSAGES, derived);
    }).not.toThrow();

    const edited = MESSAGES.map((m, i) =>
      i === 2 ? { ...m, text: "Reading!" } : m,
    );
    const cases: [readonly Message[], number][] = [
      [edited, 2],
      [MESSAGES.slice(0, 4), 4],
      [[...MESSAGES, { role: "user", text: "more" }], 6],
      [
        [MESSAGES[1] as Message, MESSAGES[0] as Message, ...MESSAGES.slice(2)],
        0,
      ],
    ];
    for (const [sent, index] of cases) {
      let caught: unknown;
      try {
        assertNoDesync(sent, derived);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(DesyncError);
      expect(caught).toMatchObject({ index });
      expect(String(caught)).toContain(`index ${String(index)}`);
    }
  });
});
