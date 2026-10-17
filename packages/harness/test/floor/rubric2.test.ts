import type { DecisionOpened, FloorSignal } from "@helmwright/schema";
import { describe, expect, it } from "vitest";
import { FloorError } from "../../src/floor/events.ts";
import {
  MATERIALITY_RUBRIC,
  floorDecision,
} from "../../src/floor/materiality.ts";
import { RESOLVES_ANY, claimsReason } from "../../src/objects/claims.ts";

// PB-0 (Q70-1): materiality-rubric-2 floor Briefs carry a fixed claims table.
const add: FloorSignal = {
  id: "evt-1:0",
  type: "dependency.added",
  path: "app/package.json",
  field: "dependencies",
  name: "left-pad",
  runtime: true,
  from: null,
  to: "^1.3.0",
};
const bump: FloorSignal = {
  id: "evt-1:1",
  type: "dependency.majorBump",
  path: "app/package.json",
  field: "dependencies",
  name: "chalk",
  runtime: true,
  from: "^4.1.2",
  to: "^5.3.0",
  bump: "major",
};
const make = (signal: FloorSignal, rubricVersion?: string): DecisionOpened =>
  floorDecision({
    ...{ runId: "run-0b4f9a7e-6f1c-4a1e-9a43-2f0d7c1b5e21", index: 0 },
    ...{ taskId: "task-1", repoId: "/r/.git", signal, lockfiles: [] },
    ...{ threshold: "runtimeAddOrMajor", seed: "0".repeat(32) },
    key: new Uint8Array(32).fill(7),
    ...(rubricVersion === undefined ? {} : { rubricVersion }),
  });
const claimsOf = (d: DecisionOpened) =>
  d.authority === "owner" ? d.brief.claims : undefined;

describe("materiality-rubric-2 Brief claims", () => {
  it("is the current rubric", () => {
    expect(MATERIALITY_RUBRIC).toBe("materiality-rubric-2");
  });

  it("gives an add Brief a Direct, an Unknown and an Inferred claim", () => {
    const claims = claimsOf(make(add));
    expect(claims).toEqual([
      {
        text: "Manifest app/package.json adds left-pad ^1.3.0",
        tier: "Direct",
        evidence: ["evt-1:0"],
      },
      {
        text: "The harness did not check the package's licence, upkeep, size or known vulnerabilities.",
        tier: "Unknown",
        evidence: [],
      },
      {
        text: "Removing the package later means rewriting the code that calls it and its tests.",
        tier: "Inferred",
        evidence: ["claim:0"],
      },
    ]);
    expect(claimsReason(claims ?? [], RESOLVES_ANY)).toBeUndefined();
  });

  it("gives a bump Brief its own claims", () => {
    const claims = claimsOf(make(bump)) ?? [];
    expect(claims.map((c) => c.tier)).toEqual([
      "Direct",
      "Unknown",
      "Inferred",
    ]);
    expect(claims[0]?.text).toBe(
      "Manifest app/package.json changes chalk from ^4.1.2 to ^5.3.0",
    );
    expect(claimsReason(claims, RESOLVES_ANY)).toBeUndefined();
  });

  it("keeps rubric-1 Briefs free of claims, so an old log replays unchanged", () => {
    expect(claimsOf(make(add, "materiality-rubric-1"))).toBeUndefined();
    expect(claimsOf(make(add, "materiality-rubric-2"))).toBeDefined();
  });

  it("refuses an unknown rubric version", () => {
    expect(() => make(add, "materiality-rubric-9")).toThrow(FloorError);
  });
});

