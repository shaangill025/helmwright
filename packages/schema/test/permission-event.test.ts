import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  validatePermissionEvent as validate,
  type PermissionAction,
  type PermissionAnswered,
  type PermissionAsked,
  type PermissionEvaluated,
  type PermissionEvent,
  type PermissionRejected,
  type PermissionTier,
} from "../src/index.ts";

const evaluated: PermissionEvaluated = {
  kind: "permission.evaluated",
  agentId: "node_01",
  callId: "toolu_01A09q90qw90",
  action: "deps.add",
  requested: "execute",
  target: { kind: "argv", value: '["pnpm","add","left-pad"]' },
  tier: "ask",
  guard: "policy",
  ruleId: "deps.add.ask",
  policyVersion: "default-1",
  reason: "rule deps.add.ask",
};
const rejected: PermissionRejected = {
  kind: "permission.rejected",
  agentId: "node_01",
  callId: "toolu_01A09q90qw90",
  guard: "schema",
  ruleId: "schema.unknown-action",
  reason: 'unknown action "fs.write"',
  requested: "fs.write",
};
const asked: PermissionAsked = {
  kind: "permission.asked",
  callId: "toolu_01A09q90qw90",
  presence: "tty",
  promptSha256: "a".repeat(64),
};
const answered: PermissionAnswered = {
  kind: "permission.answered",
  callId: "toolu_01A09q90qw90",
  answer: "approved",
  by: "tty",
  waitMs: 0,
  attestation: { kind: "none" },
};
const events: PermissionEvent[] = [evaluated, rejected, asked, answered];

/** The enum of a $defs entry in a schema file. */
function definedEnum(file: string, def: string): unknown {
  const url = new URL(`../schemas/${file}`, import.meta.url);
  const schema = JSON.parse(readFileSync(url, "utf8")) as {
    $defs: Record<string, { enum?: unknown }>;
  };
  return schema.$defs[def]?.enum;
}

