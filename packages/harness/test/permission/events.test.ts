import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validatePermissionEvent,
  type PermissionPolicy,
} from "@helmwright/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DEFAULT_PERMISSION_POLICY as BASE,
  PermissionLogError,
  evaluate,
  permissionAnswered,
  permissionAsked,
  permissionEvents,
  runRing0,
  type PermissionAnswer,
  type PermissionLogContext,
  type PermissionRequest,
  type PermissionVerdict,
  type RunRing0,
} from "../../src/index.ts";

let worktree: string;
let none: RunRing0;
beforeAll(() => {
  worktree = join(mkdtempSync(join(tmpdir(), "helmwright-events-")), "wt");
  mkdirSync(join(worktree, "src"), { recursive: true });
  none = runRing0(worktree, BASE);
});
afterAll(() => {
  rmSync(join(worktree, ".."), { recursive: true, force: true });
});

const ctx = { agentId: "node_01", toolCallId: "toolu_01AbC" };
const sha256 = (text: string) =>
  createHash("sha256").update(text).digest("hex");
const x = (...argv: string[]) => ({ argv });
const p = (path: unknown) => ({ path });
const request = (action: string, input: unknown, dir = worktree) => {
  return { action, input, worktree: dir, runId: "run_01" };
};
const rule = (action: string, input: unknown, policy: unknown = BASE) =>
  evaluate(policy as PermissionPolicy, {
    ...request(action, input),
    extraRing0Paths: none,
  });
/** The payload of the one evaluated event for `verdict`. */
const evaluated = (verdict: PermissionVerdict) => {
  const [entry, ...rest] = permissionEvents(verdict, ctx);
  if (entry?.type !== "permission.evaluated" || rest.length > 0) {
    throw new Error("expected one permission.evaluated event");
  }
  return entry.payload;
};
const branch = "helmwright/run/run_01";
const never = { id: "x.never", action: "execute", scope: "any", tier: "deny" };

/** At least one verdict of every tier, target kind, verdict kind and rejection guard. */
const verdicts: Record<string, () => PermissionVerdict> = {
  allow: () => rule("execute", x("ls")),
  "a reclassified install": () => rule("execute", x("pnpm", "add", "x")),
  "no matching rule": () => rule("fs.read", p("a"), { ...BASE, rules: [] }),
  "the always-ask floor": () => rule("deploy", { destination: "prod" }),
  "a deny rule": () => rule("execute", x("ls"), { ...BASE, rules: [never] }),
  "a path": () => rule("fs.edit", p("src/a.ts")),
  "a ref": () => rule("commit", { ref: branch, paths: ["src/a.ts"] }),
  "a remote": () => rule("push", { destination: "origin", ref: branch }),
  "a setting": () => rule("config.set", { setting: "ui.theme", value: 1 }),
  "an amount": () => rule("spend.raiseCap", { capUsd: 50 }),
  "an unknown action": () => rule("dep‮loy", {}),
  "invalid input": () => rule("fs.edit", p(1)),
  "a path error": () =>
    evaluate(BASE, {
      ...request("fs.read", p("a"), join(worktree, "missing")),
      extraRing0Paths: none,
    }),
  "an invalid policy": () => rule("fs.read", p("a"), { governance: "x" }),
  "a non-JSON policy": () => rule("fs.read", p("a"), { version: 1n }),
  "no run Ring 0 links": () =>
    evaluate(BASE, request("fs.read", p("a")) as unknown as PermissionRequest),
};

