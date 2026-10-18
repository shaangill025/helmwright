import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Event } from "@helmwright/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  OFFLOAD_SOURCE_CEILING_BYTES,
  offload,
  offloadFaults,
  pointerLine,
  withPreview,
} from "../../src/broker/offload.ts";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "hw-offload-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const sha = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");

describe("offload", () => {
  it("writes <dir>/<sha256>.txt with mode 0600 and returns sha and bytes", () => {
    const text = "héllo\n".repeat(10);
    const got = offload(text, { dir });
    expect(got).toEqual({ sha256: sha(text), bytes: Buffer.byteLength(text) });
    const file = join(dir, got.sha256 + ".txt");
    expect(readFileSync(file, "utf8")).toBe(text);
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it("stores the same content once, under the same sha", () => {
    const a = offload("same", { dir });
    const b = offload("same", { dir });
    expect(b).toEqual(a);
    expect(readdirSync(dir)).toEqual([a.sha256 + ".txt"]);
  });

  it("refuses an existing file whose content differs", () => {
    const { sha256 } = offload("good", { dir });
    writeFileSync(join(dir, sha256 + ".txt"), "forged");
    expect(() => offload("good", { dir })).toThrow(/differs/);
  });
});

describe("pointerLine", () => {
  const sha256 = "a".repeat(64);
  it("is a pure function of the logged facts", () => {
    const fact = { sha256, bytes: 20000, truncatedAtSource: false };
    expect(pointerLine(fact)).toBe(
      `[output offloaded: 20000 bytes, sha256 ${sha256}]`,
    );
  });
  it("says so when the output was cut at source", () => {
    const line = pointerLine({ sha256, bytes: 5, truncatedAtSource: true });
    expect(line).toContain("truncated at source");
    expect(line).toContain(String(OFFLOAD_SOURCE_CEILING_BYTES));
  });
});

describe("withPreview", () => {
  it("shows the head, the tail and the pointer, cut on character edges", () => {
    const text = "é".repeat(20000);
    const out = withPreview(text, 1000, "[POINTER]");
    expect(out.endsWith("[POINTER]")).toBe(true);
    expect(out).not.toContain("�");
    expect(Buffer.byteLength(out)).toBeLessThan(1100);
    expect(out.startsWith("é")).toBe(true);
    expect(out.split("\n").length).toBe(3);
  });
});

describe("offload hardening", () => {
  it("writes no partial or temporary file when the dir is unwritable (A2)", () => {
    const text = "x".repeat(100);
    chmodSync(dir, 0o500);
    try {
      expect(() => offload(text, { dir })).toThrow();
    } finally {
      chmodSync(dir, 0o700);
    }
    expect(readdirSync(dir)).toEqual([]);
    expect(offload(text, { dir }).sha256).toBe(sha(text));
    expect(readdirSync(dir)).toEqual([sha(text) + ".txt"]);
  });

  it("leaves a planted short prefix untouched and refuses it (A2)", () => {
    const text = "complete output\n";
    const planted = join(dir, sha(text) + ".txt");
    writeFileSync(planted, "complete", { mode: 0o600 });
    expect(() => offload(text, { dir })).toThrow(/differs/);
    expect(readFileSync(planted, "utf8")).toBe("complete");
    expect(readdirSync(dir)).toEqual([sha(text) + ".txt"]);
  });

  it("re-applies 0700 on an existing dir and 0600 on an existing file (C2)", () => {
    const sub = join(dir, "off");
    mkdirSync(sub, { mode: 0o755 });
    chmodSync(sub, 0o755);
    const file = join(sub, sha("t") + ".txt");
    writeFileSync(file, "t");
    chmodSync(file, 0o644);
    offload("t", { dir: sub });
    expect(statSync(sub).mode & 0o777).toBe(0o700);
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });
});

describe("withPreview cuts (A3)", () => {
  it("cuts a 4-byte character on its edges, with exact head and tail sizes", () => {
    const text = "😀".repeat(1000);
    const out = withPreview(text, 1000, "[P]");
    const [head = "", tail = "", pointer] = out.split("\n");
    expect(pointer).toBe("[P]");
    // 2/3 of 1000 is 666: 166 whole characters (664 bytes), not a split one.
    expect(Buffer.byteLength(head)).toBe(664);
    // The tail starts 334 bytes from the end: 83 whole characters (332 bytes).
    expect(Buffer.byteLength(tail)).toBe(332);
    expect(out).not.toContain("�");
  });
});

describe("offloadFaults re-validates the payload (hardening 1)", () => {
  const text = "faulty\n";
  const event = (type: string, payload: Record<string, unknown>): Event => ({
    ...{ schemaVersion: 1, eventId: "e1", seq: 7, graphId: "g", runId: "r" },
    ...{ nodeId: "n", at: "2026-10-17T00:00:00.000Z", type, payload },
  });
  const good = () => ({
    kind: "tool.output.offloaded",
    toolCallId: "call-1",
    sha256: sha(text),
    bytes: Buffer.byteLength(text),
    truncatedAtSource: false,
  });

  it("accepts a valid event with its file", () => {
    offload(text, { dir });
    expect(
      offloadFaults([event("tool.output.offloaded", good())], dir),
    ).toEqual([]);
  });

  it("faults a wrong kind, a missing toolCallId and an extra key", () => {
    offload(text, { dir });
    const noId: Record<string, unknown> = { ...good() };
    delete noId["toolCallId"];
    for (const [type, payload] of [
      ["tool.output.offloaded", { ...good(), kind: "floor.checked" }],
      ["tool.output.offloaded", noId],
      ["tool.output.offloaded", { ...good(), extra: 1 }],
    ] as const) {
      expect(offloadFaults([event(type, { ...payload })], dir)).toHaveLength(1);
    }
  });
});