describe("PermissionEvent", () => {
  it.each(events)("accepts a well-formed $kind", (event) => {
    expect(validate(event)).toBe(true);
  });

  it.each([
    { kind: "amount", value: "25 USD" },
    { kind: "path", value: "/w/a.ts", detail: "" },
  ])("accepts the target %j", (target) => {
    expect(validate({ ...evaluated, target })).toBe(true);
  });

  it.each(["schema", "exfiltration", "policy"])(
    "accepts an evaluation by the %s guard",
    (guard) => {
      expect(validate({ ...evaluated, guard })).toBe(true);
    },
  );

  it.each([
    "always-ask.spend.raiseCap",
    "always-ask.ring0-path",
    "default.ask",
    "policy.invalid",
    "schema.unknown-action",
  ])("accepts the guard rule ID %j", (ruleId) => {
    expect(validate({ ...evaluated, ruleId })).toBe(true);
  });

  it.each(["tty", "noPresence", "cancelled", "timeout"])(
    "accepts a denial by %s",
    (by) => {
      expect(validate({ ...answered, answer: "denied", by })).toBe(true);
    },
  );

  it.each([
    [evaluated, "permission.asked"],
    [asked, "permission.answered"],
    [answered, "permission.evaluated"],
    [asked, "permission.denied"],
    [answered, undefined],
    [rejected, "permission.evaluated"],
    [evaluated, "permission.rejected"],
  ])("rejects %j with kind %j", (event, kind) => {
    expect(validate({ ...event, kind })).toBe(false);
  });

  it.each(events)("rejects an extra field on $kind", (event) => {
    expect(validate({ ...event, extra: true })).toBe(false);
  });

  it("rejects extra fields in the target and attestation", () => {
    const target = { ...evaluated.target, path: "/etc" };
    expect(validate({ ...evaluated, target })).toBe(false);
    const attestation = { kind: "none", signature: "x" };
    expect(validate({ ...answered, attestation })).toBe(false);
  });

  it("accepts a rejection without requested, by either guard", () => {
    const bare = Object.fromEntries(
      Object.entries(rejected).filter(([k]) => k !== "requested"),
    );
    expect(validate(bare)).toBe(true);
    expect(
      validate({ ...bare, guard: "policy", ruleId: "policy.invalid" }),
    ).toBe(true);
  });

  it.each(["kind", "agentId", "callId", "guard", "ruleId", "reason"])(
    "rejects a rejection without %s",
    (key) => {
      const partial = Object.entries(rejected).filter(([k]) => k !== key);
      expect(validate(Object.fromEntries(partial))).toBe(false);
    },
  );

  it.each([
    { guard: "exfiltration" },
    { guard: "rule" },
    { ruleId: "Schema.x" },
    { requested: 1 },
    { tier: "deny" },
    { target: evaluated.target },
  ])("rejects a rejection changed to %j", (change) => {
    expect(validate({ ...rejected, ...change })).toBe(false);
  });

  it("bounds a rejection's requested name at 256 code points", () => {
    const at = (n: number) => "\u{1F600}".repeat(n);
    expect(validate({ ...rejected, requested: at(256) })).toBe(true);
    expect(validate({ ...rejected, requested: at(257) })).toBe(false);
  });

  it.each(Object.keys(evaluated))("rejects an evaluation without %s", (key) => {
    const partial = Object.entries(evaluated).filter(([k]) => k !== key);
    expect(validate(Object.fromEntries(partial))).toBe(false);
  });

  it.each([
    [evaluated, { action: "fs.write" }],
    [evaluated, { requested: "Execute" }],
    [evaluated, { tier: "always-ask" }],
    [evaluated, { guard: "rule" }],
    [evaluated, { target: { kind: "url", value: "x" } }],
    [asked, { presence: "gui" }],
    [answered, { answer: "yes" }],
    [answered, { by: "owner" }],
  ])("rejects %j changed to %j", (event, change) => {
    expect(validate({ ...event, ...change })).toBe(false);
  });

  it.each([
    "A".repeat(64),
    "a".repeat(63),
    "a".repeat(65),
    "g".repeat(64),
    ` ${"a".repeat(63)}`,
  ])("rejects the prompt hash %j", (promptSha256) => {
    expect(validate({ ...asked, promptSha256 })).toBe(false);
  });

  it.each([-1, 1.5, "0", 2 ** 53])("rejects waitMs %j", (waitMs) => {
    expect(validate({ ...answered, waitMs })).toBe(false);
  });

  it.each([
    { kind: "presence" },
    { kind: "presence", signature: "abc" },
    {},
    "none",
    null,
  ])("rejects the attestation %j", (attestation) => {
    expect(validate({ ...answered, attestation })).toBe(false);
  });

  it("bounds display text at 8192 code points", () => {
    const at = (n: number) => "\u{1F600}".repeat(n);
    expect(validate({ ...evaluated, reason: at(8192) })).toBe(true);
    expect(validate({ ...evaluated, reason: at(8193) })).toBe(false);
    const value = "v".repeat(8193);
    expect(validate({ ...evaluated, target: { kind: "ref", value } })).toBe(
      false,
    );
    const detail = "d".repeat(8193);
    const target = { ...evaluated.target, detail };
    expect(validate({ ...evaluated, target })).toBe(false);
  });

  it.each([
    { callId: "", agentId: "a" },
    { callId: "-call", agentId: "a" },
    { callId: "c".repeat(129), agentId: "a" },
    { callId: "c", agentId: "node 1" },
  ])("rejects the identifiers %j", (ids) => {
    expect(validate({ ...evaluated, ...ids })).toBe(false);
  });

  it.each([
    "Rule",
    "always-ask.",
    "always-ask.Push",
    "deps.Add",
    "a.b.c.d.e",
    "policy..x",
  ])("rejects the rule ID %j", (ruleId) => {
    expect(validate({ ...evaluated, ruleId })).toBe(false);
  });

  it.each(["", ".v1", "v".repeat(65)])(
    "rejects the policy version %j",
    (policyVersion) => {
      expect(validate({ ...evaluated, policyVersion })).toBe(false);
    },
  );

  it.each([null, [], "permission.asked", 1, undefined])(
    "rejects the non-object %j",
    (value) => {
      expect(validate(value)).toBe(false);
    },
  );

  it("keeps its action and tier enums equal to the policy's", () => {
    for (const def of ["action", "tier"]) {
      expect(definedEnum("permission-event.schema.json", def)).toEqual(
        definedEnum("permission-policy.schema.json", def),
      );
    }
    expectTypeOf<
      PermissionEvaluated["action"]
    >().toEqualTypeOf<PermissionAction>();
    expectTypeOf<PermissionEvaluated["tier"]>().toEqualTypeOf<PermissionTier>();
  });

  it("narrows unknown input to PermissionEvent", () => {
    const input: unknown = JSON.parse(JSON.stringify(asked));
    if (validate(input)) {
      expectTypeOf(input).toEqualTypeOf<PermissionEvent>();
    } else {
      expect.unreachable();
    }
  });
});