describe("permissionEvents", () => {
  it.each(Object.entries(verdicts))("maps %s to one valid event", (_, make) => {
    const verdict = make();
    const [entry, ...rest] = permissionEvents(verdict, ctx);
    expect(rest).toEqual([]);
    expect(entry?.type).toBe(`permission.${verdict.kind}`);
    expect(entry?.payload.kind).toBe(entry?.type);
    const { guard, tier } = verdict;
    expect(entry?.payload).toMatchObject({ ...ctx, guard });
    if (verdict.kind === "evaluated") {
      expect(entry?.payload).toMatchObject({ tier });
    }
    expect(validatePermissionEvent(entry?.payload)).toBe(true);
  });

  it("is given every tier, target kind and guard", () => {
    const all = Object.values(verdicts).map((make) => make());
    const seen = (f: (v: PermissionVerdict) => string) =>
      [...new Set(all.map(f))].sort();
    expect(seen((v) => v.tier)).toEqual(["allow", "alwaysAsk", "ask", "deny"]);
    expect(seen((v) => v.target?.kind ?? "")).toEqual(
      ["", "amount", "argv", "path", "ref", "remote", "setting"].sort(),
    );
    expect(seen((v) => `${v.kind} ${v.guard}`)).toEqual([
      "evaluated policy",
      "rejected policy",
      "rejected schema",
    ]);
  });

  it("builds the evaluated event from the verdict alone (S1, S5)", () => {
    expect(evaluated(rule("execute", x("pnpm", "add", "x")))).toEqual({
      kind: "permission.evaluated",
      ...ctx,
      action: "deps.add",
      requested: "execute",
      inputSha256: sha256('{"argv":["pnpm","add","x"]}'),
      target: { kind: "argv", value: '["pnpm","add","x"]' },
      tier: "ask",
      guard: "policy",
      ruleId: "deps.add",
      policyVersion: "default-2",
      reason: "rule deps.add",
    });
  });

  it("builds the rejected event with the shown name", () => {
    expect(permissionEvents(rule("dep‮loy", {}), ctx)).toEqual([
      {
        type: "permission.rejected",
        payload: {
          kind: "permission.rejected",
          ...ctx,
          guard: "schema",
          ruleId: "schema.unknown-action",
          reason: "unknown action",
          requestedName: "dep\\u{202e}loy",
        },
      },
    ]);
  });

  it("hashes the canonical input, so key order does not matter (S5)", () => {
    const hash = (input: unknown) =>
      evaluated(rule("config.set", input)).inputSha256;
    const a = hash({ setting: "ui.theme", value: { b: [1, { d: 2, c: 3 }] } });
    const b = hash({ value: { b: [1, { c: 3, d: 2 }] }, setting: "ui.theme" });
    expect(a).toBe(
      sha256('{"setting":"ui.theme","value":{"b":[1,{"c":3,"d":2}]}}'),
    );
    expect(b).toBe(a);
    expect(hash({ setting: "ui.theme", value: { b: 0 } })).not.toBe(a);
    // SF-4: integer-like keys sort as strings too.
    expect(hash({ setting: "ui.theme", value: { "10": 1, "9": 2 } })).toBe(
      sha256('{"setting":"ui.theme","value":{"10":1,"9":2}}'),
    );
  });

  it("logs a target cut before escaping, with the marker (N4, N5)", () => {
    const smile = (n: number) => x("echo", "\u{1f600}".repeat(n));
    expect(evaluated(rule("execute", smile(9000))).target).toEqual({
      kind: "argv",
      value: '["echo","' + "\u{1f600}".repeat(503) + "…[truncated]",
      truncated: true,
    });
    // 500 + 11 code points fit.
    const short = evaluated(rule("execute", smile(500))).target;
    expect(Array.from(short.value)).toHaveLength(511);
    expect(short.truncated).toBeUndefined();
    const packages = ["a".repeat(600)];
    expect(evaluated(rule("deps.add", { packages })).target).toMatchObject({
      value: '["' + "a".repeat(510) + "…[truncated]",
      truncated: true,
    });
    // Escaped, it would not fit, so the raw text is cut to 818 code points.
    const destination = "a" + "\ufe0f".repeat(2000);
    expect(evaluated(rule("deploy", { destination })).target).toEqual({
      kind: "remote",
      value: "a" + "\\u{fe0f}".repeat(817) + "…[truncated]",
      truncated: true,
    });
    const body = { destination: "github.com", body: "y".repeat(900) };
    const { target } = evaluated(rule("comment", body));
    expect(target.detail).toMatch(/…\[truncated\]$/);
    expect(target.truncated).toBe(true);
  });

  it.each(["", "a b", "x".repeat(257), "café", "a\n", 1])(
    "throws PermissionLogError for the tool call ID %j (S4)",
    (id) => {
      const toolCallId = id as string;
      for (const v of [rule("execute", x("ls")), rule("shell", {})]) {
        expect(() => permissionEvents(v, { ...ctx, toolCallId })).toThrow(
          PermissionLogError,
        );
      }
      expect(() => permissionAsked(toolCallId, "tty", "?")).toThrow(
        PermissionLogError,
      );
      const denied = { answer: "denied", by: "tty" } as const;
      expect(() => permissionAnswered(toolCallId, denied, 0)).toThrow(
        PermissionLogError,
      );
    },
  );

  it("accepts a 256-character tool call ID; throws on an invalid payload", () => {
    const verdict = rule("execute", x("ls"));
    const toolCallId = "!~".repeat(128);
    expect(permissionEvents(verdict, { ...ctx, toolCallId })).toHaveLength(1);
    expect(() => permissionEvents(verdict, { ...ctx, agentId: "a b" })).toThrow(
      PermissionLogError,
    );
    const forged = { ...verdict, kind: "x" } as unknown as PermissionVerdict;
    expect(() => permissionEvents(forged, ctx)).toThrow(PermissionLogError);
  });
});

