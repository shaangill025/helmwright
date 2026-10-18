import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BriefClaim, DecisionOpenedOwned } from "@helmwright/schema";
import {
  artifactRecorded,
  decisionOpened,
  footprintAddress,
  openSessionLog,
  type AppendInput,
  type SessionLog,
} from "../../src/index.ts";
import { TIER_MEANING } from "../../src/objects/claims.ts";

// PB-0 (Q70-1): Brief claims with evidence tiers, on a real sqlite log; no mocks.
const runId = "run-0b7e2c51-58a4-4f0e-9d0c-3d1f4b2a6e90";
const otherRunId = "run-5c1d7a02-93b1-4c8e-8f10-6a2e9d4b7c33";
const repoId = "/Users/x/repo/.git";
let dir: string;
let file: string;
let log: SessionLog;
let runEventId = "";
let otherEventId = "";

const taskPayload = (id: string) => ({
  kind: "task.created",
  id,
  repoId,
  text: "task",
  scope: [],
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "hw-claims-"));
  file = join(dir, "session.sqlite");
  log = openSessionLog(file);
  log.append(input("task.created", taskPayload("task-1")));
  runEventId = log.append(
    input("run.recorded", {
      kind: "run.recorded",
      taskId: "task-1",
      engine: "scripted",
      baseCommit: "a".repeat(40),
      class: "bounded",
    }),
  ).eventId;
  // An event of another run, for a Supported claim to cite.
  otherEventId = log.append(
    input("task.created", taskPayload("task-2"), otherRunId),
  ).eventId;
});
afterEach(() => {
  log.close();
  rmSync(dir, { recursive: true, force: true });
});

let nextId = 0;
function input(
  type: string,
  payload: Record<string, unknown>,
  run = runId,
): AppendInput {
  nextId += 1;
  return {
    eventId: "evt-" + String(nextId),
    graphId: "graph-1",
    runId: run,
    nodeId: "node-1",
    type,
    at: new Date().toISOString(),
    payload,
  };
}
const append = (type: string, payload: object) =>
  log.append(input(type, { ...payload }));
/** Inserts a row past every check but the table triggers, as a raw writer could; returns its seq. */
function rawInsert(type: string, payload: object): number {
  const seq = (log.lastSeq() ?? -1) + 1;
  const raw = new DatabaseSync(file);
  raw
    .prepare(
      "INSERT INTO events (seq, schema_version, event_id, graph_id, run_id," +
        " node_id, type, at, payload) VALUES (?, 1, ?, 'graph-1', ?, 'node-1', ?, ?, ?)",
    )
    .run(
      seq,
      "raw-" + String(seq),
      runId,
      type,
      new Date().toISOString(),
      JSON.stringify(payload),
    );
  raw.close();
  return seq;
}

const footprint = footprintAddress("footprint.file", repoId, "src/a.ts");
const option = (id: "a" | "b") => ({
  id,
  label: "Option " + id,
  tradeoffs: "one more dependency, less code to keep",
});
type Claim = { text: string; tier: string; evidence: string[] };
const brief = (claims?: Claim[]) => ({
  question: "Which HTTP client should the harness use?",
  options: [option("a"), option("b")],
  recommendationSha256: "d".repeat(64),
  optionOrderSeed: "e".repeat(32),
  confidence: "medium",
  costIfWrong: "one module to rewrite",
  reversibility: "costly",
  uncertainty: "how retries behave behind a proxy",
  blocked: "the fetch module",
  concepts: ["http-client"],
  proposedFootprint: [footprint.id],
  ...(claims === undefined ? {} : { claims }),
});
const opened = (claims?: Claim[], id = "decision-1") =>
  ({
    kind: "decision.opened",
    id,
    authority: "owner",
    taskId: "task-1",
    runId,
    signalIds: ["floor-dep-1"],
    class: "technology",
    source: "floor",
    brief: brief(claims),
  }) as const;
const claim = (tier: string, evidence: string[] = []): Claim => ({
  text: "claim of tier " + tier,
  tier,
  evidence,
});

/** Records the footprint artifact and returns its ID; artifacts are accepted for both scopes. */
function artifact(): string {
  append(
    "artifact.recorded",
    artifactRecorded({
      id: footprint.id,
      type: "footprint.file",
      repoId,
      ref: "src/a.ts",
      sha256: footprint.sha256,
    }),
  );
  return footprint.id;
}

const DIRECT_RUN =
  "decision.opened claim 0 (Direct) needs evidence from this run in the log";
const SUPPORTED_OTHER =
  "decision.opened claim 0 (Supported) needs evidence from another run in the log";
const INFERRED =
  "decision.opened claim 1 (Inferred) needs references to earlier claims";
/** A write refusal's message, as the log throws it. */
const refusal = (reason: string) => "invalid event: / " + reason;

