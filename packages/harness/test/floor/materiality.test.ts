import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  validateFloorEvent,
  validateObjectEvent,
  type DecisionOpened,
  type DecisionOpenedOwned,
  type DecisionOpenedRuling,
  type FloorSignal,
} from "@helmwright/schema";
import { describe, expect, it } from "vitest";
import { FloorError } from "../../src/floor/events.ts";
import {
  BRIEF_THRESHOLDS,
  MATERIALITY_RUBRIC,
  floorDecision,
  floorDecisionId,
  recommendationCommitment,
  recommendationNonce,
  route,
  type BriefThreshold,
  type FloorDecisionInput,
} from "../../src/floor/materiality.ts";
import { footprintAddress } from "../../src/objects/events.ts";

const uuid = "0b4f9a7e-6f1c-4a1e-9a43-2f0d7c1b5e21";
const runId = "run-" + uuid;
const repoId = "/repo/.git";
const key = new Uint8Array(32).fill(7);
const seed = "0123456789abcdef0123456789abcdef";

const runtimeAdd: FloorSignal = {
  id: "evt-1:0",
  type: "dependency.added",
  path: "app/package.json",
  field: "dependencies",
  name: "left-pad",
  runtime: true,
  from: null,
  to: "^1.3.0",
};
const peerAdd: FloorSignal = {
  ...runtimeAdd,
  id: "evt-1:1",
  field: "peerDependencies",
};
const devAdd: FloorSignal = {
  ...runtimeAdd,
  id: "evt-1:2",
  field: "devDependencies",
  runtime: false,
};
const runtimeMajor: FloorSignal = {
  id: "evt-1:3",
  type: "dependency.majorBump",
  path: "app/package.json",
  field: "dependencies",
  name: "chalk",
  runtime: true,
  from: "^4.1.2",
  to: "^5.3.0",
  bump: "major",
};
const devMajor: FloorSignal = {
  ...runtimeMajor,
  id: "evt-1:4",
  field: "devDependencies",
  runtime: false,
};
const unknownBump: FloorSignal = {
  ...runtimeMajor,
  id: "evt-1:5",
  from: "github:a/b",
  to: "github:a/c",
  bump: "unknown",
};
const lockfile: FloorSignal = {
  id: "evt-1:6",
  type: "lockfile.only",
  path: "app/pnpm-lock.yaml",
};

const input = (
  signal: FloorSignal,
  more: Partial<FloorDecisionInput> = {},
): FloorDecisionInput => ({
  runId,
  taskId: "task-1",
  repoId,
  index: 0,
  signal,
  threshold: "runtimeAddOrMajor",
  rubricVersion: "materiality-rubric-1",
  lockfiles: [],
  seed,
  key,
  ...more,
});

function owned(decision: DecisionOpened): DecisionOpenedOwned {
  if (decision.authority !== "owner") throw new Error("not a Brief");
  return decision;
}
function ruled(decision: DecisionOpened): DecisionOpenedRuling {
  if (decision.authority !== "harness") throw new Error("not a Ruling");
  return decision;
}

const codePoints = (text: string) => Array.from(text).length;

describe("route (materiality-rubric-1, Q53)", () => {
  const B = "brief";
  const R = "ruling";
  it.each([
    ["a runtime add", runtimeAdd, B, B, B],
    ["a peer add", peerAdd, B, B, B],
    ["a dev add", devAdd, R, B, R],
    ["a runtime major bump", runtimeMajor, B, B, R],
    ["a dev major bump", devMajor, B, B, R],
    ["an unknown bump", unknownBump, B, B, R],
    ["a lockfile-only change", lockfile, R, B, R],
  ] as const)(
    "routes %s by threshold",
    (_name, signal, byDefault, every, runtimeOnly) => {
      expect(BRIEF_THRESHOLDS).toEqual([
        "runtimeAddOrMajor",
        "everySignal",
        "runtimeAddOnly",
      ]);
      expect(route(signal, "runtimeAddOrMajor")).toBe(byDefault);
      expect(route(signal, "everySignal")).toBe(every);
      expect(route(signal, "runtimeAddOnly")).toBe(runtimeOnly);
    },
  );

  it("names the approved rubric version, which floor.signalled accepts", () => {
    expect(MATERIALITY_RUBRIC).toBe("materiality-rubric-2");
    const event = {
      kind: "floor.signalled",
      detector: "dependency-1",
      phase: "final",
      baseCommit: "a".repeat(40),
      candidateTree: "b".repeat(40),
      signals: [runtimeAdd],
    };
    for (const threshold of BRIEF_THRESHOLDS) {
      const materiality = { rubricVersion: MATERIALITY_RUBRIC, threshold };
      expect(validateFloorEvent({ ...event, materiality })).toBe(true);
    }
  });
});

