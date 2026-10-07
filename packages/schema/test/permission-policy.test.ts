import { describe, expect, expectTypeOf, it } from "vitest";
import {
  validatePermissionPolicy as validate,
  type PermissionPolicy,
} from "../src/index.ts";

const policy: PermissionPolicy = {
  version: "default-1",
  governance: "tiered",
  rules: [
    { id: "execute.worktree", action: "execute", scope: "any", tier: "allow" },
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

  it.each(["policy", "autonomous", null])("rejects governance %j", (mode) => {
    expect(validate({ ...policy, governance: mode })).toBe(false);
  });

  it.each(Object.keys(policy))("rejects a policy without %s", (key) => {
    const partial = Object.entries(policy).filter(([name]) => name !== key);
    expect(validate(Object.fromEntries(partial))).toBe(false);
  });

  it.each([
    { ...policy, mode: "yolo" },
    rule({ when: "always" }),
    rule({ action: "rm" }),
    rule({ scope: "repo" }),
    rule({ tier: "allowAlways" }),
    rule({ id: "X" }),
    { ...policy, alwaysAsk: ["shell"] },
  ])("rejects unknown fields and names: %j", (value) => {
    expect(validate(value)).toBe(false);
  });

  it.each(["**", "package.json", ".github/**", "eslint.config.*"])(
    "accepts the path glob %j",
    (glob) => {
      expect(validate({ ...policy, ring0Paths: [glob] })).toBe(true);
    },
  );

  it.each(
    ["", "/etc", "../x", "a/../b", "./a", "a//b", "a/", "a/**/b", "a**"].concat(
      ["**b", "***", "a b", "a\\b", "x".repeat(129)],
    ),
  )("rejects the path glob %j", (glob) => {
    expect(validate({ ...policy, ring0Paths: [glob] })).toBe(false);
  });

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