describe("TIER_MEANING (Q70-1)", () => {
  it("holds the approved wording of the five tiers", () => {
    expect(TIER_MEANING).toEqual({
      Direct:
        "The harness saw this itself in this run's recorded evidence, such as a diff, a file, a command result or a log event, and the claim cites it.",
      Supported:
        "A cited source outside this run's own observation backs this, such as documentation, a registry entry or an earlier run's record, but the harness did not see it happen here.",
      Inferred:
        "The harness reasoned this from other claims in this brief and has not checked it.",
      Speculative:
        "This is a guess with no evidence behind it; read it as a question, not a fact.",
      Unknown:
        "The harness did not check this or could not find out, and the claim says what is missing.",
    });
  });
});

describe("Brief claims on write (Q70-1)", () => {
  it("accepts every tier: Direct from this run, Supported from another run", () => {
    expect(() =>
      append(
        "decision.opened",
        opened([
          claim("Direct", [runEventId]),
          claim("Supported", [otherEventId]),
          claim("Inferred", ["claim:0", "claim:1"]),
          claim("Speculative"),
          claim("Unknown"),
        ]),
      ),
    ).not.toThrow();
  });

  it("accepts an artifact for a Direct and for a Supported claim", () => {
    const id = artifact();
    expect(() =>
      append(
        "decision.opened",
        opened([claim("Direct", [id]), claim("Supported", [id])]),
      ),
    ).not.toThrow();
  });

  it("accepts an old Brief with no claims and one with an empty list", () => {
    expect(() => append("decision.opened", opened())).not.toThrow();
    expect(() =>
      append("decision.opened", opened([], "decision-2")),
    ).not.toThrow();
  });

  it("refuses Direct evidence from another run, and Supported evidence from this run (ruling 1)", () => {
    expect(() =>
      append("decision.opened", opened([claim("Direct", [otherEventId])])),
    ).toThrow(refusal(DIRECT_RUN));
    expect(() =>
      append("decision.opened", opened([claim("Supported", [runEventId])])),
    ).toThrow(refusal(SUPPORTED_OTHER));
  });

  it("refuses a Direct or Supported claim whose evidence is not in the log", () => {
    expect(() =>
      append("decision.opened", opened([claim("Direct", ["evt-missing"])])),
    ).toThrow(refusal(DIRECT_RUN));
    expect(() =>
      append("decision.opened", opened([claim("Supported", ["evt-missing"])])),
    ).toThrow(refusal(SUPPORTED_OTHER));
    for (const tier of ["Direct", "Supported"]) {
      expect(() => append("decision.opened", opened([claim(tier)]))).toThrow(
        refusal(`decision.opened claim 0 (${tier}) needs evidence`),
      );
    }
  });

  it("refuses a claim reference as Direct evidence", () => {
    expect(() =>
      append("decision.opened", opened([claim("Direct", ["claim:0"])])),
    ).toThrow(refusal(DIRECT_RUN));
  });

  it("refuses evidence that sits only in a later event", () => {
    // The decision's own event ID is not yet in the log when it is checked.
    expect(() =>
      append(
        "decision.opened",
        opened([claim("Direct", ["evt-" + String(nextId + 1)])]),
      ),
    ).toThrow(refusal(DIRECT_RUN));
  });

  it("refuses an Inferred claim with no earlier claim to cite", () => {
    const id = artifact();
    for (const evidence of [[], [id], ["claim:1"], ["claim:2"], ["claim:x"]]) {
      expect(() =>
        append(
          "decision.opened",
          opened([claim("Direct", [id]), claim("Inferred", evidence)]),
        ),
      ).toThrow(refusal(INFERRED));
    }
  });

  it("refuses a repeated evidence reference in any tier", () => {
    const id = artifact();
    expect(() =>
      append("decision.opened", opened([claim("Direct", [id, id])])),
    ).toThrow(
      refusal("decision.opened claim 0 (Direct) repeats an evidence reference"),
    );
    expect(() =>
      append(
        "decision.opened",
        opened([
          claim("Direct", [id]),
          claim("Inferred", ["claim:0", "claim:0"]),
        ]),
      ),
    ).toThrow(
      refusal(
        "decision.opened claim 1 (Inferred) repeats an evidence reference",
      ),
    );
  });

  it("refuses a Speculative or Unknown claim with evidence", () => {
    const id = artifact();
    for (const tier of ["Speculative", "Unknown"]) {
      expect(() =>
        append("decision.opened", opened([claim(tier, [id])])),
      ).toThrow(refusal(`decision.opened claim 0 (${tier}) has no evidence`));
    }
  });

  it("refuses more than 5 claims and an unknown tier, by schema", () => {
    const six = Array.from({ length: 6 }, () => claim("Unknown"));
    const schema = refusal("invalid object event payload");
    expect(() => append("decision.opened", opened(six))).toThrow(schema);
    expect(() => append("decision.opened", opened([claim("Certain")]))).toThrow(
      schema,
    );
  });

  it("lets the builder path through without a log, for the log to resolve", () => {
    // decisionOpened has no log, so it accepts any evidence ID (RESOLVES_ANY)...
    // The input is typed, so the builder's own signature is what this exercises.
    const typed = (
      claims: [BriefClaim],
    ): Omit<DecisionOpenedOwned, "kind"> => ({
      ...{ id: "decision-1", authority: "owner", taskId: "task-1", runId },
      ...{ signalIds: ["floor-dep-1"], class: "technology", source: "floor" },
      brief: {
        ...{ question: "Which HTTP client should the harness use?" },
        options: [option("a"), option("b")],
        recommendationSha256: "d".repeat(64),
        optionOrderSeed: "e".repeat(32),
        confidence: "medium",
        costIfWrong: "one module to rewrite",
        reversibility: "costly",
        uncertainty: "how retries behave behind a proxy",
        blocked: "the fetch module",
        concepts: ["http-client"],
        proposedFootprint: [footprint.id],
        claims,
      },
    });
    const claims: [BriefClaim] = [
      { text: "cited", tier: "Direct", evidence: ["evt-elsewhere"] },
    ];
    const built = decisionOpened(typed(claims));
    if (built.authority !== "owner") throw new Error("not an owned decision");
    expect(built.brief.claims).toEqual(claims);
    // ... but the structural tier rules still hold.
    const unknown: [BriefClaim] = [
      { text: "unsure", tier: "Unknown", evidence: ["x"] },
    ];
    expect(() => decisionOpened(typed(unknown))).toThrow(
      "decision.opened claim 0 (Unknown) has no evidence",
    );
  });
});

