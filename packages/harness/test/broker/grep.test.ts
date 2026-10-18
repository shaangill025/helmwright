import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  Event,
  PermissionPolicy,
  PermissionRule,
} from "@helmwright/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BROKER_TOOLS,
  DEFAULT_PERMISSION_POLICY,
  MAX_TOOL_OUTPUT_BYTES,
  createBroker,
  runRing0,
  type ToolResult,
} from "../../src/index.ts";
import {
  OFFLOAD_SOURCE_CEILING_BYTES,
  offload,
  offloadFaults,
  pointerLine,
} from "../../src/broker/offload.ts";

// The broker with its real policy; the sandbox is not started (offload.grep is host-only).
let dir: string;
let workspace: string;
let entries: { type: string; payload: Record<string, unknown> }[];
beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "hw-grep-")));
  workspace = join(dir, "workspaces", "run-1");
  mkdirSync(workspace, { recursive: true, mode: 0o700 });
  entries = [];
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const offloadDir = () => join(dir, "offload");
const IMAGE = "sha256:" + "a".repeat(64);

function broker(policy = DEFAULT_PERMISSION_POLICY) {
  return createBroker({
    ...{ image: IMAGE, workspace, workspaceRoot: join(dir, "workspaces") },
    offloadDir: offloadDir(),
    halt: () => undefined,
    permission: {
      ...{ policy, worktree: workspace, runId: "run-1", agentId: "node-1" },
      ring0: runRing0(workspace, policy),
      emitAll: (all) => entries.push(...all),
    },
  });
}

let n = 0;
async function grep(input: unknown, b = broker()): Promise<ToolResult> {
  n += 1;
  return b.executeTool(
    { id: `call-${String(n)}`, name: "offload.grep", input },
    new AbortController().signal,
  );
}

const store = (text: string) => offload(text, { dir: offloadDir() }).sha256;