describe("floorDecisionId", () => {
  it("is decision-floor-<run uuid>-<index>", () => {
    expect(floorDecisionId(runId, 0)).toBe("decision-floor-" + uuid + "-0");
    expect(floorDecisionId(runId, 255)).toBe("decision-floor-" + uuid + "-255");
  });

  it.each([
    ["not a run ID", "task-1", 0],
    ["an empty run ID", "run-", 0],
    ["a negative index", runId, -1],
    ["a fractional index", runId, 1.5],
  ])("refuses %s", (_name, id, index) => {
    expect(() => floorDecisionId(id, index)).toThrow(FloorError);
  });
});

describe("the recommendation commitment (OD-3, OQ-AD-3)", () => {
  it("is SHA-256 of [decisionId, optionId, HMAC-SHA256(key, decisionId)]", () => {
    const id = floorDecisionId(runId, 0);
    const nonce = createHmac("sha256", key).update(id, "utf8").digest("hex");
    expect(recommendationNonce(key, id)).toBe(nonce);
    expect(nonce).toMatch(/^[0-9a-f]{64}$/);
    const sha = createHash("sha256")
      .update(JSON.stringify([id, "a", nonce]), "utf8")
      .digest("hex");
    expect(recommendationCommitment(id, "a", nonce)).toBe(sha);
    const brief = owned(floorDecision(input(runtimeAdd))).brief;
    expect(brief.recommendationSha256).toBe(sha);
    // Another option or key does not verify.
    expect(recommendationCommitment(id, "b", nonce)).not.toBe(sha);
    const other = recommendationNonce(new Uint8Array(32).fill(8), id);
    expect(recommendationCommitment(id, "a", other)).not.toBe(sha);
  });

  it("refuses a key under 32 bytes", () => {
    expect(() => recommendationNonce(new Uint8Array(31), "decision-1")).toThrow(
      FloorError,
    );
  });
});

const ADD_OPTIONS = [
  {
    id: "a",
    label: "Keep left-pad",
    tradeoffs:
      "The run's code stays; the project takes on the package's code, licence, updates and security fixes.",
  },
  {
    id: "b",
    label: "Remove it and write the code in the project",
    tradeoffs:
      "No new dependency; the run's change is redone with project code to write, test and keep up.",
  },
  {
    id: "c",
    label: "Use a different package",
    tradeoffs:
      "The owner names another package; the run's change is redone against it.",
  },
];
const UNCERTAINTY =
  "The harness did not check the package's licence, upkeep, size or known vulnerabilities.";

