import { describe, expect, expectTypeOf, it } from "vitest";
import {
  validatePermissionPolicy as validate,
  type PermissionPolicy,
} from "../src/index.ts";

const policy: PermissionPolicy = {
  version: "sample-1",
  governance: "tiered",
  rules: [
    { id: "execute.any", action: "execute", scope: "any", tier: "allow" },
  ],
  alwaysAsk: ["deploy", "push"],
  ring0Paths: [".github/**", "tsconfig*.json", "packages/*/evals/**"],
  ring0Settings: ["permissions.governance", "spend.cap"],
};
const rule = (change: Record<string, string>) => ({
  ...policy,
  rules: [{ ...policy.rules[0], ...change }],
});

describe("PermissionPolicy", () => {
  it("accepts a well-formed policy", () => {
    expect(validate(policy)).toBe(true);
  });

  it("accepts an empty rule list (no match asks)", () => {
    expect(validate({ ...policy, rules: [] })).toBe(true);
  });

  it.each(["policy", "autonomous", null])("rejects governance %j", (mode) => {
    expect(validate({ ...policy, governance: mode })).toBe(false);
  });

  it.each(Object.keys(policy))("rejects a policy without %s", (key) => {
    const partial = Object.entries(policy).filter(([name]) => name !== key);
    expect(validate(Object.fromEntries(partial))).toBe(false);
  });

  // The floor against a base policy is resolvePolicy's job; the schema only refuses empty lists.
  it.each(["alwaysAsk", "ring0Paths", "ring0Settings"])(
    "rejects an empty %s",
    (key) => {
      expect(validate({ ...policy, [key]: [] })).toBe(false);
    },
  );

  it.each([null, [], "policy", 1])("rejects the non-object %j", (value) => {
    expect(validate(value)).toBe(false);
  });

  it.each([
    { ...policy, mode: "yolo" },
    { ...policy, rules: {} },
    { ...policy, rules: ["x"] },
    { ...policy, alwaysAsk: "deploy" },
    rule({ when: "always" }),
    rule({ action: "rm" }),
    rule({ scope: "repo" }),
    rule({ tier: "allowAlways" }),
    { ...policy, alwaysAsk: ["shell"] },
  ])("rejects unknown fields, names and shapes: %j", (value) => {
    expect(validate(value)).toBe(false);
  });

  it.each(["", ".1", "-x", "a b", "x".repeat(65), 1])(
    "rejects the version %j",
    (version) => {
      expect(validate({ ...policy, version })).toBe(false);
    },
  );

  it.each(["execute.any", "fs.edit-ring0", "a.b.c.d", "x".repeat(32)])(
    "accepts the rule id %j",
    (id) => {
      expect(validate(rule({ id }))).toBe(true);
    },
  );

  it.each(
    [
      "",
      "X",
      "1a",
      "a.",
      "a..b",
      ".a",
      "a.B",
      "a.b.c.d.e",
      "x".repeat(33),
    ].concat(["always-ask.deploy"]),
  )("rejects the rule id %j", (id) => {
    expect(validate(rule({ id }))).toBe(false);
  });

  it("enforces the list size limits", () => {
    const rules = Array.from({ length: 257 }, () => policy.rules[0]);
    expect(validate({ ...policy, rules })).toBe(false);
    const alwaysAsk = Array.from({ length: 65 }, () => "deploy");
    expect(validate({ ...policy, alwaysAsk })).toBe(false);
  });

  it.each([
    "**",
    "package.json",
    ".github/**",
    "eslint.config.*",
    "x".repeat(128),
  ])("accepts the path glob %j", (glob) => {
    expect(validate({ ...policy, ring0Paths: [glob] })).toBe(true);
  });

  it.each(
    ["", "/etc", "../x", "a/../b", "./a", "a//b", "a/", "a/**/b", "a**"].concat(
      ["**b", "***", "a b", "a\\b", "x".repeat(129)],
    ),
  )("rejects the path glob %j", (glob) => {
    expect(validate({ ...policy, ring0Paths: [glob] })).toBe(false);
  });

  it.each(["permissions.governance", "spend.cap", "friction.choreDowngrade"])(
    "accepts the setting name %j",
    (setting) => {
      expect(validate({ ...policy, ring0Settings: [setting] })).toBe(true);
    },
  );

  it.each(["", "Governance", "a..b", "a.", ".a", "a.B", "a-b"])(
    "rejects the setting name %j",
    (setting) => {
      expect(validate({ ...policy, ring0Settings: [setting] })).toBe(false);
    },
  );

  it("narrows unknown input to PermissionPolicy", () => {
    const input: unknown = JSON.parse(JSON.stringify(policy));
    if (validate(input)) {
      expectTypeOf(input).toEqualTypeOf<PermissionPolicy>();
    } else {
      expect.unreachable();
    }
  });
});
