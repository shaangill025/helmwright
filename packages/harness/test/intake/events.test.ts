import { randomUUID } from "node:crypto";
import type { IntakeClass, IntakeClassified } from "@helmwright/schema";
import { describe, expect, it } from "vitest";
import {
  INTAKE_COST_IF_WRONG,
  IntakeError,
  intakeReclassified,
  intakeReclassifiedRuling,
  intakeRuling,
  intakeRulingId,
} from "../../src/index.ts";

// B5-5: the intake Ruling, derived from intake.classified alone (OQ-B55-1).
const classified: IntakeClassified = {
  kind: "intake.classified",
  taskId: "task-1",
  class: "bounded",
  rubricVersion: "intake-rubric-1",
  reasons: [{ rule: "notDocsOrTests", entries: ["src/a.ts", "src/b.ts"] }],
  scope: ["src/a.ts", "src/b.ts"],
  scopeSha256: "a".repeat(64),
  ring0Sha256: "b".repeat(64),
  declared: {
    newDependencies: [],
    newModules: [],
    surfaceChanges: [],
    newProcessBoundary: false,
  },
  friction: { intensity: "moderate", source: "default" },
  sparring: "optIn",
};
/** The lines the owner approved for intake-rubric-1 (docs/decisions.md, B5-5 owner answers). */
const APPROVED: Record<IntakeClass, string> = {
  chore:
    "If the task is not a chore, it runs at minimal friction and a change that needs review or a brief gets none.",
  bounded:
    "If the task is architectural, owned decisions get no early brief; if it is a chore, the run has more friction than it needs.",
  architectural:
    "If the task is smaller, the run has more friction and owner attention than it needs.",
};
const uuid = "0f8fad5b-d9cb-469f-a165-70867728950e";
const RUN = "run-" + uuid;
const whyOf = (reasons: IntakeClassified["reasons"]) => {
  const ruling = intakeRuling(RUN, "evt-1", { ...classified, reasons });
  return ruling.authority === "harness" ? ruling.ruling.why : "";
};
const size = (text: string) => Array.from(text).length;
const marker = (k: number) =>
  "\n…[+" + String(k) + " more entries; see intake.classified]";

describe("intakeRuling (B5-5)", () => {
  it.each<[IntakeClass, IntakeClassified["reasons"], string]>([
    [
      "chore",
      [{ rule: "docsOnly", entries: ["docs/a.md"] }],
      "docsOnly\n  docs/a.md",
    ],
    [
      "bounded",
      [
        { rule: "ring0Path", entries: [".github/x.md"] },
        { rule: "notDocsOrTests", entries: ["src/a.ts", "src/b.ts"] },
      ],
      "ring0Path\n  .github/x.md\nnotDocsOrTests\n  src/a.ts\n  src/b.ts",
    ],
    [
      "architectural",
      [
        { rule: "noDeclaredScope", entries: [] },
        { rule: "newProcessBoundary", entries: [] },
      ],
      "noDeclaredScope\nnewProcessBoundary",
    ],
  ])("maps a %s classification to its Ruling", (cls, reasons, why) => {
    const event = { ...classified, class: cls, reasons };
    expect(intakeRuling(RUN, "evt-7", event)).toEqual({
      kind: "decision.opened",
      id: "decision-intake-" + uuid,
      authority: "harness",
      taskId: "task-1",
      runId: RUN,
      signalIds: ["evt-7"],
      class: null,
      source: "intake",
      ruling: {
        what: "Classified the task as " + cls,
        // Each rule on its line, then each entry as logged on its own indented line.
        why,
        costIfWrong: APPROVED[cls],
        rubricVersion: "intake-rubric-1",
      },
    });
  });

  it("keeps the approved cost-if-wrong lines, keyed by rubric version", () => {
    expect([...INTAKE_COST_IF_WRONG.keys()]).toEqual(["intake-rubric-1"]);
    expect(INTAKE_COST_IF_WRONG.get("intake-rubric-1")).toEqual(APPROVED);
    for (const lines of INTAKE_COST_IF_WRONG.values()) {
      for (const line of Object.values(lines)) {
        // A valid `line`: one printable ASCII line of at most 200 code points.
        expect(line).toMatch(/^[ -~]{1,200}$/);
      }
    }
  });

  it("does not escape the logged entries again", () => {
    const entries = ["src/a\\u{1b}.ts"];
    expect(whyOf([{ rule: "notDocsOrTests", entries }])).toBe(
      "notDocsOrTests\n  src/a\\u{1b}.ts",
    );
  });

  it("cuts the why at whole entries, with a marker, to 8192 code points", () => {
    const entries = Array.from(
      { length: 256 },
      (_, i) => String(i).padStart(3, "0") + "x".repeat(1021),
    );
    const why = whyOf([{ rule: "notDocsOrTests", entries }]);
    expect(size(why)).toBeLessThanOrEqual(8192);
    const lines = why.split("\n");
    const kept = lines.slice(1, -1);
    expect(lines[0]).toBe("notDocsOrTests");
    expect(kept).toEqual(entries.slice(0, kept.length).map((e) => "  " + e));
    expect(kept).toHaveLength(7);
    expect(why.endsWith(marker(256 - 7))).toBe(true);
  });

  it("keeps a why of exactly 8192 code points whole", () => {
    const fits = "d".repeat(8192 - size("docsOnly\n  "));
    expect(whyOf([{ rule: "docsOnly", entries: [fits] }])).toBe(
      "docsOnly\n  " + fits,
    );
    expect(whyOf([{ rule: "docsOnly", entries: [fits + "d"] }])).toBe(
      "docsOnly" + marker(1),
    );
  });

  it("can cut the why to rule names only", () => {
    const why = whyOf([
      { rule: "notDocsOrTests", entries: ["y".repeat(8190)] },
      { rule: "ring0Path", entries: ["z".repeat(10)] },
    ]);
    // The first entry that does not fit ends the list, so the later short one goes too.
    expect(why).toBe("notDocsOrTests\nring0Path" + marker(2));
  });

  it("derives a 52-character ID from a live run ID", () => {
    const runId = "run-" + randomUUID();
    expect(intakeRulingId(runId)).toBe("decision-intake-" + runId.slice(4));
    expect(intakeRulingId(runId)).toHaveLength(52);
    expect(intakeRuling(runId, "evt-1", classified).id).toHaveLength(52);
  });

  it.each([
    ["run-" + "x".repeat(120), "decision.opened cannot be logged"],
    ["graph-1", "decision.opened cannot be logged: not a run ID"],
    ["run-", "decision.opened cannot be logged: not a run ID"],
    ["run-a.b", "decision.opened cannot be logged"],
  ])("refuses the run ID %s", (runId, message) => {
    expect(() => intakeRuling(runId, "evt-1", classified)).toThrow(
      new IntakeError(message),
    );
  });

  it("refuses a rubric version without cost-if-wrong lines or a bad signal", () => {
    const later = { ...classified, rubricVersion: "intake-rubric-2" };
    expect(() => intakeRuling(RUN, "evt-1", later)).toThrow(
      new IntakeError("decision.opened cannot be logged: no cost if wrong"),
    );
    expect(() => intakeRuling(RUN, "evt 1", classified)).toThrow(
      new IntakeError("decision.opened cannot be logged"),
    );
  });
});

