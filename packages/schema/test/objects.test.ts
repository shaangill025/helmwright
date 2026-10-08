import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  validateEvent,
  validateObjectRecord as validate,
  type ArtifactRecord,
  type Event,
  type IntakeClass,
  type ObjectRecord,
  type RotReviewTrigger,
  type RuleRecord,
  type RunRecord,
  type SkillRecord,
  type TaskClass,
  type TaskRecord,
} from "../src/index.ts";

const created = { createdAt: "2026-10-08T12:00:00.000Z", createdSeq: 0 };
const repoId = "/Users/x/repo/.git";
const task: TaskRecord = {
  id: "task-1",
  kind: "task",
  ring: 0,
  ...created,
  repoId,
  text: "add a dependency",
  scope: ["src/a.ts"],
  status: "open",
};
const run: RunRecord = {
  id: "run-0b7e2c51-58a4-4f0e-9d0c-3d1f4b2a6e90",
  kind: "run",
  ring: 0,
  ...created,
  taskId: "task-1",
  graphId: "graph-0b7e2c51-58a4-4f0e-9d0c-3d1f4b2a6e91",
  nodeId: "node-0b7e2c51-58a4-4f0e-9d0c-3d1f4b2a6e92",
  engine: "scripted",
  baseCommit: "a".repeat(40),
  class: "bounded",
  terminal: null,
};
const artifact: ArtifactRecord = {
  id: "artifact-" + "b".repeat(64),
  kind: "artifact",
  ring: 0,
  ...created,
  type: "footprint.file",
  repoId,
  ref: "src/a.ts",
  sha256: "b".repeat(64),
};
const rule: RuleRecord = {
  id: "rule-1",
  kind: "rule",
  ring: 0,
  ...created,
  text: "Do not add a second HTTP client.",
  authority: "owner",
  evidenceDecisionIds: ["decision-1"],
  assumption: "One HTTP client keeps retries and proxies in one place.",
  reviewTrigger: ["model"],
  status: "live",
};
const skill: SkillRecord = {
  id: "skill-1",
  kind: "skill",
  ring: 1,
  ...created,
  name: "review-bundle",
  version: 1,
  digest: "c".repeat(64),
  status: "candidate",
};
const records: ObjectRecord[] = [task, run, artifact, rule, skill];
const kinds = records.map((record) => record.kind);
const event: Event = {
  schemaVersion: 1,
  eventId: "evt_01",
  seq: 0,
  graphId: "graph_01",
  runId: "run_01",
  nodeId: "node_01",
  type: "run.started",
  at: "2026-10-08T12:00:00.000Z",
  payload: {},
};

const without = (record: object, key: string) =>
  Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
/** JSON round trip, so a change to `undefined` removes the key. */
const check = (record: object, change: object) =>
  validate(JSON.parse(JSON.stringify({ ...record, ...change })));
/** An ID of `length` characters with the record's kind prefix. */
const idOf = (record: ObjectRecord, length: number) =>
  record.kind + "-" + "a".repeat(length - record.kind.length - 1);
const many = (count: number, item: (i: number) => string) =>
  Array.from({ length: count }, (_, i) => item(i));
/** Characters no display text may have, built so that the source holds none of them. */
const hidden = [0x202e, 0x200b, 0x2028, 0x85, 0x7f, 0x1b].map((c) =>
  String.fromCodePoint(c),
);