describe("offload.grep", () => {
  it("is offered to the engine", () => {
    expect(BROKER_TOOLS.map((t) => t.name)).toContain("offload.grep");
  });

  it("returns matching lines with their line numbers", async () => {
    const id = store("alpha\nbeta needle\ngamma\nneedle again\n");
    const r = await grep({ id, pattern: "needle" });
    expect(r.status).toBe("ok");
    expect(r.output).toContain("2: beta needle\n4: needle again");
    expect(r.output).not.toContain("alpha");
  });

  it("reports no match as ok with a fixed line", async () => {
    const id = store("alpha\n");
    const r = await grep({ id, pattern: "zzz" });
    expect(r.status).toBe("ok");
    expect(r.output).toContain("0 matches");
  });

  it.each(["a.*b", "(a+)+$", "[x", "\\d", "$HOME", "a|b"])(
    "treats %j as a literal string, not a regex",
    async (pattern) => {
      const id = store(`aaab\nplain\nline ${pattern} end\nHOME x\n`);
      const r = await grep({ id, pattern });
      expect(r.status).toBe("ok");
      expect(r.output).toContain(`3: line ${pattern} end`);
      expect(r.output).not.toContain("1: aaab");
      expect(r.output).not.toContain("2: plain");
    },
  );

  it("caps the matches at maxMatches and says more exist", async () => {
    const id = store("hit\n".repeat(100));
    const r = await grep({ id, pattern: "hit", maxMatches: 3 });
    expect(r.output).toContain("1: hit\n2: hit\n3: hit");
    expect(r.output).not.toContain("4: hit");
    expect(r.output).toContain("3 of 100 matches shown");
  });

  it("shows 50 matches by default", async () => {
    const id = store("hit\n".repeat(100));
    const r = await grep({ id, pattern: "hit" });
    expect(r.output).toContain("50: hit");
    expect(r.output).not.toContain("51: hit");
  });

  it("bounds its output by MAX_TOOL_OUTPUT_BYTES, even for huge lines", async () => {
    const id = store(("x".repeat(100_000) + " hit\n").repeat(100));
    const r = await grep({ id, pattern: "hit", maxMatches: 200 });
    expect(r.status).toBe("ok");
    expect(Buffer.byteLength(r.output)).toBeLessThanOrEqual(
      MAX_TOOL_OUTPUT_BYTES,
    );
    expect(r.output).toContain("matches shown");
    // S1: the match sits past byte 512 of its line, so the line is a window around it.
    expect(r.output).toContain("hit");
    expect(r.output.split("\n")[0]).toMatch(/^1: …x+ hit/);
    expect(entries.map((e) => e.type)).toEqual(["permission.evaluated"]);
  });

  it("shows a window around a match deep in a line, marking both cut ends", async () => {
    const line = "a".repeat(1000) + "NEEDLE" + "b".repeat(1000);
    const id = store(line + "\n");
    const r = await grep({ id, pattern: "NEEDLE" });
    const [shown = ""] = r.output.split("\n");
    expect(shown.startsWith("1: …")).toBe(true);
    expect(shown.endsWith("…")).toBe(true);
    expect(shown).toContain("NEEDLE");
    // 128 bytes of context before the match, at most 512 bytes plus two markers.
    expect(shown).toContain("a".repeat(128) + "NEEDLE");
    expect(shown).not.toContain("a".repeat(129) + "NEEDLE");
    expect(Buffer.byteLength(shown)).toBeLessThanOrEqual(512 + 3 * 2 + 3);
  });

  it("refuses a file over twice the source ceiling without reading it (C1)", async () => {
    const id = "c".repeat(64);
    mkdirSync(offloadDir(), { recursive: true });
    const file = join(offloadDir(), id + ".txt");
    writeFileSync(file, "");
    truncateSync(file, 2 * OFFLOAD_SOURCE_CEILING_BYTES + 17);
    const r = await grep({ id, pattern: "x" });
    expect(r).toEqual({
      status: "error",
      output: "offloaded file is too large to search",
    });
  });

  it("makes replay fault, not read, a file over twice the source ceiling (C1)", () => {
    const sha256 = "d".repeat(64);
    mkdirSync(offloadDir(), { recursive: true });
    const file = join(offloadDir(), sha256 + ".txt");
    writeFileSync(file, "");
    truncateSync(file, 2 * OFFLOAD_SOURCE_CEILING_BYTES + 17);
    const payload = {
      ...{ kind: "tool.output.offloaded", toolCallId: "call-1", sha256 },
      ...{ bytes: 1, truncatedAtSource: false },
    };
    const event: Event = {
      ...{ schemaVersion: 1, eventId: "e1", seq: 7, graphId: "g", runId: "r" },
      ...{ nodeId: "n", at: "2026-10-17T00:00:00.000Z", payload },
      type: "tool.output.offloaded",
    };
    expect(offloadFaults([event], offloadDir())).toEqual([
      "seq 7: tool.output.offloaded file is too large to check",
    ]);
  });

  it("stays fast on a long pattern that nearly matches every line (C5)", async () => {
    const id = store(("a".repeat(5000) + "\n").repeat(1000));
    const started = performance.now();
    const r = await grep({ id, pattern: "a".repeat(4095) + "b" });
    expect(performance.now() - started).toBeLessThan(20_000);
    expect(r.status).toBe("ok");
    expect(r.output).toContain("0 of 0 matches shown");
  });

  it.each([
    ["a short id", { id: "abc", pattern: "x" }],
    ["an uppercase id", { id: "A".repeat(64), pattern: "x" }],
    ["a path", { id: "../../etc/passwd", pattern: "x" }],
    ["a path with the suffix", { id: "a".repeat(64) + ".txt", pattern: "x" }],
    ["a slash", { id: "a".repeat(63) + "/", pattern: "x" }],
    ["a path key", { id: "a".repeat(64), path: "/etc/passwd", pattern: "x" }],
    ["an empty pattern", { id: "a".repeat(64), pattern: "" }],
    ["a missing pattern", { id: "a".repeat(64) }],
    ["maxMatches 0", { id: "a".repeat(64), pattern: "x", maxMatches: 0 }],
    ["maxMatches 201", { id: "a".repeat(64), pattern: "x", maxMatches: 201 }],
    ["a float", { id: "a".repeat(64), pattern: "x", maxMatches: 1.5 }],
    ["a string count", { id: "a".repeat(64), pattern: "x", maxMatches: "5" }],
    ["a non-object", "a".repeat(64)],
  ])("refuses %s before any effect", async (_name, input) => {
    const r = await grep(input);
    expect(r.status).toBe("denied");
    expect(r.output).toContain("invalid input for offload.grep");
  });

  it("answers an unknown id with a typed error", async () => {
    const r = await grep({ id: "a".repeat(64), pattern: "x" });
    expect(r).toEqual({
      status: "error",
      output: "no offloaded output with that id",
    });
  });

  it("refuses a file that no longer matches its id", async () => {
    const id = store("good needle\n");
    writeFileSync(join(offloadDir(), id + ".txt"), "forged needle\n");
    const r = await grep({ id, pattern: "needle" });
    expect(r.status).toBe("error");
    expect(r.output).toBe("offloaded file does not match its id");
  });

  it("is ruled by the permission policy: allow by default, deny when ruled", async () => {
    const id = store("needle\n");
    await grep({ id, pattern: "needle" });
    expect(entries.map((e) => e.type)).toEqual(["permission.evaluated"]);
    expect(entries[0]).toMatchObject({
      type: "permission.evaluated",
      payload: { action: "offload.grep", tier: "allow" },
    });
    const deny: PermissionRule = {
      ...{ id: "offload.grep.deny", action: "offload.grep" },
      ...{ scope: "any", tier: "deny" },
    };
    const strict: PermissionPolicy = {
      ...DEFAULT_PERMISSION_POLICY,
      version: "strict-1",
      rules: [deny, ...DEFAULT_PERMISSION_POLICY.rules],
    };
    entries = [];
    const denied = await grep({ id, pattern: "needle" }, broker(strict));
    expect(denied.status).toBe("denied");
    expect(denied.output).toContain("denied");
    expect(entries.map((e) => e.type)).toEqual(["permission.evaluated"]);
  });
});

describe("pointerLine (versioned by the logged event)", () => {
  const sha256 = "b".repeat(64);
  it("keeps the old text for an event without pointerVersion", () => {
    expect(pointerLine({ sha256, bytes: 9, truncatedAtSource: false })).toBe(
      `[output offloaded: 9 bytes, sha256 ${sha256}]`,
    );
  });
  it("adds the retrieval hint for pointerVersion 2", () => {
    const fact = { sha256, bytes: 9, truncatedAtSource: false };
    expect(pointerLine({ ...fact, pointerVersion: 2 })).toBe(
      `[output offloaded: 9 bytes, sha256 ${sha256}; search it with offload.grep id ${sha256}]`,
    );
    expect(
      pointerLine({ ...fact, pointerVersion: 2, truncatedAtSource: true }),
    ).toMatch(
      /truncated at source.*, sha256 b+; search it with offload\.grep id b+\]$/,
    );
  });
});
