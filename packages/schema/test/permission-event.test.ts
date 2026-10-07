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

const toolCallId = "toolu_01AbC";
const evaluated: PermissionEvaluated = {
  kind: "permission.evaluated",
  agentId: "node_01",
  toolCallId,
  action: "deps.add",
  requested: "execute",
  inputSha256: "b".repeat(64),
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
  toolCallId,
  guard: "schema",
  ruleId: "schema.unknown-action",
  reason: 'unknown action "fs.write"',
  requestedName: "fs.write",
};
const asked: PermissionAsked = {
  kind: "permission.asked",
  toolCallId,
  presence: "tty",
  promptSha256: "a".repeat(64),
};
const approved: PermissionAnswered = {
  kind: "permission.answered",
  toolCallId,
  answer: "approved",
  by: "tty",
  waitMs: 0,
  attestation: { kind: "none" },
};
const denied: PermissionAnswered = { ...approved, answer: "denied", by: "tty" };
const events: PermissionEvent[] = [
  evaluated,
  rejected,
  asked,
  approved,
  denied,
];
const optional = new Set(["requestedName"]);

/** The enum of a $defs entry in a schema file. */
function definedEnum(file: string, def: string): string[] {
  const url = new URL(`../schemas/${file}`, import.meta.url);
  const schema = JSON.parse(readFileSync(url, "utf8")) as {
    $defs: Record<string, { enum?: string[] }>;
  };
  return schema.$defs[def]?.enum ?? [];
}
const actions = definedEnum("permission-event.schema.json", "action");
const without = (event: object, key: string) =>
  Object.fromEntries(Object.entries(event).filter(([k]) => k !== key));
const astral = (n: number) => "\u{1F600}".repeat(n);
const badHashes = [
  "A".repeat(64),
  "a".repeat(63),
  "a".repeat(65),
  "g".repeat(64),
  ` ${"a".repeat(63)}`,
];

