import type { Event, IntakeClassified } from "@helmwright/schema";
import { describe, expect, it } from "vitest";
import {
  intakeRuling,
  objectFaults,
  runRecorded,
  taskCreated,
} from "../../src/index.ts";

// B5-4b: replay's object relations of one run, over plain events (no log needed).
const BASE = "a".repeat(40);
const task = taskCreated({
  id: "task-1",
  repoId: "/r/.git",
  text: "e2e task",
  scope: [],
});
const run = runRecorded({
  taskId: "task-1",
  engine: "scripted",
  baseCommit: BASE,
  class: "bounded",
});
const started = {
  taskId: "task-1",
  title: "e2e task",
  engine: "scripted",
  baseCommit: BASE,
};

function event(seq: number, type: string, payload: object, runId = "run-1") {
  return {
    ...{ schemaVersion: 1, eventId: "evt-" + String(seq), seq },
    ...{ graphId: "graph-1", runId, nodeId: "node-1", type },
    at: "2026-10-09T00:00:00.000Z",
    payload: { ...payload },
  } as Event;
}

/** A run as B5-4a logs it, from `seq`: its Task (if `withTask`), Run, start and intake. */
function logged(seq: number, runId = "run-1", withTask = true): Event[] {
  const at = (i: number, type: string, payload: object) =>
    event(seq + i, type, payload, runId);
  const offset = withTask ? 1 : 0;
  return [
    ...(withTask ? [at(0, "task.created", task)] : []),
    at(offset, "run.recorded", run),
    at(offset + 1, "run.started", started),
    at(offset + 2, "intake.classified", { class: "bounded" }),
    at(offset + 3, "run.terminated", {}),
  ];
}
const isRecord = (e: Event) =>
  e.type === "task.created" || e.type === "run.recorded";
const objects = (events: readonly Event[]) => events.filter(isRecord);
/** The run without its records: a legacy run (before B5-4a). */
const legacy = (events: readonly Event[]) => events.filter((e) => !isRecord(e));
const faults = (events: readonly Event[], log: readonly Event[] = events) =>
  objectFaults(events, objects(log));
const swap = (events: Event[], type: string, payload: object) =>
  events.map((e) => (e.type === type ? event(e.seq, type, payload) : e));

describe("objectFaults (B5-4b)", () => {
  it("passes a recorded run and a re-run of its Task", () => {
    const first = logged(0);
    const second = logged(5, "run-2", false);
    expect(faults(first)).toEqual([]);
    expect(faults(second, [...first, ...second])).toEqual([]);
  });

  it("faults each relation of the Run and its Task", () => {
    const events = swap(logged(0), "run.started", {
      ...{ taskId: "task-2", title: "other", engine: "native" },
      baseCommit: "b".repeat(40),
    });
    expect(
      faults(swap(events, "intake.classified", { class: "chore" })),
    ).toEqual([
      "seq 1: run.recorded taskId is not run.started's",
      "seq 1: run.recorded baseCommit is not run.started's",
      "seq 1: run.recorded engine is not run.started's",
      "seq 1: run.recorded class is not intake.classified's",
      "seq 2: Task text is not run.started's title",
    ]);
  });

  it("compares the class only when intake.classified exists (PR #66)", () => {
    const events = logged(0).filter((e) => e.type !== "intake.classified");
    expect(
      faults(swap(events, "run.recorded", { ...run, class: "chore" })),
    ).toEqual([]);
  });

  it("faults a Run after run.started, a second Run and a Run with no start", () => {
    const late = [
      event(0, "task.created", task),
      event(1, "run.started", started),
      event(2, "run.recorded", run),
      event(3, "run.recorded", run),
    ];
    expect(faults(late)).toEqual([
      "seq 3: more than one run.recorded in one run",
      "seq 2: run.recorded after run.started",
      "seq 3: run.recorded after run.started",
    ]);
    expect(faults(logged(0).slice(0, 2))).toEqual([
      "seq 1: run.recorded without run.started",
    ]);
  });

  it("treats a run without run.recorded as legacy only before the first one (OD-B54-3 i)", () => {
    const old = legacy(logged(0));
    expect(faults(old)).toEqual([]);
    // A legacy run stays legacy once a later run is recorded.
    expect(faults(old, [...old, ...logged(10, "run-2")])).toEqual([]);
    // After a recorded run, a run without its Run (dropped or forged) is a fault.
    const after = legacy(logged(10, "run-3"));
    expect(faults(after, [...logged(0), ...after])).toEqual([
      "seq 12: run.started without run.recorded",
    ]);
  });

  it("faults a second end or start, also of a legacy run with no Run row", () => {
    const old = legacy(logged(0));
    const again = [
      ...old,
      event(7, "run.terminated", {}),
      event(8, "run.started", started),
    ];
    expect(faults(again)).toEqual([
      "seq 8: more than one run.started in one run",
      "seq 7: more than one run.terminated in one run",
    ]);
    expect(faults([...logged(0), event(9, "run.terminated", {})])).toEqual([
      "seq 9: more than one run.terminated in one run",
    ]);
  });
});