// A-dep-3 (OQ-AD-7): a final floor signal on a chore reclassifies it to architectural.
const signalId = (i: number) => uuid + ":" + String(i);
const up = (n: number) =>
  intakeReclassified(
    "task-1",
    "chore",
    Array.from({ length: n }, (_, i) => signalId(i)),
    "intake-rubric-1",
  );

describe("intakeReclassified and its Ruling (A-dep-3)", () => {
  it("logs every signal ID in order, raised to architectural", () => {
    expect(up(2)).toEqual({
      kind: "intake.reclassified",
      taskId: "task-1",
      from: "chore",
      to: "architectural",
      source: "floor",
      signalIds: [signalId(0), signalId(1)],
      rubricVersion: "intake-rubric-1",
    });
  });

  it("maps it to the r1 Ruling as the owner approved it (OQ-AD3-4, OQ-AD3-5)", () => {
    expect(intakeReclassifiedRuling(RUN, "evt-9", up(2))).toEqual({
      kind: "decision.opened",
      id: "decision-intake-" + uuid + "-r1",
      authority: "harness",
      taskId: "task-1",
      runId: RUN,
      signalIds: ["evt-9"],
      class: null,
      source: "intake",
      ruling: {
        what: "Reclassified the task from chore to architectural",
        why: "floorSignal\n  " + signalId(0) + "\n  " + signalId(1),
        costIfWrong: APPROVED.architectural,
        rubricVersion: "intake-rubric-1",
      },
    });
  });

  it("cuts 256 signal IDs at whole entries, with its own marker", () => {
    const ruling = intakeReclassifiedRuling(RUN, "evt-9", up(256));
    const why = ruling.authority === "harness" ? ruling.ruling.why : "";
    expect(size(why)).toBeLessThanOrEqual(8192);
    const lines = why.split("\n");
    const kept = lines.slice(1, -1);
    expect(lines[0]).toBe("floorSignal");
    expect(kept).toEqual(kept.map((_, i) => "  " + signalId(i)));
    // 8192 - "floorSignal" - the longest marker leaves 8135: 10 lines of 41, 90 of 42, 91 of 43.
    expect(kept).toHaveLength(191);
    expect(lines.at(-1)).toBe(
      "…[+" + String(256 - 191) + " more entries; see intake.reclassified]",
    );
  });

  it("refuses a class it cannot raise, no signal, a bad run ID or another source", () => {
    const refused = (fn: () => unknown, message: string) => {
      expect(fn).toThrow(new IntakeError(message));
    };
    refused(
      () =>
        intakeReclassified("task-1", "architectural", ["s"], "intake-rubric-1"),
      'the harness may only reclassify up, not "architectural" to "architectural"',
    );
    refused(
      () => intakeReclassified("task-1", "chore", [], "intake-rubric-1"),
      "intake.reclassified cannot be logged",
    );
    refused(
      () => intakeReclassifiedRuling("graph-1", "evt-9", up(1)),
      "decision.opened cannot be logged: not a run ID",
    );
    refused(
      () =>
        intakeReclassifiedRuling(RUN, "evt-9", { ...up(1), source: "plan" }),
      "decision.opened cannot be logged: not the floor's",
    );
  });
});