// The payloads that the code of 7a8fca2 (materiality-rubric-1, before claims) built for
// these inputs, frozen as JSON text: rubric-1 replay must stay byte-identical.
const FROZEN = {
  add: '{"id":"decision-floor-0b4f9a7e-6f1c-4a1e-9a43-2f0d7c1b5e21-0","taskId":"task-1","runId":"run-0b4f9a7e-6f1c-4a1e-9a43-2f0d7c1b5e21","signalIds":["evt-1:0"],"class":"technology","source":"floor","authority":"owner","brief":{"question":"Add runtime dependency left-pad (^1.3.0) in app/package.json?","options":[{"id":"a","label":"Keep left-pad","tradeoffs":"The run\'s code stays; the project takes on the package\'s code, licence, updates and security fixes."},{"id":"b","label":"Remove it and write the code in the project","tradeoffs":"No new dependency; the run\'s change is redone with project code to write, test and keep up."},{"id":"c","label":"Use a different package","tradeoffs":"The owner names another package; the run\'s change is redone against it."}],"recommendationSha256":"b38575def72a49053f24e0da1d8034451b2e8a2dfbe97df56a16d881b537a87d","optionOrderSeed":"00000000000000000000000000000000","confidence":"low","costIfWrong":"Removing the package later means rewriting the code that calls it and its tests.","reversibility":"costly","uncertainty":"The harness did not check the package\'s licence, upkeep, size or known vulnerabilities.","blocked":"Merging this run\'s candidate and work that builds on left-pad.","concepts":["runtime-dependency"],"proposedFootprint":["artifact-41ed81dd745de8bf2d25ee756bc15325ebb579022dcc27b69f8087549ad4adf3","artifact-cfbe55820c12da2f0abaac25ac01b11dd3918d2574857efdecf14a016baf2d41","artifact-332d5a57dc7ab4b7cc5670aa1c921379c3398007d3f8807be39bfb2b9928d40c"]},"kind":"decision.opened"}',
  bump: '{"id":"decision-floor-0b4f9a7e-6f1c-4a1e-9a43-2f0d7c1b5e21-0","taskId":"task-1","runId":"run-0b4f9a7e-6f1c-4a1e-9a43-2f0d7c1b5e21","signalIds":["evt-1:1"],"class":"technology","source":"floor","authority":"owner","brief":{"question":"Bump chalk from ^4.1.2 to ^5.3.0 (major) in app/package.json?","options":[{"id":"a","label":"Keep the new major version","tradeoffs":"The run\'s code stays; the project takes on the new major version\'s breaking changes."},{"id":"b","label":"Stay on the previous major version","tradeoffs":"The run\'s change is redone against the previous major version, which may stop getting fixes."}],"recommendationSha256":"b38575def72a49053f24e0da1d8034451b2e8a2dfbe97df56a16d881b537a87d","optionOrderSeed":"00000000000000000000000000000000","confidence":"low","costIfWrong":"Undoing the upgrade later means reverting code changed for the new major version.","reversibility":"costly","uncertainty":"The harness did not check the package\'s licence, upkeep, size or known vulnerabilities.","blocked":"Merging this run\'s candidate and work that builds on chalk.","concepts":["semver-major"],"proposedFootprint":["artifact-9cafd4d767674ca1cbb4814f54b5005b74f662b4425222f0ed024cb3dc2651d0","artifact-cfbe55820c12da2f0abaac25ac01b11dd3918d2574857efdecf14a016baf2d41","artifact-332d5a57dc7ab4b7cc5670aa1c921379c3398007d3f8807be39bfb2b9928d40c"]},"kind":"decision.opened"}',
  dev: '{"id":"decision-floor-0b4f9a7e-6f1c-4a1e-9a43-2f0d7c1b5e21-0","taskId":"task-1","runId":"run-0b4f9a7e-6f1c-4a1e-9a43-2f0d7c1b5e21","signalIds":["evt-1:2"],"class":"technology","source":"floor","authority":"harness","ruling":{"what":"Accepted the dev dependency left-pad (^1.3.0) in app/package.json","why":"materiality-rubric-1, threshold runtimeAddOrMajor: a dev dependency add is under the brief threshold\\nsignal evt-1:2","costIfWrong":"If it matters, a build or test tool was added without an owner brief.","rubricVersion":"materiality-rubric-1"},"kind":"decision.opened"}',
};

describe("materiality-rubric-1 stays byte-identical (replay of old logs)", () => {
  const frozenInput = (signal: FloorSignal) => ({
    ...{ runId: "run-0b4f9a7e-6f1c-4a1e-9a43-2f0d7c1b5e21", index: 0 },
    ...{ taskId: "task-1", repoId: "/r/.git", signal },
    ...{ threshold: "runtimeAddOrMajor" as const, seed: "0".repeat(32) },
    ...{ lockfiles: ["app/pnpm-lock.yaml"], key: new Uint8Array(32).fill(7) },
    rubricVersion: "materiality-rubric-1",
  });
  const dev: FloorSignal = {
    ...add,
    id: "evt-1:2",
    field: "devDependencies",
    runtime: false,
  };

  it.each([
    ["add", add],
    ["bump", { ...bump, id: "evt-1:1" }],
    ["dev", dev],
  ] as const)(
    "builds the %s decision exactly as 7a8fca2 did",
    (name, signal) => {
      const built = floorDecision(frozenInput(signal));
      expect(JSON.stringify(built)).toBe(FROZEN[name]);
      expect(built).toStrictEqual(JSON.parse(FROZEN[name]));
      expect("claims" in (built.authority === "owner" ? built.brief : {})).toBe(
        false,
      );
    },
  );
});