// B5-5 (OQ-B55-1): replay recomputes each intake Ruling from its intake.classified.
const classified: IntakeClassified = {
  kind: "intake.classified",
  taskId: "task-1",
  class: "bounded",
  rubricVersion: "intake-rubric-1",
  reasons: [{ rule: "notDocsOrTests", entries: ["src/a.ts"] }],
  scope: ["src/a.ts"],
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
const override = (decisionId?: string) => ({
  kind: "intake.overridden",
  ...(decisionId === undefined ? {} : { decisionId }),
});

/**
 * A run as B5-5 logs it, from `seq`: Task, Run, start, intake.classified, its Ruling
 * (unless `ruled` is false), an override linked to it, and the end.
 */
function ruled(seq: number, runId = "run-1", ruling = true): Event[] {
  const at = (i: number, type: string, payload: object) =>
    event(seq + i, type, payload, runId);
  const id = "decision-intake-" + runId.slice(4);
  const opened = intakeRuling(runId, "evt-" + String(seq + 3), classified);
  return [
    at(0, "task.created", task),
    at(1, "run.recorded", run),
    at(2, "run.started", started),
    at(3, "intake.classified", classified),
    ...(ruling ? [at(4, "decision.opened", opened)] : []),
    at(5, "intake.overridden", override(id)),
    at(6, "run.terminated", {}),
  ];
}
const isObject = (e: Event) => isRecord(e) || e.type === "decision.opened";
const intake = (events: readonly Event[], log: readonly Event[] = events) =>
  objectFaults(
    events.filter((e) => e.runId === events[0]?.runId),
    log.filter(isObject),
  );
/** `events` with the event at `seq` changed by `change`, or dropped if it gives undefined. */
const edit = (
  events: readonly Event[],
  seq: number,
  change: (e: Event) => Event | undefined,
) =>
  events.flatMap((e) => {
    if (e.seq !== seq) return [e];
    const changed = change(e);
    return changed === undefined ? [] : [changed];
  });
const withPayload = (e: Event, payload: object) => ({
  ...e,
  payload: { ...payload },
});
const RULING_IS_NOT = "seq 4: intake Ruling is not intake.classified's";
const NOT_LINKED =
  "seq 5: intake.overridden is not linked to the run's intake Ruling";

describe("objectFaults: the intake Ruling (B5-5)", () => {
  it("passes a run and a later run with their Rulings and linked overrides", () => {
    const later = ruled(7, "run-2");
    expect(intake(ruled(0))).toEqual([]);
    expect(intake(later, [...ruled(0), ...later])).toEqual([]);
  });

  it.each<[string, (ruling: Record<string, unknown>) => object]>([
    [
      "why",
      (r) => ({ ...r, ruling: { ...(r["ruling"] as object), why: "x" } }),
    ],
    [
      "costIfWrong",
      (r) => ({
        ...r,
        ruling: { ...(r["ruling"] as object), costIfWrong: "x" },
      }),
    ],
    ["signalIds", (r) => ({ ...r, signalIds: ["evt-9"] })],
    ["class", (r) => ({ ...r, class: "scope" })],
    ["keys", (r) => ({ ...r, extra: true })],
  ])("faults a Ruling whose %s is not the recomputed one", (_key, change) => {
    const events = edit(ruled(0), 4, (e) => withPayload(e, change(e.payload)));
    expect(intake(events)).toEqual([RULING_IS_NOT]);
  });

  it("faults a Ruling with another ID, and the override linked to the right one", () => {
    const other = (e: Event) =>
      withPayload(e, { ...e.payload, id: "decision-intake-2" });
    expect(intake(edit(ruled(0), 4, other))).toEqual([
      RULING_IS_NOT,
      NOT_LINKED,
    ]);
  });

  it("faults a Ruling of an intake.classified that cannot be recomputed", () => {
    const events = edit(ruled(0), 3, (e) =>
      withPayload(e, { ...classified, taskId: "task_1" }),
    );
    expect(intake(events)).toEqual([RULING_IS_NOT]);
  });

  it("faults intake.classified without its Ruling once a Ruling was logged", () => {
    const later = ruled(7, "run-2", false);
    expect(intake(later, [...ruled(0), ...later])).toEqual([
      "seq 10: intake.classified without its intake Ruling",
      "seq 12: intake.overridden is not linked to the run's intake Ruling",
    ]);
  });

  it("faults a Ruling not right after intake.classified, or without one", () => {
    const moved = edit(ruled(0), 4, (e) => ({ ...e, seq: 6 })).map((e) =>
      e.type === "run.terminated" ? { ...e, seq: 7 } : e,
    );
    expect(intake(moved)).toEqual([
      "seq 6: intake Ruling without intake.classified",
      "seq 3: intake.classified without its intake Ruling",
      NOT_LINKED,
    ]);
    const alone = edit(ruled(0), 3, () => undefined);
    expect(intake(alone)).toEqual([
      "seq 4: intake Ruling without intake.classified",
      NOT_LINKED,
    ]);
  });

  it("faults a second Ruling of the run, also one logged in another run", () => {
    const first = ruled(0);
    const opened = first.find((e) => e.type === "decision.opened");
    const second = withPayload(event(7, "decision.opened", {}, "run-9"), {
      ...opened?.payload,
      id: "decision-intake-9",
    });
    expect(intake(first, [...first, second])).toEqual([
      "seq 7: more than one intake Ruling in one run",
    ]);
  });

  it("faults a Ruling at the next seq that another run logged for this run", () => {
    const elsewhere = edit(ruled(0), 4, (e) => ({ ...e, runId: "run-9" }));
    expect(
      intake(
        elsewhere.filter((e) => e.runId === "run-1"),
        elsewhere,
      ),
    ).toEqual([
      "seq 3: intake.classified without its intake Ruling",
      NOT_LINKED,
    ]);
  });

  it.each([
    ["another", override("decision-intake-2")],
    ["no", override()],
  ])("faults an override with %s decisionId", (_name, payload) => {
    const events = edit(ruled(0), 5, (e) => withPayload(e, payload));
    expect(intake(events)).toEqual([NOT_LINKED]);
  });

  it("faults an override before the Ruling", () => {
    const early = [
      ...ruled(0).slice(0, 3),
      event(3, "intake.overridden", override("decision-intake-1")),
      event(4, "intake.classified", classified),
      event(5, "decision.opened", intakeRuling("run-1", "evt-4", classified)),
      event(6, "run.terminated", {}),
    ];
    expect(intake(early)).toEqual([
      "seq 3: intake.overridden is not linked to the run's intake Ruling",
    ]);
  });

  it("treats a run without a Ruling as legacy only before the first one", () => {
    // As a B5-4 build logged it: no Ruling, and its override has no decisionId.
    const old = edit(ruled(0, "run-1", false), 5, (e) =>
      withPayload(e, override()),
    );
    expect(intake(old)).toEqual([]);
    expect(intake(old, [...old, ...ruled(7, "run-2")])).toEqual([]);
    // The B5-4b tests' runs (intake.classified, no Ruling) stay legacy too.
    expect(intake(logged(0))).toEqual([]);
  });
});
