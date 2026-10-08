import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  validateObjectEvent as validate,
  type ArtifactRecord,
  type ArtifactRecorded,
  type DecisionBrief,
  type DecisionFootprintRecorded,
  type DecisionOpened,
  type DecisionOpenedOwned,
  type DecisionOpenedRuling,
  type DecisionOption,
  type DecisionOutcomeSignalled,
  type ObjectEvent,
  type Ruling,
  type RunRecord,
  type RunRecorded,
  type TaskCreated,
  type TaskRecord,
} from "../src/index.ts";

const repoId = "/Users/x/repo/.git";
const runId = "run-0b7e2c51-58a4-4f0e-9d0c-3d1f4b2a6e90";
const artifactId = "artifact-" + "b".repeat(64);
const taskCreated: TaskCreated = {
  kind: "task.created",
  id: "task-1",
  repoId,
  text: "add a dependency",
  scope: ["src/a.ts"],
};
const runRecorded: RunRecorded = {
  kind: "run.recorded",
  taskId: "task-1",
  engine: "scripted",
  baseCommit: "a".repeat(40),
  class: "bounded",
};
const artifactRecorded: ArtifactRecorded = {
  kind: "artifact.recorded",
  id: artifactId,
  type: "footprint.file",
  repoId,
  ref: "src/a.ts",
  sha256: "b".repeat(64),
};
const option = (id: DecisionOption["id"]): DecisionOption => ({
  id,
  label: "Option " + id,
  tradeoffs: "one more dependency, less code to keep",
});
const [a, b, c, d] = [option("a"), option("b"), option("c"), option("d")];
const brief: DecisionBrief = {
  question: "Which HTTP client should the harness use?",
  options: [a, b],
  recommendationSha256: "d".repeat(64),
  optionOrderSeed: "e".repeat(32),
  confidence: "medium",
  costIfWrong: "one module to rewrite",
  reversibility: "costly",
  uncertainty: "how retries behave behind a proxy",
  blocked: "the fetch module",
  concepts: ["http-client"],
  proposedFootprint: [artifactId],
};
const owned: DecisionOpenedOwned = {
  kind: "decision.opened",
  id: "decision-1",
  authority: "owner",
  taskId: "task-1",
  runId,
  signalIds: ["floor-dep-1"],
  class: "technology",
  source: "floor",
  brief,
};
const rulingBody: Ruling = {
  what: "kept the existing HTTP client",
  why: "The change is under the brief threshold.\nNo new dependency.",
  costIfWrong: "a missed owner decision",
  rubricVersion: "materiality-rubric-1",
};
const ruling: DecisionOpenedRuling = {
  kind: "decision.opened",
  id: "decision-2",
  authority: "harness",
  taskId: "task-1",
  runId,
  signalIds: ["evt_01"],
  class: "technology",
  source: "floor",
  ruling: rulingBody,
};
const footprint: DecisionFootprintRecorded = {
  kind: "decision.footprint.recorded",
  decisionId: "decision-1",
  artifactIds: [artifactId],
};
const outcome: DecisionOutcomeSignalled = {
  kind: "decision.outcome.signalled",
  decisionId: "decision-1",
  signal: "rework",
  runId,
  artifactIds: [artifactId],
};
const events: [string, ObjectEvent][] = [
  ["task.created", taskCreated],
  ["run.recorded", runRecorded],
  ["artifact.recorded", artifactRecorded],
  ["owned decision.opened", owned],
  ["ruling decision.opened", ruling],
  ["decision.footprint.recorded", footprint],
  ["decision.outcome.signalled", outcome],
];
const kinds = [...new Set(events.map(([, event]) => event.kind))];
/** Event types with no variant: reserved until A3 and SIG (OD-2), or not object events. */
const reserved = [
  "decision.owner.precommit",
  "decision.owner.resolve",
  "decision.recommendation.revealed",
];

const without = (event: object, key: string) =>
  Object.fromEntries(Object.entries(event).filter(([k]) => k !== key));
/** JSON round trip, so a change to `undefined` removes the key. */
const check = (event: object, change: object) =>
  validate(JSON.parse(JSON.stringify({ ...event, ...change })));
const many = (count: number, item: (i: number) => string) =>
  Array.from({ length: count }, (_, i) => item(i));
const artifacts = (count: number) =>
  many(count, (i) => "artifact-" + String(i));
const withBrief = (change: object) => ({ brief: { ...brief, ...change } });
const footprintTypes = ["file", "symbol", "dependency", "module"].map(
  (type) => "footprint." + type,
);
/** Every artifact type except a concept expansion, which has no repository. */
const repoTypes = ["diff", "report", ...footprintTypes];
/** Record fields the envelope or objects.schema.json supply, and owner-written fields (OD-1). */
const notInPayload = [
  { createdSeq: 0 },
  { createdAt: "2026-10-08T12:00:00.000Z" },
  { status: "open" },
  { footprint: [] },
  { outcomes: [] },
  { ring: 0 },
  { precommit: "a" },
  { rationale: "It keeps one client." },
  { recommendation: "a" },
  { extra: true },
];