describe("floor Briefs (materiality-rubric-1)", () => {
  it("builds the approved add Brief", () => {
    const lockfiles = ["app/pnpm-lock.yaml", "app/package-lock.json"];
    const decision = owned(floorDecision(input(runtimeAdd, { lockfiles })));
    expect(validateObjectEvent(decision)).toBe(true);
    const at = (type: "footprint.dependency" | "footprint.file", ref: string) =>
      footprintAddress(type, repoId, ref).id;
    expect(decision).toEqual({
      kind: "decision.opened",
      id: "decision-floor-" + uuid + "-0",
      authority: "owner",
      taskId: "task-1",
      runId,
      signalIds: ["evt-1:0"],
      class: "technology",
      source: "floor",
      brief: {
        question:
          "Add runtime dependency left-pad (^1.3.0) in app/package.json?",
        options: ADD_OPTIONS,
        recommendationSha256: decision.brief.recommendationSha256,
        optionOrderSeed: seed,
        confidence: "low",
        costIfWrong:
          "Removing the package later means rewriting the code that calls it and its tests.",
        reversibility: "costly",
        uncertainty: UNCERTAINTY,
        blocked:
          "Merging this run's candidate and work that builds on left-pad.",
        concepts: ["runtime-dependency"],
        proposedFootprint: [
          at("footprint.dependency", "left-pad"),
          at("footprint.file", "app/package.json"),
          at("footprint.file", "app/package-lock.json"),
          at("footprint.file", "app/pnpm-lock.yaml"),
        ],
      },
    });
  });

  it("builds the bump Brief, also for a dev or unknown bump", () => {
    for (const signal of [runtimeMajor, devMajor, unknownBump]) {
      const decision = owned(floorDecision(input(signal)));
      expect(validateObjectEvent(decision)).toBe(true);
      const { brief } = decision;
      const { from, to } = signal;
      expect(brief.question).toBe(
        `Bump chalk from ${from} to ${to} (major) in app/package.json?`,
      );
      expect(brief.options.map((o) => [o.id, o.label])).toEqual([
        ["a", "Keep the new major version"],
        ["b", "Stay on the previous major version"],
      ]);
      expect(brief.costIfWrong).toBe(
        "Undoing the upgrade later means reverting code changed for the new major version.",
      );
      expect(brief.uncertainty).toBe(UNCERTAINTY);
      expect(brief.blocked).toBe(
        "Merging this run's candidate and work that builds on chalk.",
      );
      expect(brief.concepts).toEqual(["semver-major"]);
      expect([brief.confidence, brief.reversibility]).toEqual([
        "low",
        "costly",
      ]);
    }
  });

  it("stays within the schema with maximum-length text (160/80/200)", () => {
    // Astral code points: each is two UTF-16 units, so clipping is by code point.
    const long = "\u{1D4B3}".repeat(8000);
    const add = { ...runtimeAdd, name: long, to: long, path: long };
    const bump = {
      ...runtimeMajor,
      name: long,
      from: long,
      to: long,
      path: long,
    };
    for (const signal of [add, bump]) {
      const { brief } = owned(
        floorDecision(input(signal, { lockfiles: [long] })),
      );
      expect(codePoints(brief.question)).toBeLessThanOrEqual(160);
      for (const o of brief.options) {
        expect(codePoints(o.label)).toBeLessThanOrEqual(80);
        expect(codePoints(o.tradeoffs)).toBeLessThanOrEqual(200);
      }
      for (const line of [
        brief.costIfWrong,
        brief.uncertainty,
        brief.blocked,
      ]) {
        expect(codePoints(line)).toBeLessThanOrEqual(200);
      }
      expect(brief.question).toContain("…");
      expect(brief.blocked).toContain("…");
      expect(
        validateObjectEvent(
          floorDecision(input(signal, { lockfiles: [long] })),
        ),
      ).toBe(true);
    }
    const { brief } = owned(floorDecision(input(add)));
    expect(codePoints(brief.question)).toBe(155);
    expect(brief.options[0].label).toBe("Keep " + "\u{1D4B3}".repeat(74) + "…");
    expect(codePoints(owned(floorDecision(input(bump))).brief.question)).toBe(
      156,
    );
  });

  it("is deterministic except for the seed and the commitment", () => {
    const first = owned(floorDecision(input(runtimeAdd)));
    const second = owned(
      floorDecision(
        input(runtimeAdd, {
          seed: "f".repeat(32),
          key: new Uint8Array(32).fill(9),
        }),
      ),
    );
    expect(second.brief.optionOrderSeed).toBe("f".repeat(32));
    expect(second.brief.recommendationSha256).not.toBe(
      first.brief.recommendationSha256,
    );
    const fixed = (d: DecisionOpenedOwned) => ({
      ...d,
      brief: { ...d.brief, optionOrderSeed: "", recommendationSha256: "" },
    });
    expect(fixed(second)).toEqual(fixed(first));
    expect(floorDecision(input(runtimeAdd))).toEqual(first);
  });

  it("refuses a seed that is not 128 bits of hex", () => {
    expect(() => floorDecision(input(runtimeAdd, { seed: "x" }))).toThrow(
      FloorError,
    );
  });
});

