import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  validateIntakeEvent as validate,
  type HelmwrightConfig,
  type IntakeClassified,
  type IntakeEvent,
  type IntakeFriction,
  type IntakeOverridden,
  type IntakeReclassified,
} from "../src/index.ts";

const declared = {
  newDependencies: [],
  newModules: [],
  surfaceChanges: [],
  newProcessBoundary: false,
};
const classified: IntakeClassified = {
  kind: "intake.classified",
  taskId: "task_01",
  class: "bounded",
  rubricVersion: "intake-rubric-1",
  reasons: [{ rule: "notDocsOrTests", entries: ["src/a.ts"] }],
  scope: ["src/a.ts"],
  scopeSha256: "a".repeat(64),
  ring0Sha256: "b".repeat(64),
  declared,
  friction: { intensity: "moderate", source: "default" },
  sparring: "optIn",
  costIfWrong: "one review",
};
const overridden: IntakeOverridden = {
  kind: "intake.overridden",
  taskId: "task_01",
  from: "bounded",
  to: "chore",
  reason: "formatting only",
  by: "cli",
  attestation: { kind: "none" },
  scopeSha256: "a".repeat(64),
  rubricVersion: "intake-rubric-1",
  friction: { intensity: "minimal", source: "choreDowngrade" },
};
const reclassified: IntakeReclassified = {
  kind: "intake.reclassified",
  taskId: "task_01",
  from: "chore",
  to: "bounded",
  source: "floor",
  signalIds: ["sig.dep-added:1"],
  rubricVersion: "intake-rubric-1",
};
const events: IntakeEvent[] = [classified, overridden, reclassified];
/** Characters an entry may not have (S5), built so that the source holds none of them. */
const hidden = [0x202e, 0x200b, 0x2028, 0x2029, 0xd800, 0x85, 0x7f, 0x1b];
const hiddenEntries = hidden.map((c) => `src/a${String.fromCodePoint(c)}.ts`);
const without = (event: object, key: string) =>
  Object.fromEntries(Object.entries(event).filter(([k]) => k !== key));
const minimal = { intensity: "minimal", source: "choreDowngrade" };
const facts = {
  newDependencies: ["left-pad"],
  newModules: ["packages/x"],
  surfaceChanges: ["schema", "publicApi", "storage", "wire"],
  newProcessBoundary: true,
};