describe("ObjectRecord", () => {
  it.each(records)("accepts a well-formed $kind", (record) => {
    expect(validate(record)).toBe(true);
  });

  it.each(
    records.flatMap((record) =>
      Object.keys(record).map((key) => [record.kind, key, record] as const),
    ),
  )("rejects a %s without %s", (_kind, key, record) => {
    expect(validate(without(record, key))).toBe(false);
  });

  it.each(records)("rejects an extra key on a $kind", (record) => {
    expect(validate({ ...record, extra: true })).toBe(false);
  });

  it.each(
    records.flatMap((record) =>
      [...kinds, "decision"]
        .filter((kind) => kind !== record.kind)
        .map((kind) => [record.kind, kind, record] as const),
    ),
  )("rejects a %s with kind %s", (_kind, kind, record) => {
    expect(validate({ ...record, kind })).toBe(false);
  });

  it.each(
    records.flatMap((record) =>
      [0, 1, 2, "0", null]
        .filter((ring) => ring !== record.ring)
        .map((ring) => [record.kind, ring, record] as const),
    ),
  )("rejects a %s with ring %j", (_kind, ring, record) => {
    expect(validate({ ...record, ring })).toBe(false);
  });

  it.each([null, [], "task", 1])("rejects %j", (value) => {
    expect(validate(value)).toBe(false);
  });

  it.each(
    records.flatMap((record) =>
      [
        ...[...kinds, "decision"]
          .filter((kind) => kind !== record.kind)
          .map((kind) => kind + "-1"),
        record.kind + "_01",
        record.kind + "-",
        record.kind + "--1",
        "1",
        idOf(record, 129),
      ].map((id) => [record.kind, id, record] as const),
    ),
  )("rejects a %s with ID %j", (_kind, id, record) => {
    expect(validate({ ...record, id })).toBe(false);
  });

  it.each(records)(
    "accepts a 128-character $kind ID, which is a valid envelope ID",
    (record) => {
      const id = idOf(record, 128);
      expect(validate({ ...record, id })).toBe(true);
      expect(validateEvent({ ...event, runId: id })).toBe(true);
      expect(validateEvent({ ...event, runId: record.id })).toBe(true);
    },
  );

  it.each(
    records.flatMap((record) =>
      [
        { createdSeq: Number.MAX_SAFE_INTEGER },
        { createdAt: "2026-12-31T23:59:59.999Z" },
      ].map((change) => [record.kind, change, record] as const),
    ),
  )("accepts a %s with %j", (_kind, change, record) => {
    expect(check(record, change)).toBe(true);
  });

  it.each(
    records.flatMap((record) =>
      [
        { createdSeq: -1 },
        { createdSeq: 1.5 },
        { createdSeq: 2 ** 53 },
        { createdSeq: "0" },
        { createdAt: "2026-10-08T12:00:00Z" },
        { createdAt: "2026-10-08T12:00:00.000+01:00" },
        { createdAt: "2026-13-08T12:00:00.000Z" },
      ].map((change) => [record.kind, change, record] as const),
    ),
  )("rejects a %s with %j", (_kind, change, record) => {
    expect(check(record, change)).toBe(false);
  });

  it.each<[string, ObjectRecord, object[], object[]]>([
    [
      "task",
      task,
      [
        { scope: [] },
        { scope: many(256, (i) => "src/" + String(i) + ".ts") },
        // Order and uniqueness are the writer's checks, not the schema's.
        { scope: ["src/b.ts", "src/a.ts", "src/a.ts"] },
        { scope: ["docs/**", "a b/café.md"] },
        { status: "done" },
        { text: "line one\nline two" },
        { text: "\u{1f600}".repeat(8192) },
        // Tabs, CRLF and an emoji joined by U+200D are honest text.
        { text: "a\tb\r\nc \u{1f468}‍\u{1f469}‍\u{1f467}" },
        { repoId: "/" },
      ],
      [
        { scope: many(257, (i) => "src/" + String(i) + ".ts") },
        ...["/abs", "a/../b", "a//b", "src\\a.ts", "", "./a", "src/"].map(
          (entry) => ({ scope: [entry] }),
        ),
        ...hidden.map((c) => ({ scope: ["src/a" + c + ".ts"] })),
        { scope: "src/a.ts" },
        { text: "" },
        { text: "   " },
        { text: " \n\t" },
        { text: "x".repeat(8193) },
        // Control characters, bidi controls and lone surrogates.
        ...[
          "\u0000",
          "\u001b",
          "\u007f",
          "\u0085",
          "‮",
          "⁦",
          "‏",
          "\ud800",
          "\udc00",
        ].map((c) => ({ text: "a" + c + "b" })),
        { repoId: "relative" },
        { repoId: "" },
        { repoId: "/a\u001bb" },
        { repoId: "/" + "a".repeat(4096) },
        { status: "closed" },
        { class: "bounded" },
        { baseCommit: "a".repeat(40) },
      ],
    ],
    [
      "run",
      run,
      [
        { terminal: { kind: "completed" } },
        ...[
          "timeout",
          "max_iterations",
          "max_tool_calls",
          "no_progress",
          "cancelled",
        ].map((reason) => ({ terminal: { kind: "incomplete", reason } })),
        { terminal: { kind: "failed", error: "sandbox exited 137" } },
        { baseCommit: "a".repeat(64), class: "architectural" },
      ],
      [
        { taskId: "t1" },
        { taskId: "run-1" },
        { graphId: "-x" },
        { nodeId: "a b" },
        { engine: "native" },
        { engine: "claudeCode" },
        { baseCommit: "a".repeat(39) },
        { baseCommit: "A".repeat(40) },
        { class: "trivial" },
        { terminal: { kind: "completed", extra: 1 } },
        { terminal: { kind: "incomplete" } },
        { terminal: { kind: "incomplete", reason: "oom" } },
        { terminal: { kind: "failed", error: "" } },
        { terminal: { kind: "failed", error: "a\nb" } },
        { terminal: { kind: "failed" } },
        { terminal: { kind: "done" } },
        { terminal: "completed" },
        { terminal: undefined },
      ],
    ],
    [
      "artifact",
      artifact,
      [
        ...[
          "diff",
          "report",
          "conceptExpansion",
          "footprint.file",
          "footprint.symbol",
          "footprint.dependency",
          "footprint.module",
        ].map((type) => ({ type })),
        { type: "conceptExpansion", repoId: undefined, ref: "concept-slug" },
        { runId: "run-x" },
        { type: "diff", ref: "d".repeat(40), runId: "run-x" },
        { type: "footprint.symbol", ref: "src/a.ts#parse" },
      ],
      [
        ...[
          "diff",
          "report",
          "footprint.file",
          "footprint.symbol",
          "footprint.dependency",
          "footprint.module",
        ].map((type) => ({ type, repoId: undefined })),
        { type: "footprint.boundary" },
        { sha256: "B".repeat(64) },
        { sha256: "b".repeat(63) },
        { ref: "" },
        ...hidden.map((c) => ({ ref: "src/a" + c + ".ts" })),
        { ref: "x".repeat(8193) },
        { repoId: "relative" },
        { runId: "task-1" },
        { id: "artifact_x" },
      ],
    ],
    [
      "rule",
      rule,
      [
        { evidenceDecisionIds: [] },
        { evidenceDecisionIds: many(256, (i) => "decision-" + String(i)) },
        { reviewTrigger: ["model", "engine", "milestone"] },
        { status: "retired" },
      ],
      [
        { authority: "harness" },
        { evidenceDecisionIds: ["d1"] },
        { evidenceDecisionIds: ["task-1"] },
        { evidenceDecisionIds: many(257, (i) => "decision-" + String(i)) },
        { text: "  " },
        { assumption: "" },
        { assumption: " leading space" },
        { assumption: "two\nlines" },
        { reviewTrigger: [] },
        { reviewTrigger: ["weekly"] },
        { reviewTrigger: ["model", "engine", "milestone", "model"] },
        { status: "proposed" },
        { ring: 1 },
      ],
    ],
    [
      "skill",
      skill,
      [
        { status: "live" },
        { status: "retired" },
        { version: Number.MAX_SAFE_INTEGER },
        { name: "a" + "-".repeat(63) },
      ],
      [
        { name: "Review" },
        { name: "-x" },
        { name: "a".repeat(65) },
        { name: "a_b" },
        { version: 0 },
        { version: 1.5 },
        { version: "1" },
        { digest: "c".repeat(63) },
        { status: "promoted" },
        { ring: 0 },
      ],
    ],
  ])("checks the changes to a %s", (_kind, record, good, bad) => {
    for (const change of good) {
      expect([change, check(record, change)]).toEqual([change, true]);
    }
    for (const change of bad) {
      expect([change, check(record, change)]).toEqual([change, false]);
    }
  });

  it("keeps its copied definitions equal to their sources", () => {
    const read = (file: string): unknown =>
      JSON.parse(
        readFileSync(new URL("../schemas/" + file, import.meta.url), "utf8"),
      );
    interface Def {
      pattern?: string;
      not?: { pattern: string };
      enum?: string[];
      items?: { enum: string[] };
      minimum?: number;
      maximum?: number;
    }
    const objects = read("objects.schema.json") as {
      $defs: Record<string, Def>;
    };
    const intake = read("intake-event.schema.json") as {
      $defs: Record<string, Def>;
    };
    const floor = read("floor-event.schema.json") as {
      $defs: Record<string, Def>;
    };
    const envelope = read("event.schema.json") as {
      properties: { at: Def; seq: Def };
      $defs: { id: Def };
    };
    const rot = read("rot-register.schema.json") as {
      $defs: {
        reviewTrigger: Def;
        entry: { properties: { assumption: Def } };
      };
    };
    const own = objects.$defs;
    expect(own["taskClass"]?.enum).toEqual(intake.$defs["class"]?.enum);
    expect([own["scopeEntry"]?.pattern, own["scopeEntry"]?.not]).toEqual([
      intake.$defs["scopeEntry"]?.pattern,
      intake.$defs["scopeEntry"]?.not,
    ]);
    expect(own["sha256"]?.pattern).toEqual(intake.$defs["sha256"]?.pattern);
    expect(own["oid"]?.pattern).toEqual(floor.$defs["oid"]?.pattern);
    expect(own["displayText"]?.pattern).toEqual(floor.$defs["text"]?.pattern);
    expect(own["at"]?.pattern).toEqual(envelope.properties.at.pattern);
    expect(own["envelopeId"]?.pattern).toEqual(envelope.$defs.id.pattern);
    expect([own["seq"]?.minimum, own["seq"]?.maximum]).toEqual([
      envelope.properties.seq.minimum,
      envelope.properties.seq.maximum,
    ]);
    expect(own["reviewTrigger"]?.items?.enum).toEqual(
      rot.$defs.reviewTrigger.enum,
    );
    expect(own["assumption"]?.pattern).toEqual(
      rot.$defs.entry.properties.assumption.pattern,
    );
    expectTypeOf<TaskClass>().toEqualTypeOf<IntakeClass>();
    expectTypeOf<
      RuleRecord["reviewTrigger"][number]
    >().toEqualTypeOf<RotReviewTrigger>();
  });

  it("narrows unknown input to ObjectRecord and names a missing property", () => {
    const input: unknown = JSON.parse(JSON.stringify(rule));
    if (validate(input)) {
      expectTypeOf(input).toEqualTypeOf<ObjectRecord>();
    } else {
      expect.unreachable();
    }
    expect(validate(without(task, "text"))).toBe(false);
    const missing = (validate.errors ?? [])
      .filter((error) => error.keyword === "required")
      .map((error) => error.params);
    expect(missing).toContainEqual({ missingProperty: "text" });
  });
});