describe("floor Rulings (materiality-rubric-1)", () => {
  it("rules a dev add", () => {
    const decision = ruled(floorDecision(input(devAdd, { index: 2 })));
    expect(validateObjectEvent(decision)).toBe(true);
    expect(decision).toEqual({
      kind: "decision.opened",
      id: "decision-floor-" + uuid + "-2",
      authority: "harness",
      taskId: "task-1",
      runId,
      signalIds: ["evt-1:2"],
      class: "technology",
      source: "floor",
      ruling: {
        what: "Accepted the dev dependency left-pad (^1.3.0) in app/package.json",
        why:
          "materiality-rubric-1, threshold runtimeAddOrMajor: a dev dependency add is under the brief threshold\n" +
          "signal evt-1:2",
        costIfWrong:
          "If it matters, a build or test tool was added without an owner brief.",
        rubricVersion: "materiality-rubric-1",
      },
    });
  });

  it("rules a lockfile-only change", () => {
    const { ruling } = ruled(floorDecision(input(lockfile, { index: 6 })));
    expect(ruling).toEqual({
      what: "Accepted a lockfile-only change to app/pnpm-lock.yaml",
      why:
        "materiality-rubric-1, threshold runtimeAddOrMajor: a lockfile-only change is under the brief threshold\n" +
        "signal evt-1:6",
      costIfWrong:
        "If it matters, a transitive version changed without an owner brief.",
      rubricVersion: "materiality-rubric-1",
    });
  });

  it("names the threshold used", () => {
    const { ruling } = ruled(
      floorDecision(input(devAdd, { threshold: "runtimeAddOnly" })),
    );
    expect(ruling.why.split("\n")[0]).toBe(
      "materiality-rubric-1, threshold runtimeAddOnly: a dev dependency add is under the brief threshold",
    );
  });

  it("stays within the schema with maximum-length text", () => {
    const long = "\u{1D4B3}".repeat(8000);
    for (const signal of [
      { ...devAdd, name: long, to: long, path: long },
      { ...lockfile, path: long },
    ]) {
      const decision = ruled(floorDecision(input(signal)));
      expect(validateObjectEvent(decision)).toBe(true);
      expect(codePoints(decision.ruling.what)).toBeLessThanOrEqual(200);
      expect(decision.ruling.what).toContain("…");
    }
  });
});

describe("floorDecision refusals", () => {
  // The non-default thresholds' templates come with their fixtures (OQ-AD-5).
  it.each([
    ["a dev add as a Brief", devAdd, "everySignal"],
    ["a lockfile-only change as a Brief", lockfile, "everySignal"],
    ["a major bump as a Ruling", runtimeMajor, "runtimeAddOnly"],
  ] as const)(
    "has no template for %s",
    (_name, signal, threshold: BriefThreshold) => {
      expect(() => floorDecision(input(signal, { threshold }))).toThrow(
        FloorError,
      );
    },
  );

  it("refuses a decision the log would refuse, with its reason", () => {
    const refused = () =>
      floorDecision(input(runtimeAdd, { taskId: "not-a-task" }));
    expect(refused).toThrow(FloorError);
    expect(refused).toThrow(
      "decision.opened cannot be logged: invalid object event payload",
    );
  });
});

describe("the proposed footprint's lockfiles", () => {
  const files = (lockfiles: readonly string[]) =>
    owned(floorDecision(input(runtimeAdd, { lockfiles }))).brief
      .proposedFootprint;
  const file = (ref: string) =>
    footprintAddress("footprint.file", repoId, ref).id;
  const dependency = footprintAddress(
    "footprint.dependency",
    repoId,
    "left-pad",
  ).id;

  it("takes shown text as is, with no second escape", () => {
    // Shown text, as displayText gives it (and signal.path), is not escaped again.
    const shown = "app\\u200b\\/pnpm-lock.yaml";
    expect(files([shown])).toEqual([
      dependency,
      file("app/package.json"),
      file(shown),
    ]);
  });

  it("drops a repeated lockfile and one equal to the manifest", () => {
    expect(
      files(["x/pnpm-lock.yaml", "x/pnpm-lock.yaml", "app/package.json"]),
    ).toEqual([dependency, file("app/package.json"), file("x/pnpm-lock.yaml")]);
  });
});

describe("the threshold values", () => {
  const schema = (name: string): unknown =>
    JSON.parse(
      readFileSync(
        new URL(`../../../schema/schemas/${name}.schema.json`, import.meta.url),
        "utf8",
      ),
    );
  const at = (data: unknown, path: readonly string[]): unknown =>
    path.reduce<unknown>(
      (inner, key) =>
        typeof inner === "object" && inner !== null
          ? new Map(Object.entries(inner)).get(key)
          : undefined,
      data,
    );

  it("equal the config setting's and floor.signalled's enums", () => {
    const config = ["properties", "decisions", "properties", "briefThreshold"];
    const floor = ["$defs", "signalled", "properties", "materiality"];
    expect(at(schema("helmwright-config"), [...config, "enum"])).toEqual(
      BRIEF_THRESHOLDS,
    );
    expect(
      at(schema("floor-event"), [...floor, "properties", "threshold", "enum"]),
    ).toEqual(BRIEF_THRESHOLDS);
  });
});