describe("IntakeEvent", () => {
  it.each(events)("accepts a well-formed $kind", (event) => {
    expect(validate(event)).toBe(true);
  });

  it("accepts a classification without costIfWrong", () => {
    expect(validate(without(classified, "costIfWrong"))).toBe(true);
  });

  it.each(
    events.flatMap((event) =>
      Object.keys(event)
        .filter((key) => key !== "costIfWrong")
        .map((key) => [event.kind, key, event] as const),
    ),
  )("rejects %s without %s", (_kind, key, event) => {
    expect(validate(without(event, key))).toBe(false);
  });

  it.each(events)("rejects an extra field on $kind", (event) => {
    expect(validate({ ...event, extra: true })).toBe(false);
  });

  it.each([
    [classified, "intake.overridden"],
    [overridden, "intake.reclassified"],
    [reclassified, "intake.classified"],
    [classified, "intake.ruled"],
  ])("rejects %j with kind %j", (event, kind) => {
    expect(validate({ ...event, kind })).toBe(false);
  });

  it.each([null, [], "intake.classified", 1])("rejects %j", (value) => {
    expect(validate(value)).toBe(false);
  });

  it.each<[object, object[], object[]]>([
    [
      classified,
      [
        { class: "chore", friction: minimal },
        { scope: [], reasons: [{ rule: "noDeclaredScope", entries: [] }] },
        { scope: ["docs/**", "**/*.md"], rubricVersion: "intake-rubric-12" },
        { scope: ["a/.b", "a/..b/c", "...", "café/ü.md", "a b/c.md"] },
        { scope: Array.from({ length: 256 }, (_, i) => `src/${String(i)}.ts`) },
        { declared: facts, costIfWrong: "" },
      ],
      [
        { class: "trivial" },
        { taskId: "-x" },
        { taskId: "a b" },
        { rubricVersion: "intake-rubric-0" },
        { rubricVersion: "rubric-1" },
        { reasons: [] },
        { reasons: [{ rule: "guess", entries: [] }] },
        { reasons: [{ rule: "docsOnly" }] },
        { scope: [""] },
        ...hiddenEntries.map((e) => ({ scope: [e] })),
        ...hiddenEntries.map((e) => ({
          declared: { ...declared, newModules: [e] },
        })),
        ...hiddenEntries.map((e) => ({
          declared: { ...declared, newDependencies: [e] },
        })),
        ...[
          "/src/a.ts",
          "src\\a.ts",
          "..",
          "src/../a.ts",
          "./a.ts",
          "src/.",
          "a//b",
          "src/",
        ].map((e) => ({ scope: [e] })),
        { scope: Array.from({ length: 257 }, (_, i) => `src/${String(i)}.ts`) },
        { ring0Sha256: "A".repeat(64) },
        { scope: ["a\nb"] },
        { scope: ["x".repeat(1025)] },
        { scope: "src/**" },
        { scopeSha256: "A".repeat(64) },
        { scopeSha256: "a".repeat(63) },
        { sparring: "on" },
        { friction: { intensity: "extreme", source: "default" } },
        { friction: { intensity: "minimal", source: "owner" } },
        { friction: { intensity: "minimal" } },
        { declared: { ...declared, surfaceChanges: ["ui"] } },
        { declared: { ...declared, newProcessBoundary: "no" } },
        { declared: { ...declared, extra: [] } },
        { declared: without(declared, "newModules") },
        { costIfWrong: "x".repeat(8193) },
      ],
    ],
    [
      overridden,
      [
        { from: "chore", to: "architectural" },
        { from: "bounded", to: "bounded" },
        { reason: " a " },
        // B10-3 S2: the effective friction of `to`.
        { to: "bounded", friction: { intensity: "high", source: "default" } },
      ],
      [
        { friction: { intensity: "minimal" } },
        { friction: { intensity: "none", source: "default" } },
        { friction: { intensity: "minimal", source: "override" } },
        { friction: { ...minimal, extra: true } },
        { friction: "minimal" },
        { reason: "" },
        { reason: "   " },
        { reason: "x".repeat(8193) },
        { by: "tty" },
        { to: "trivial" },
        { attestation: { kind: "presence" } },
        { attestation: { kind: "none", signature: "x" } },
        { attestation: "none" },
      ],
    ],
    [
      reclassified,
      [{ source: "plan", to: "architectural", signalIds: ["a", "b.c"] }],
      [
        { source: "owner" },
        { signalIds: [] },
        { signalIds: [""] },
        { signalIds: ["a b"] },
        { taskId: "a b" },
        { rubricVersion: "v1" },
      ],
    ],
  ])("checks the changes to %j", (event, good, bad) => {
    for (const change of good) {
      expect([change, validate({ ...event, ...change })]).toEqual([
        change,
        true,
      ]);
    }
    for (const change of bad) {
      expect([change, validate({ ...event, ...change })]).toEqual([
        change,
        false,
      ]);
    }
  });

  it("keeps its friction intensities equal to the config's", () => {
    const read = (file: string): unknown =>
      JSON.parse(
        readFileSync(new URL(`../schemas/${file}`, import.meta.url), "utf8"),
      );
    const config = read("helmwright-config.schema.json") as {
      properties: {
        friction: { properties: { defaultIntensity: { enum: string[] } } };
      };
    };
    const intake = read("intake-event.schema.json") as {
      $defs: { friction: { properties: { intensity: { enum: string[] } } } };
    };
    expect(intake.$defs.friction.properties.intensity.enum).toEqual(
      config.properties.friction.properties.defaultIntensity.enum,
    );
    type Intensity = NonNullable<
      HelmwrightConfig["friction"]
    >["defaultIntensity"];
    expectTypeOf<IntakeFriction["intensity"]>().toEqualTypeOf<
      NonNullable<Intensity>
    >();
  });

  it("narrows unknown input to IntakeEvent", () => {
    const input: unknown = JSON.parse(JSON.stringify(overridden));
    if (validate(input)) {
      expectTypeOf(input).toEqualTypeOf<IntakeEvent>();
    } else {
      expect.unreachable();
    }
  });
});