describe("PermissionEvent", () => {
  it.each(events)("accepts a well-formed $kind", (event) => {
    expect(validate(event)).toBe(true);
  });

  it.each(
    events.flatMap((event) =>
      Object.keys(event)
        .filter((key) => !optional.has(key))
        .map((key) => [event.kind, key, event] as const),
    ),
  )("rejects %s without %s", (_kind, key, event) => {
    expect(validate(without(event, key))).toBe(false);
  });

  it.each(events)("rejects an extra field on $kind", (event) => {
    expect(validate({ ...event, extra: true })).toBe(false);
  });

  it.each(events)("rejects the old callId field on $kind", (event) => {
    expect(validate({ ...without(event, "toolCallId"), callId: "c" })).toBe(
      false,
    );
  });

  it.each([
    [evaluated, "permission.asked"],
    [asked, "permission.answered"],
    [approved, "permission.evaluated"],
    [asked, "permission.denied"],
    [approved, undefined],
    [rejected, "permission.evaluated"],
    [evaluated, "permission.rejected"],
  ])("rejects %j with kind %j", (event, kind) => {
    expect(validate({ ...event, kind })).toBe(false);
  });

  it.each([null, [], "permission.asked", 1, undefined])(
    "rejects the non-object %j",
    (value) => {
      expect(validate(value)).toBe(false);
    },
  );

  describe("identifiers", () => {
    it.each(["toolu_01AbC", "call/1+x=", "!", "~".repeat(256)])(
      "accepts the tool call ID %j in every payload",
      (id) => {
        for (const event of events) {
          expect(validate({ ...event, toolCallId: id })).toBe(true);
        }
      },
    );

    it.each(["", "call 1", "c".repeat(257), "a\tb", "café"])(
      "rejects the tool call ID %j in every payload",
      (id) => {
        for (const event of events) {
          expect(validate({ ...event, toolCallId: id })).toBe(false);
        }
      },
    );

    it.each(["node:role.1", "a".repeat(128)])("accepts agentId %j", (id) => {
      expect(validate({ ...evaluated, agentId: id })).toBe(true);
      expect(validate({ ...rejected, agentId: id })).toBe(true);
    });

    it.each(["", "-a", "node 1", "a".repeat(129)])(
      "rejects agentId %j",
      (id) => {
        expect(validate({ ...evaluated, agentId: id })).toBe(false);
        expect(validate({ ...rejected, agentId: id })).toBe(false);
      },
    );
  });

  describe("permission.evaluated", () => {
    it.each([
      { kind: "amount", value: "25 USD" },
      { kind: "path", value: "/w/a.ts", detail: "" },
      { kind: "argv", value: "[…", truncated: true },
      { kind: "remote", value: "origin", truncated: false },
    ])("accepts the target %j", (target) => {
      expect(validate({ ...evaluated, target })).toBe(true);
    });

    it.each([
      { kind: "url", value: "x" },
      { kind: "path", value: "/etc", path: "/etc" },
      { kind: "path", value: "/etc", truncated: "yes" },
      { kind: "path", value: "/etc", truncated: 1 },
    ])("rejects the target %j", (target) => {
      expect(validate({ ...evaluated, target })).toBe(false);
    });

    it.each(["exfiltration", "policy"])("accepts the %s guard", (guard) => {
      expect(validate({ ...evaluated, guard })).toBe(true);
    });

    it.each([
      { guard: "schema" },
      { guard: "rule" },
      { action: "fs.write" },
      { requested: "Execute" },
      { tier: "always-ask" },
    ])("rejects the change %j", (change) => {
      expect(validate({ ...evaluated, ...change })).toBe(false);
    });

    it.each(badHashes)("rejects the input hash %j", (inputSha256) => {
      expect(validate({ ...evaluated, inputSha256 })).toBe(false);
    });

    it.each([
      ...actions.map((action) => `always-ask.${action}`),
      "always-ask.delete-outside",
      "always-ask.ring0-path",
      "always-ask.ring0-setting",
      "always-ask.a.b.c",
      "default.ask",
      "deps.add.ask",
      "always-ask",
      `${"a".repeat(32)}.b`,
      "a.b.c.d",
    ])("accepts the rule ID %j", (ruleId) => {
      expect(validate({ ...evaluated, ruleId })).toBe(true);
    });

    it.each([
      "Rule",
      "always-ask.",
      "always-ask.Push",
      "always-ask.a.b.c.d",
      "deps.Add",
      "deps.add.",
      "1deps.add",
      "deps.1add",
      `${"a".repeat(33)}.b`,
      `a.${"b".repeat(33)}`,
      "a.b.c.d.e",
      "policy..x",
      "policy.invalid",
      "schema.invalid-input",
      "schema.unknown-action",
    ])("rejects the rule ID %j", (ruleId) => {
      expect(validate({ ...evaluated, ruleId })).toBe(false);
    });

    it.each(["", ".v1", "v".repeat(65)])(
      "rejects the policy version %j",
      (policyVersion) => {
        expect(validate({ ...evaluated, policyVersion })).toBe(false);
      },
    );

    it("bounds display text at 8192 code points", () => {
      expect(validate({ ...evaluated, reason: astral(8192) })).toBe(true);
      expect(validate({ ...evaluated, reason: astral(8193) })).toBe(false);
      const long = "v".repeat(8193);
      const { target } = evaluated;
      expect(
        validate({ ...evaluated, target: { ...target, value: long } }),
      ).toBe(false);
      expect(
        validate({ ...evaluated, target: { ...target, detail: long } }),
      ).toBe(false);
    });

    it("keeps its action and tier enums equal to the policy's", () => {
      for (const def of ["action", "tier"]) {
        expect(definedEnum("permission-event.schema.json", def)).toEqual(
          definedEnum("permission-policy.schema.json", def),
        );
      }
      expectTypeOf<
        PermissionEvaluated["action"]
      >().toEqualTypeOf<PermissionAction>();
      expectTypeOf<
        PermissionEvaluated["tier"]
      >().toEqualTypeOf<PermissionTier>();
    });
  });

  describe("permission.rejected", () => {
    it.each([
      { guard: "schema", ruleId: "schema.invalid-input" },
      { guard: "policy", ruleId: "policy.invalid" },
      { requestedName: "\\u{200b}".repeat(64) },
      { requestedName: "\\u{10ffff}".repeat(64) },
      { requestedName: astral(640) },
      { requestedName: "" },
    ])("accepts the change %j", (change) => {
      expect(validate({ ...rejected, ...change })).toBe(true);
    });

    it("accepts a rejection without requestedName", () => {
      expect(validate(without(rejected, "requestedName"))).toBe(true);
    });

    it.each([
      { guard: "exfiltration" },
      { guard: "rule" },
      { requestedName: "x".repeat(641) },
      { requestedName: astral(641) },
      { requestedName: 1 },
      { requested: "fs.write" },
      { tier: "deny" },
      { target: evaluated.target },
      { inputSha256: evaluated.inputSha256 },
    ])("rejects the change %j", (change) => {
      expect(validate({ ...rejected, ...change })).toBe(false);
    });

    it.each([
      "default.ask",
      "always-ask.push",
      "deps.add.ask",
      "schema",
      "schema.",
      "Schema.x",
      "policy.Invalid",
      "schemas.x",
      `schema.${"a".repeat(33)}`,
      "schema.a.b.c.d",
    ])("rejects the rule ID %j", (ruleId) => {
      expect(validate({ ...rejected, ruleId })).toBe(false);
    });
  });

  describe("permission.asked", () => {
    it.each([{ presence: "none" }])("accepts the change %j", (change) => {
      expect(validate({ ...asked, ...change })).toBe(true);
    });

    it.each([
      { presence: "gui" },
      ...badHashes.map((h) => ({ promptSha256: h })),
    ])("rejects the change %j", (change) => {
      expect(validate({ ...asked, ...change })).toBe(false);
    });
  });

  describe("permission.answered", () => {
    it.each(["tty", "noPresence", "cancelled"])(
      "accepts a denial by %s",
      (by) => {
        expect(validate({ ...denied, by })).toBe(true);
      },
    );

    it.each(["noPresence", "cancelled", "timeout", "owner"])(
      "rejects an approval by %s",
      (by) => {
        expect(validate({ ...approved, by })).toBe(false);
      },
    );

    it.each(["timeout", "owner"])("rejects a denial by %s", (by) => {
      expect(validate({ ...denied, by })).toBe(false);
    });

    it.each(["yes", null])("rejects the answer %j", (answer) => {
      expect(validate({ ...approved, answer })).toBe(false);
      expect(validate({ ...denied, answer })).toBe(false);
    });

    it.each([-1, 1.5, "0", 2 ** 53])("rejects waitMs %j", (waitMs) => {
      expect(validate({ ...approved, waitMs })).toBe(false);
      expect(validate({ ...denied, waitMs })).toBe(false);
    });

    it.each([
      { kind: "presence" },
      { kind: "presence", signature: "abc" },
      { kind: "none", signature: "x" },
      {},
      "none",
      null,
    ])("rejects the attestation %j", (attestation) => {
      expect(validate({ ...approved, attestation })).toBe(false);
      expect(validate({ ...denied, attestation })).toBe(false);
    });
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