describe("ObjectEvent", () => {
  it.each(events)("accepts a well-formed %s", (_label, event) => {
    expect(validate(event)).toBe(true);
  });

  it.each(
    events.flatMap(([label, event]) =>
      Object.keys(event).map((key) => [label, key, event] as const),
    ),
  )("rejects a %s without %s", (_label, key, event) => {
    expect(validate(without(event, key))).toBe(false);
  });

  it.each(
    events.flatMap(([label, event]) =>
      notInPayload.map((change) => [label, change, event] as const),
    ),
  )("rejects a %s with %j", (_label, change, event) => {
    expect(check(event, change)).toBe(false);
  });

  it.each([{ id: runId }, { graphId: "graph_01" }, { nodeId: "node_01" }])(
    "rejects a run.recorded with the envelope's %j",
    (change) => {
      expect(check(runRecorded, change)).toBe(false);
    },
  );

  it.each(
    events.flatMap(([label, event]) =>
      [...reserved, ...kinds, "decision.opend", "task.updated"]
        .filter((kind) => kind !== event.kind)
        .map((kind) => [label, kind, event] as const),
    ),
  )("rejects a %s with kind %s", (_label, kind, event) => {
    expect(validate({ ...event, kind })).toBe(false);
  });

  it.each([
    {
      kind: "decision.owner.precommit",
      decisionId: "decision-1",
      optionId: "a",
    },
    {
      kind: "decision.recommendation.revealed",
      decisionId: "decision-1",
      optionId: "a",
      nonce: "f".repeat(64),
    },
  ])("rejects the reserved $kind", (payload) => {
    expect(validate(payload)).toBe(false);
  });

  it.each([null, [], "task.created", 1, {}])("rejects %j", (value) => {
    expect(validate(value)).toBe(false);
  });

  it.each<[string, ObjectEvent, object[], object[]]>([
    [
      "task.created",
      taskCreated,
      [
        { scope: [] },
        { scope: many(256, (i) => "src/" + String(i) + ".ts") },
        // Order and uniqueness are the writer's checks, not the schema's.
        { scope: ["src/b.ts", "src/a.ts", "src/a.ts"] },
        { text: "line one\nline two" },
        { repoId: "/" },
      ],
      [
        { scope: many(257, (i) => "src/" + String(i) + ".ts") },
        { scope: ["/abs"] },
        { scope: ["a/../b"] },
        { text: "" },
        { text: "   " },
        { text: "x".repeat(8193) },
        ...["\u0000", "\u001b", "\u007f", "‮"].map((ch) => ({
          text: "a" + ch + "b",
        })),
        { id: "1" },
        { id: "run-1" },
        { repoId: "relative" },
      ],
    ],
    [
      "run.recorded",
      runRecorded,
      [{ baseCommit: "a".repeat(64), class: "architectural" }],
      [
        { taskId: "1" },
        { taskId: runId },
        { engine: "native" },
        { baseCommit: "a".repeat(39) },
        { class: "trivial" },
        { terminal: null },
      ],
    ],
    [
      "artifact.recorded",
      artifactRecorded,
      [
        ...["conceptExpansion", ...repoTypes].map((type) => ({ type })),
        { type: "conceptExpansion", repoId: undefined, ref: "concept-slug" },
        { type: "diff", ref: "d".repeat(40), runId },
      ],
      [
        ...repoTypes.map((type) => ({ type, repoId: undefined })),
        { type: "footprint.boundary" },
        { id: "1" },
        { runId: "1" },
        { runId: "task-1" },
        { sha256: "B".repeat(64) },
        { ref: "" },
        { ref: "a\nb" },
      ],
    ],
    [
      "owned decision.opened",
      owned,
      [
        withBrief({ options: [a, b, c] }),
        withBrief({ options: [d, c, b, a] }),
        { source: "plan", signalIds: [] },
        { source: "selfFlag", class: "architecture" },
        { class: "scope" },
      ],
      [
        { ruling: rulingBody },
        { brief: undefined, ruling: rulingBody },
        { class: null },
        { source: "intake" },
        { authority: "harness" },
        { id: "1" },
        { taskId: "1" },
        { runId: "1" },
        { signalIds: ["-x"] },
        withBrief({ options: [a] }),
        withBrief({ options: [a, b, c, d, a] }),
        withBrief({ recommendation: "a" }),
        withBrief({ question: "a\nb" }),
      ],
    ],
    [
      "ruling decision.opened",
      ruling,
      [
        { class: null, source: "intake" },
        { class: "scope", source: "plan", signalIds: [] },
        { ruling: { ...rulingBody, rubricVersion: "intake-rubric-1" } },
      ],
      [
        { brief },
        { ruling: undefined, brief },
        { status: "resolved" },
        { authority: "owner" },
        { source: "selfFlag" },
        { class: "dependency" },
        { runId: "1" },
        { ruling: { ...rulingBody, what: undefined } },
        { ruling: { ...rulingBody, why: " \n" } },
        { ruling: { ...rulingBody, extra: 1 } },
      ],
    ],
    [
      "decision.footprint.recorded",
      footprint,
      [{ artifactIds: artifacts(1024) }],
      [
        { artifactIds: [] },
        { artifactIds: artifacts(1025) },
        { artifactIds: ["task-1"] },
        { decisionId: "1" },
      ],
    ],
    [
      "decision.outcome.signalled",
      outcome,
      [{ signal: "dependencyChanged", artifactIds: artifacts(256) }],
      [
        { artifactIds: [] },
        { artifactIds: artifacts(257) },
        { signal: "drift" },
        { runId: "1" },
        { decisionId: "task-1" },
        { at: "2026-10-08T12:00:00.000Z", seq: 3 },
      ],
    ],
  ])("checks the changes to a %s", (_label, event, good, bad) => {
    for (const change of good) {
      expect([change, check(event, change)]).toEqual([change, true]);
    }
    for (const change of bad) {
      expect([change, check(event, change)]).toEqual([change, false]);
    }
  });

  describe("copies of objects.schema.json", () => {
    type Def = Record<string, unknown> & {
      properties?: Record<string, Def>;
    };
    const read = (file: string) =>
      JSON.parse(
        readFileSync(new URL("../schemas/" + file, import.meta.url), "utf8"),
      ) as { $defs: Record<string, Def | undefined> };
    const objects = read("objects.schema.json").$defs;
    const own = read("object-event.schema.json").$defs;
    /** A copy differs from its source only in its `$comment`. */
    const strip = (def: Def | undefined) =>
      Object.fromEntries(
        Object.entries(def ?? {}).filter(([key]) => key !== "$comment"),
      );
    const names =
      "taskId runId artifactId decisionId repoId text displayText scopeEntry " +
      "taskClass sha256 oid decisionClass signalId signalIds brief option " +
      "rulingBody seed conceptSlug rubricVersion question optionLabel line";
    const copies: [string, Def | undefined, Def | undefined][] = [
      ...names
        .split(" ")
        .map((name): [string, Def | undefined, Def | undefined] => [
          name,
          own[name],
          objects[name],
        ]),
      [
        "artifact.properties.type",
        own["artifactType"],
        objects["artifact"]?.properties?.["type"],
      ],
      ...["signal", "artifactIds"].map(
        (key): [string, Def | undefined, Def | undefined] => [
          "outcomeSignal.properties." + key,
          own["decisionOutcomeSignalled"]?.properties?.[key],
          objects["outcomeSignal"]?.properties?.[key],
        ],
      ),
    ];

    it.each(copies)("keeps %s equal to its source", (name, copy, source) => {
      expect(source).toBeDefined();
      expect(copy?.["$comment"]).toBe(
        "Copy of objects.schema.json's `" + name + "`.",
      );
      expect(strip(copy)).toEqual(strip(source));
    });

    it("keeps the artifact's repoId rule equal to its source", () => {
      const copy = own["artifactRecorded"];
      const source = objects["artifact"];
      expect(source?.["if"]).toBeDefined();
      expect([copy?.["if"], copy?.["then"]]).toEqual([
        source?.["if"],
        source?.["then"],
      ]);
    });

    it.each([
      ["decisionOpenedOwned", "ownedDecision"],
      ["decisionOpenedRuling", "ruling"],
    ])("keeps the shared fields of %s equal to %s", (name, source) => {
      const keys = ["authority", "taskId", "runId", "class", "source"];
      const pick = (def: Def | undefined) =>
        keys.map((key) => def?.properties?.[key]);
      expect(pick(objects[source])).not.toContain(undefined);
      expect(pick(own[name])).toEqual(pick(objects[source]));
    });
  });

  it("types each payload like the record it creates", () => {
    expectTypeOf<DecisionOpenedOwned["brief"]>().toEqualTypeOf<DecisionBrief>();
    expectTypeOf<TaskCreated["scope"]>().toEqualTypeOf<TaskRecord["scope"]>();
    expectTypeOf<RunRecorded["class"]>().toEqualTypeOf<RunRecord["class"]>();
    expectTypeOf<ArtifactRecorded["type"]>().toEqualTypeOf<
      ArtifactRecord["type"]
    >();
    expectTypeOf<DecisionOpenedRuling["ruling"]>().toEqualTypeOf<Ruling>();
    expectTypeOf<DecisionOpened>().toEqualTypeOf<
      DecisionOpenedOwned | DecisionOpenedRuling
    >();
    expectTypeOf<ObjectEvent["kind"]>().toEqualTypeOf<
      | "task.created"
      | "run.recorded"
      | "artifact.recorded"
      | "decision.opened"
      | "decision.footprint.recorded"
      | "decision.outcome.signalled"
    >();
    expect(kinds).toHaveLength(6);
  });

  it("narrows unknown input to ObjectEvent", () => {
    const input: unknown = JSON.parse(JSON.stringify(ruling));
    if (validate(input)) {
      expectTypeOf(input).toEqualTypeOf<ObjectEvent>();
    } else {
      expect.unreachable();
    }
  });
});