describe("Brief claims on read and rebuild (Q70-1)", () => {
  const corrupt = (seq: number, reason: string) =>
    `session log: corrupt event at seq ${String(seq)}: invalid event: / ${reason}`;

  it("refuses a raw-inserted Direct claim with no resolvable evidence on every read and rebuild", () => {
    const seq = rawInsert(
      "decision.opened",
      opened([claim("Direct", ["evt-nope"])]),
    );
    expect(() => log.events()).toThrow(corrupt(seq, DIRECT_RUN));
    expect(() => log.rebuildProjections()).toThrow(corrupt(seq, DIRECT_RUN));
  });

  it("refuses a raw-inserted Direct claim that cites another run's event", () => {
    const seq = rawInsert(
      "decision.opened",
      opened([claim("Direct", [otherEventId])]),
    );
    expect(() => log.events()).toThrow(corrupt(seq, DIRECT_RUN));
  });

  it("refuses a raw-inserted Supported claim that cites this run's event", () => {
    const seq = rawInsert(
      "decision.opened",
      opened([claim("Supported", [runEventId])]),
    );
    expect(() => log.events()).toThrow(corrupt(seq, SUPPORTED_OTHER));
  });

  it("refuses a raw-inserted Speculative claim with evidence on read and rebuild", () => {
    const id = artifact();
    const seq = rawInsert(
      "decision.opened",
      opened([claim("Speculative", [id])]),
    );
    const reason = "decision.opened claim 0 (Speculative) has no evidence";
    expect(() => log.events()).toThrow(corrupt(seq, reason));
    expect(() => log.rebuildProjections()).toThrow(corrupt(seq, reason));
  });

  it("refuses a raw-inserted Inferred claim with no claim ref", () => {
    const id = artifact();
    const seq = rawInsert(
      "decision.opened",
      opened([claim("Direct", [id]), claim("Inferred", [id])]),
    );
    expect(() => log.events()).toThrow(corrupt(seq, INFERRED));
  });

  it("does not resolve evidence from an event stored after the claim, also on read", () => {
    const seq = rawInsert(
      "decision.opened",
      opened([claim("Direct", ["evt-later"])]),
    );
    // The cited event arrives only after the decision, so it does not back it.
    log.append({
      ...input("task.created", taskPayload("task-3")),
      eventId: "evt-later",
    });
    expect(() => log.events()).toThrow(corrupt(seq, DIRECT_RUN));
  });

  it("refuses with the normal refusal, not a SQLite error, past a raw floor.signalled with non-object signals", () => {
    rawInsert("floor.signalled", {
      kind: "floor.signalled",
      signals: ["x"],
    });
    expect(() =>
      append("decision.opened", opened([claim("Direct", ["x"])])),
    ).toThrow(refusal(DIRECT_RUN));
  });

  it("rebuilds a log whose claims resolve", () => {
    const id = artifact();
    append(
      "decision.opened",
      opened([claim("Direct", [id]), claim("Supported", [otherEventId])]),
    );
    expect(() => log.rebuildProjections()).not.toThrow();
    expect(log.events()).toHaveLength(5);
  });
});