describe("permissionAsked and permissionAnswered", () => {
  it("hashes the exact prompt shown", () => {
    const prompt = "Allow deploy to production? [y/N] ";
    expect(permissionAsked("toolu_1", "tty", prompt)).toEqual({
      type: "permission.asked",
      payload: {
        kind: "permission.asked",
        toolCallId: "toolu_1",
        presence: "tty",
        promptSha256: sha256(prompt),
      },
    });
  });

  it.each<PermissionAnswer>([
    { answer: "approved", by: "tty" },
    { answer: "denied", by: "tty" },
    { answer: "denied", by: "noPresence" },
    { answer: "denied", by: "cancelled" },
  ])("records %j with no attestation", (answer) => {
    const entry = permissionAnswered("toolu_1", answer, 1500);
    expect(entry).toEqual({
      type: "permission.answered",
      payload: {
        kind: "permission.answered",
        toolCallId: "toolu_1",
        ...answer,
        waitMs: 1500,
        attestation: { kind: "none" },
      },
    });
    expect(validatePermissionEvent(entry.payload)).toBe(true);
  });

  it.each([
    [{ answer: "denied", by: "tty" }, -1],
    [{ answer: "denied", by: "tty" }, 1.5],
    [{ answer: "denied", by: "tty" }, Number.NaN],
    [{ answer: "approved", by: "noPresence" }, 0],
  ])("throws on %j after %s ms", (answer, waitMs) => {
    const given = answer as PermissionAnswer;
    expect(() => permissionAnswered("toolu_1", given, waitMs)).toThrow(
      PermissionLogError,
    );
  });
});

describe("security review of B9b-2a", () => {
  const allowed = () => rule("execute", x("ls"));
  const fails = (run: () => unknown) => {
    expect(run).toThrow(PermissionLogError);
  };
  const getter = (): string => {
    throw new Error("getter");
  };

  it("throws PermissionLogError for anything it cannot log (SF-3, N3)", () => {
    const thrower = Object.defineProperty({}, "kind", { get: getter });
    const noInput = { ...allowed(), input: undefined };
    const allowing = { ...rule("shell", {}), tier: "allow" };
    for (const v of [null, { kind: "evaluated" }, noInput, thrower, allowing]) {
      fails(() => permissionEvents(v as PermissionVerdict, ctx));
    }
    const noCtx = null as unknown as PermissionLogContext;
    fails(() => permissionEvents(allowed(), noCtx));
    fails(() => permissionAsked("toolu_1", "tty", 1 as unknown as string));
    const answer = Object.defineProperty({ by: "tty" }, "answer", {
      get: getter,
    });
    fails(() => permissionAnswered("t", answer as PermissionAnswer, 0));
  });

  it("logs only the answer and who gave it, frozen (SF-2, N2)", () => {
    const evil = { answer: "denied", by: "tty", toolCallId: "evil" } as const;
    for (const answer of [evil, { ...evil, kind: "permission.asked" }]) {
      const { payload } = permissionAnswered("toolu_1", answer, 5);
      const toolCallId = "toolu_1";
      expect(payload).toMatchObject({
        kind: "permission.answered",
        toolCallId,
      });
    }
    const events = permissionEvents(allowed(), ctx);
    const rejected = permissionEvents(rule("shell", {}), ctx);
    expect(Object.isFrozen(events)).toBe(true);
    for (const e of [
      ...events,
      ...rejected,
      permissionAsked("t", "tty", "?"),
    ]) {
      expect(Object.isFrozen(e) && Object.isFrozen(e.payload)).toBe(true);
    }
    expect(Object.isFrozen(evaluated(allowed()).target)).toBe(true);
  });
});
