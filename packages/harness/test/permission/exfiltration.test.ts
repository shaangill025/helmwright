import { createHash } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PermissionPolicy } from "@helmwright/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EGRESS } from "../../src/permission/policy.ts";
import {
  DEFAULT_PERMISSION_POLICY as BASE,
  PERMISSION_ONLY_ACTIONS,
  canonicalJson,
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
  // S1: every separator, spaced and split pairs, URL queries.
  ["NAME = v", "GITHUB_TOKEN = " + tail(20), "a credential-named value"],
  ["NAME= v", "GITHUB_TOKEN= " + tail(20), "a credential-named value"],
  ["NAME=newline v", "GITHUB_TOKEN=\n" + tail(20), "a credential-named value"],
  ["NAME := v", "api_key := " + tail(20), "a credential-named value"],
  ["NAME:=v", "api_key:=" + tail(20), "a credential-named value"],
  [
    '{"token" : "v"}',
    '{"token" : "' + tail(20) + '"}',
    "a credential-named value",
  ],
  [
    "?access_token=v",
    "https://x.io/a?access_token=" + tail(20),
    "a credential-named value",
  ],
  [
    "&password=v",
    "https://x.io/a?q=1&password=" + tail(12) + "&b=2",
    "a credential-named value",
  ],
  [
    "a later separator",
    "mode=fast:secret=" + tail(12),
    "a credential-named value",
  ],
  // S2: a specific prefix matches inside a word.
  ["a prefix inside a word", "xghp_" + tail(36), "a GitHub token"],
  [
    "a key after an underscore",
    "MY_AKIA" + tail(16, "Q7X2"),
    "an AWS access key ID",
  ],
  // S3: a normalized copy is scanned.
  [
    "a zero-width space",
    "ghp_" + tail(10) + "\u200b" + tail(26),
    "a GitHub token",
  ],
  ["a soft hyphen", "gh\u00adp_" + tail(36), "a GitHub token"],
  ["fullwidth forms", "\uff47\uff48\uff50\uff3f" + tail(36), "a GitHub token"],
  // S4: a PGP private key.
  [
    "PGP",
    "-----BEGIN PGP PRIVATE KEY BLOCK-----\n" + tail(64),
    "a private key",
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
    // S3: the input snapshot, and its hash, stay the raw input.
    const raw = {
      destination: "o/r",
      body: "see (" + secret + ") for the result\n",
    };
    expect(v.input).toEqual(raw);
    const sha = createHash("sha256").update(canonicalJson(raw)).digest("hex");
    expect(event?.payload).toMatchObject({ inputSha256: sha });
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
    ["generic sk- inside a word", "task-" + tail(30)],
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

  it("scans a long body of end markers in linear time (S4)", () => {
    const body = "PRIVATE KEY-----".repeat(4096);
    expect(body.length).toBe(65_536);
    const started = performance.now();
    expect(comment(body)).toMatchObject({ guard: "policy" });
    expect(performance.now() - started).toBeLessThan(200);
  });

  it("has an egress entry for every action; exactly the remote six (N6)", () => {
    const actions = ["execute", ...PERMISSION_ONLY_ACTIONS].sort();
    expect(Object.keys(EGRESS).sort()).toEqual(actions);
    const egress = actions.filter((a) => EGRESS[a as keyof typeof EGRESS]);
    expect(egress).toEqual([
      "comment",
      "deploy",
      "pr.merge",
      "pr.open",
      "publish",
      "push",
    ]);
  });

  it.each([
    ["exfiltration", "rejected"],
    ["default", "rejected"],
    ["exfiltration-credential", "evaluated"],
  ])("reserves the bare word too: rule ID %s is %s (N1)", (id, kind) => {
    const policy: PermissionPolicy = {
      ...BASE,
      rules: [{ id, action: "deploy", scope: "any", tier: "allow" }],
    };
    const v = evaluate(policy, {
      action: "deploy",
      input: { destination: "prod" },
      worktree,
      runId: "run_01",
      extraRing0Paths: ring0,
    });
    expect(v.kind).toBe(kind);
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
