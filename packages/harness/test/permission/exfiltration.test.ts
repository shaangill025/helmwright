import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PermissionPolicy } from "@helmwright/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DEFAULT_PERMISSION_POLICY as BASE,
  evaluate,
  permissionEvents,
  runRing0,
  type RunRing0,
} from "../../src/index.ts";

let worktree: string;
let ring0: RunRing0;
beforeAll(() => {
  worktree = realpathSync(mkdtempSync(join(tmpdir(), "hw-exfil-")));
  ring0 = runRing0(worktree, BASE);
});
afterAll(() => {
  rmSync(worktree, { recursive: true, force: true });
});

const rule = (action: string, input: unknown) =>
  evaluate(BASE, {
    action,
    input,
    worktree,
    runId: "run_01",
    extraRing0Paths: ring0,
  });
const comment = (body: string) => rule("comment", { destination: "o/r", body });

// Built at run time, so no scanner sees a credential-shaped literal in the source.
const tail = (n: number, unit = "a1B2") => unit.repeat(n).slice(0, n);
const SECRETS: [string, string, string][] = [
  ["ghp_", "ghp_" + tail(36), "a GitHub token"],
  ["gho_", "gho_" + tail(36), "a GitHub token"],
  ["ghu_", "ghu_" + tail(36), "a GitHub token"],
  ["ghs_", "ghs_" + tail(36), "a GitHub token"],
  ["ghr_", "ghr_" + tail(36), "a GitHub token"],
  ["github_pat_", "github_pat_" + tail(82), "a GitHub token"],
  ["sk-ant-", "sk-ant-" + "api03-" + tail(40), "an Anthropic API key"],
  ["sk-", "sk-" + "proj-" + tail(40), "a secret API key"],
  ["xoxb-", "xoxb-" + tail(12, "12345-") + tail(16), "a Slack token"],
  ["xoxp-", "xoxp-" + tail(12, "12345-") + tail(16), "a Slack token"],
  ["AKIA", "AKIA" + tail(16, "Q7X2"), "an AWS access key ID"],
  ["ASIA", "ASIA" + tail(16, "Q7X2"), "an AWS access key ID"],
  ["npm_", "npm_" + tail(36), "an npm token"],
  ["glpat-", "glpat-" + tail(20), "a GitLab token"],
  [
    "PEM",
    ["-----BEGIN", "RSA", "PRIVATE", "KEY-----\n", tail(64)].join(" "),
    "a private key",
  ],
  ["NAME=value", "GITHUB_TOKEN=" + tail(20), "a credential-named value"],
  ["NAME: value", "password: " + tail(12), "a credential-named value"],
  [
    "quoted pair",
    '{"api-key": "' + tail(24) + '"}',
    "a credential-named value",
  ],
];

describe("exfiltration guard (guard 1)", () => {
  it.each(SECRETS)("denies a comment carrying %s", (_, secret, pattern) => {
    const v = comment("see (" + secret + ") for the result\n");
    expect(v).toMatchObject({
      kind: "evaluated",
      tier: "deny",
      guard: "exfiltration",
      ruleId: "exfiltration.credential",
      reason: "body carries " + pattern,
      target: {
        kind: "remote",
        value: "[withheld: credential-shaped content]",
        detail: "[withheld: credential-shaped content]",
      },
    });
    // The reason, target and logged event never hold the secret.
    const [event] = permissionEvents(v, { agentId: "a", toolCallId: "c" });
    const logged = JSON.stringify(event);
    for (const part of secret.split(/\s/u).filter((p) => p.length > 8)) {
      expect(logged).not.toContain(part);
      expect(JSON.stringify(v.target) + v.reason).not.toContain(part);
    }
  });

  it("scans every string field of every egress action", () => {
    const token = "ghp_" + tail(36);
    expect(rule("push", { destination: token, ref: "main" })).toMatchObject({
      guard: "exfiltration",
      reason: "destination carries a GitHub token",
      target: { value: "[withheld: credential-shaped content]" },
    });
    for (const action of ["pr.open", "pr.merge"]) {
      expect(rule(action, { destination: "origin", ref: token })).toMatchObject(
        { guard: "exfiltration", reason: "ref carries a GitHub token" },
      );
    }
    for (const action of ["publish", "deploy"]) {
      expect(rule(action, { destination: token })).toMatchObject({
        tier: "deny",
        guard: "exfiltration",
      });
    }
  });

  it.each([
    ["sk- inside prose words", "the task-runner and disk-usage report"],
    ["a short sk- tail", "use sk-learn for this"],
    ["a prefix inside a word", "xghp_" + tail(36)],
    ["a short GitHub tail", "ghp_" + tail(12)],
    ["an AWS-like ID too long", "AKIA" + tail(20, "Q7X2")],
    ["token without a value", "the token= is unset; token: (none)"],
    ["a short credential value", "PASSWORD=hunter2 and max_tokens: 4096"],
    ["a variable reference", "GITHUB_TOKEN=$GITHUB_TOKEN_FROM_CI"],
    ["a name that is no credential", "colour=" + tail(20)],
    ["BEGIN without a private key", "-----BEGIN PUBLIC KEY-----"],
  ])("lets %s through to the policy", (_, body) => {
    expect(comment(body)).toMatchObject({
      guard: "policy",
      tier: "alwaysAsk",
      ruleId: "always-ask.comment",
    });
  });

  it("does not scan actions that are not egress", () => {
    const token = "ghp_" + tail(36);
    expect(
      rule("config.set", { setting: "editor.theme", value: token }),
    ).toMatchObject({ guard: "policy" });
    expect(
      rule("execute", { argv: ["echo", "GITHUB_TOKEN=" + tail(20)] }),
    ).toMatchObject({ guard: "policy", tier: "allow" });
  });

  it("reserves the exfiltration. rule ID prefix", () => {
    const policy: PermissionPolicy = {
      ...BASE,
      rules: [
        {
          id: "exfiltration.credential",
          action: "deploy",
          scope: "any",
          tier: "allow",
        },
      ],
    };
    expect(
      evaluate(policy, {
        action: "deploy",
        input: { destination: "prod" },
        worktree,
        runId: "run_01",
        extraRing0Paths: ring0,
      }),
    ).toMatchObject({ kind: "rejected", guard: "policy" });
  });
});
