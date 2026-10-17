import type {
  Event,
  FloorSignal,
  FloorSignalled,
  IntakeClass,
  IntakeClassified,
} from "@helmwright/schema";
import { describe, expect, it } from "vitest";
import {
  floorChecked,
  intakeRuling,
  objectFaults,
  runRecorded,
  taskCreated,
} from "../../src/index.ts";
import { floorDecision } from "../../src/floor/materiality.ts";

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

// A-dep: replay recomputes each floor decision from its floor.signalled signal.
const TREE = "c".repeat(40);
const SEED = "0123456789abcdef0123456789abcdef";
const runtimeAdd: FloorSignal = {
  id: "evt-3:0",
  type: "dependency.added",
  path: "app/package.json",
  field: "dependencies",
  name: "left-pad",
  runtime: true,
  from: null,
  to: "^1.3.0",
};
const devAdd: FloorSignal = {
  ...runtimeAdd,
  id: "evt-3:1",
  field: "devDependencies",
  name: "vitest",
  runtime: false,
};
const LOCKFILES = ["app/pnpm-lock.yaml"];
const signalled = (
  signals: readonly FloorSignal[],
  lockfiles: readonly string[] | null = LOCKFILES,
  rubric = "materiality-rubric-1",
): FloorSignalled => ({
  ...{ kind: "floor.signalled", detector: "dependency-1", phase: "final" },
  ...{ baseCommit: BASE, candidateTree: TREE },
  materiality: {
    rubricVersion: rubric,
    threshold: "runtimeAddOrMajor",
  },
  signals: [...signals],
  ...(lockfiles === null ? {} : { lockfiles: [...lockfiles] }),
});
const opened = (
  signal: FloorSignal,
  index: number,
  runId = "run-1",
  lockfiles: readonly string[] = LOCKFILES,
  rubric = "materiality-rubric-1",
) =>
  floorDecision({
    ...{ runId, taskId: "task-1", repoId: "/r/.git", index, signal },
    ...{ threshold: "runtimeAddOrMajor", lockfiles },
    rubricVersion: rubric,
    ...{ seed: SEED, key: new Uint8Array(32).fill(7) },
  });

/** A run as A-dep logs it: Task, Run, start, floor.signalled (seq 3), its decisions, floor.checked, end. */
function signalledRun(
  signals: readonly FloorSignal[] = [runtimeAdd, devAdd],
  rubric = "materiality-rubric-1",
): Event[] {
  const n = signals.length;
  return [
    event(0, "task.created", task),
    event(1, "run.recorded", run),
    event(2, "run.started", started),
    event(3, "floor.signalled", signalled(signals, LOCKFILES, rubric)),
    ...signals.map((s, i) =>
      event(4 + i, "decision.opened", opened(s, i, "run-1", LOCKFILES, rubric)),
    ),
    event(4 + n, "floor.checked", floorChecked(BASE, TREE, [])),
    event(5 + n, "run.terminated", {}),
  ];
}
const FLOOR_OBJECTS = ["task.created", "run.recorded", "decision.opened"];
const floor = (events: readonly Event[], log: readonly Event[] = events) =>
  objectFaults(
    events.filter((e) => e.runId === "run-1"),
    log.filter((e) => [...FLOOR_OBJECTS, "floor.signalled"].includes(e.type)),
  );
const briefOf = (e: Event) => e.payload["brief"] as Record<string, unknown>;
const footprintOf = (e: Event) => briefOf(e)["proposedFootprint"] as string[];
const withBrief = (e: Event, brief: object) =>
  withPayload(e, { ...e.payload, brief: { ...briefOf(e), ...brief } });
const NOT_ITS = "seq 4: floor decision is not its signal's";

describe("objectFaults: floor decisions (A-dep)", () => {
  it("passes a Brief and a Ruling, and a run with no signal", () => {
    expect(floor(signalledRun())).toEqual([]);
    expect(floor(signalledRun([]))).toEqual([]);
  });

  it("checks a Brief's seed and commitment for format only", () => {
    const seeded = edit(signalledRun(), 4, (e) =>
      withBrief(e, {
        optionOrderSeed: "f".repeat(32),
        recommendationSha256: "e".repeat(64),
      }),
    );
    expect(floor(seeded)).toEqual([]);
  });

  it("pins a Brief's lockfile footprints to floor.signalled's lockfiles", () => {
    const extra = "artifact-" + "d".repeat(64);
    const added = edit(signalledRun(), 4, (e) =>
      withBrief(e, { proposedFootprint: [...footprintOf(e), extra] }),
    );
    expect(floor(added)).toEqual([NOT_ITS]);
    const dropped = edit(signalledRun(), 4, (e) =>
      withBrief(e, { proposedFootprint: footprintOf(e).slice(0, 2) }),
    );
    expect(floor(dropped)).toEqual([NOT_ITS]);
    const renamed = edit(signalledRun(), 3, (e) =>
      withPayload(e, signalled([runtimeAdd, devAdd], ["pnpm-lock.yaml"])),
    );
    expect(floor(renamed)).toEqual([NOT_ITS]);
  });

  it.each([
    ["unsorted", ["b/pnpm-lock.yaml", "app/pnpm-lock.yaml"]],
    ["repeated", ["app/pnpm-lock.yaml", "app/pnpm-lock.yaml"]],
  ])("faults %s lockfiles", (_key, lockfiles) => {
    const events = edit(signalledRun([]), 3, (e) =>
      withPayload(e, signalled([], lockfiles)),
    );
    expect(floor(events)).toEqual([
      "seq 3: floor.signalled lockfiles are not sorted without repeats",
    ]);
  });

  it("faults lockfiles that are not the lockfile.only signals' paths", () => {
    const lockOnly: FloorSignal = {
      ...{ id: "evt-3:0", type: "lockfile.only", path: "app/pnpm-lock.yaml" },
    };
    expect(floor(signalledRun([lockOnly]))).toEqual([]);
    const NOT_ONLY =
      "seq 3: floor.signalled lockfiles are not its lockfile.only paths";
    const lockfiles = (paths: readonly string[]) =>
      edit(signalledRun([lockOnly]), 3, (e) =>
        withPayload(e, signalled([lockOnly], paths)),
      );
    expect(floor(lockfiles([]))).toEqual([NOT_ONLY]);
    // An added lockfile the detector would have signalled too.
    const added = ["app/pnpm-lock.yaml", "zz/pnpm-lock.yaml"];
    expect(floor(lockfiles(added))).toEqual([NOT_ONLY]);
  });

  it.each([
    ["not a lockfile name", "src/x.ts"],
    ["under node_modules", "node_modules/a/pnpm-lock.yaml"],
  ])("faults a logged lockfile that is %s", (_key, path) => {
    // The Brief is rebuilt from the same lockfiles, so only the name is wrong.
    const events = edit(
      edit(signalledRun(), 3, (e) =>
        withPayload(e, signalled([runtimeAdd, devAdd], [path])),
      ),
      4,
      (e) => withPayload(e, opened(runtimeAdd, 0, "run-1", [path])),
    );
    expect(floor(events)).toEqual([
      "seq 3: floor.signalled lockfiles are not all lockfile paths",
    ]);
  });

  it("checks a legacy Brief's lockfile footprints for format only, before the first lockfiles", () => {
    const legacy = (events: Event[]) =>
      edit(events, 3, (e) =>
        withPayload(e, signalled([runtimeAdd, devAdd], null)),
      );
    const extra = "artifact-" + "d".repeat(64);
    const added = legacy(
      edit(signalledRun(), 4, (e) =>
        withBrief(e, { proposedFootprint: [...footprintOf(e), extra] }),
      ),
    );
    expect(floor(added)).toEqual([]);
    const dropped = legacy(
      edit(signalledRun(), 4, (e) =>
        withBrief(e, { proposedFootprint: footprintOf(e).slice(0, 2) }),
      ),
    );
    expect(floor(dropped)).toEqual([]);
    const badFormat = legacy(
      edit(signalledRun(), 4, (e) =>
        withBrief(e, { proposedFootprint: [...footprintOf(e), "artifact-x"] }),
      ),
    );
    expect(floor(badFormat)).toEqual([NOT_ITS]);
    const earlier = withPayload(
      event(-1, "floor.signalled", {}, "run-0"),
      signalled([]),
    );
    expect(floor(added, [earlier, ...added])).toEqual([
      "seq 3: floor.signalled without lockfiles",
    ]);
  });

  it.each<[string, (e: Event) => Event]>([
    ["question", (e) => withBrief(e, { question: "Add it?" })],
    ["confidence", (e) => withBrief(e, { confidence: "high" })],
    ["seed format", (e) => withBrief(e, { optionOrderSeed: "x" })],
    ["commitment format", (e) => withBrief(e, { recommendationSha256: "x" })],
    [
      "dependency footprint",
      (e) => withBrief(e, { proposedFootprint: footprintOf(e).slice(1) }),
    ],
    [
      "extra footprint format",
      (e) =>
        withBrief(e, { proposedFootprint: [...footprintOf(e), "artifact-x"] }),
    ],
    ["class", (e) => withPayload(e, { ...e.payload, class: "scope" })],
    ["taskId", (e) => withPayload(e, { ...e.payload, taskId: "task-2" })],
    ["ID", (e) => withPayload(e, { ...e.payload, id: "decision-floor-1-9" })],
    [
      "route",
      (e) => withPayload(e, opened({ ...devAdd, id: runtimeAdd.id }, 0)),
    ],
  ])("faults a Brief whose %s is not the recomputed one", (_key, change) => {
    expect(floor(edit(signalledRun(), 4, change))).toEqual([NOT_ITS]);
  });

  it("faults a Ruling that is not the recomputed one", () => {
    const events = edit(signalledRun(), 5, (e) => {
      const ruling = e.payload["ruling"] as object;
      return withPayload(e, { ...e.payload, ruling: { ...ruling, why: "x" } });
    });
    expect(floor(events)).toEqual([
      "seq 5: floor decision is not its signal's",
    ]);
  });

  it("faults a floor.signalled that breaks its relations", () => {
    const change = (payload: object) =>
      edit(signalledRun(), 3, (e) =>
        withPayload(e, { ...signalled([runtimeAdd, devAdd]), ...payload }),
      );
    expect(floor(change({ baseCommit: "b".repeat(40) }))).toEqual([
      "seq 3: floor.signalled base commit is not run.started's",
    ]);
    expect(floor(change({ candidateTree: "b".repeat(40) }))).toEqual([
      "seq 3: floor.signalled candidate tree is not floor.checked's",
    ]);
    const rubric = { rubricVersion: "materiality-rubric-9" };
    const materiality = { threshold: "runtimeAddOrMajor", ...rubric };
    expect(floor(change({ materiality }))).toEqual([
      "seq 3: floor.signalled rubric version is not known",
    ]);
    expect(floor(change({ detector: "dependency-9" }))).toEqual([
      "seq 3: floor.signalled that is not a valid floor event",
    ]);
    const renumbered = [runtimeAdd, { ...devAdd, id: "evt-3:7" }];
    expect(floor(change({ signals: renumbered }))).toEqual([
      "seq 3: floor.signalled signal ID is not <eventId>:<index>",
      "seq 5: floor decision is not its signal's",
    ]);
  });

  it("faults a signal without its decision, and a decision without its signal", () => {
    const dropped = edit(signalledRun(), 5, () => undefined);
    expect(floor(dropped)).toEqual([
      "seq 3: floor.signalled signal 1 without its floor decision",
    ]);
    const stray = event(4, "decision.opened", opened(runtimeAdd, 0));
    const unsignalled = [
      ...signalledRun([]).slice(0, 4),
      stray,
      event(5, "floor.checked", floorChecked(BASE, TREE, [])),
      event(6, "run.terminated", {}),
    ];
    expect(floor(unsignalled)).toEqual([
      "seq 3: floor.signalled and its decisions are not just before floor.checked",
      "seq 4: floor decision without its signal",
    ]);
    // Logged in another run for this one, it is not this run's decision.
    const elsewhere = edit(signalledRun(), 4, (e) => ({
      ...e,
      runId: "run-9",
    }));
    expect(floor(elsewhere)).toEqual([
      "seq 3: floor.signalled signal 0 without its floor decision",
      "seq 4: floor decision without its signal",
    ]);
  });

  it.each([{ graphId: "graph-9" }, { nodeId: "node-9" }])(
    "faults a decision in this run's events outside its envelope (%o)",
    (envelope) => {
      const moved = edit(signalledRun(), 4, (e) => ({ ...e, ...envelope }));
      expect(floor(moved)).toEqual([
        "seq 3: floor.signalled signal 0 without its floor decision",
        "seq 4: floor decision without its signal",
      ]);
    },
  );

  it("faults a second floor.signalled, and one with no floor.checked after it", () => {
    const events = signalledRun([]);
    const again = [
      ...events.slice(0, 4),
      event(4, "floor.signalled", signalled([])),
      ...events.slice(4).map((e) => ({ ...e, seq: e.seq + 1 })),
    ];
    expect(floor(again)).toEqual([
      "seq 4: more than one floor.signalled",
      "seq 3: floor.signalled and its decisions are not just before floor.checked",
    ]);
    const unchecked = events.filter((e) => e.type !== "floor.checked");
    expect(floor(unchecked)).toEqual([
      "seq 3: floor.signalled without floor.checked",
    ]);
  });

  it("treats floor.checked without floor.signalled as legacy only before the first one", () => {
    const old = signalledRun([]).filter((e) => e.type !== "floor.signalled");
    expect(floor(old)).toEqual([]);
    const earlier = withPayload(
      event(-1, "floor.signalled", {}, "run-0"),
      signalled([]),
    );
    expect(floor(old, [earlier, ...old])).toEqual([
      "seq 4: floor.checked without floor.signalled",
    ]);
  });
});

// A-dep-3 (OQ-AD-7): a final floor signal on a chore reclassifies it first.
const chore: IntakeClassified = {
  ...classified,
  class: "chore",
  reasons: [{ rule: "testsOnly", entries: ["test/a.test.ts"] }],
  scope: ["test/a.test.ts"],
  friction: { intensity: "minimal", source: "choreDowngrade" },
};
const ARCHITECTURAL =
  "If the task is smaller, the run has more friction and owner attention than it needs.";

/**
 * A run as A-dep-3 logs it: Task, Run, start, intake.classified (`classes.classified`)
 * and its Ruling, any override to `classes.overridden`, then (if `reclassify`)
 * intake.reclassified and its Ruling, floor.signalled with two signals (none if
 * `floor.quiet`), their decisions, floor.checked and the end. `floor.early` adds an
 * early floor.signalled with one signal, before or after the reclassification.
 */
function choreRun(
  classes: { classified: IntakeClass; overridden?: IntakeClass } = {
    classified: "chore",
  },
  reclassify = true,
  floor: { early?: "before" | "after"; quiet?: boolean } = {},
): Event[] {
  const cl = classes.classified === "chore" ? chore : classified;
  const { overridden } = classes;
  const head: [string, object][] = [
    ["task.created", task],
    ["run.recorded", { ...run, class: classes.classified }],
    ["run.started", started],
    ["intake.classified", cl],
    ["decision.opened", intakeRuling("run-1", "evt-3", cl)],
  ];
  if (overridden !== undefined) {
    const linked = override("decision-intake-1");
    head.push(["intake.overridden", { ...linked, to: overridden }]);
  }
  const upAt = head.length + (floor.early === "before" ? 1 : 0);
  const after = floor.early === "after" ? 1 : 0;
  const at = upAt + (reclassify ? 2 : 0) + after;
  const earlyAt = floor.early === "before" ? head.length : at - 1;
  const early: [string, object][] = [
    [
      "floor.signalled",
      {
        ...signalled([{ ...runtimeAdd, id: `evt-${String(earlyAt)}:0` }]),
        phase: "early",
      },
    ],
  ];
  const all = floor.quiet === true ? [] : [runtimeAdd, devAdd];
  const signals = all.map((s, i) => ({
    ...s,
    id: `evt-${String(at)}:${String(i)}`,
  }));
  const ids = signals.map((s) => s.id);
  const up = {
    ...{ kind: "intake.reclassified", taskId: "task-1" },
    ...{ from: "chore", to: "architectural", source: "floor" },
    ...{ signalIds: ids, rubricVersion: "intake-rubric-1" },
  };
  const r1 = {
    ...{ kind: "decision.opened", id: "decision-intake-1-r1" },
    ...{ authority: "harness", taskId: "task-1", runId: "run-1" },
    ...{ signalIds: ["evt-" + String(upAt)], class: null, source: "intake" },
    ruling: {
      what: "Reclassified the task from chore to architectural",
      why: ["floorSignal", ...ids.map((id) => "  " + id)].join("\n"),
      costIfWrong: ARCHITECTURAL,
      rubricVersion: "intake-rubric-1",
    },
  };
  const tail: [string, object][] = [
    ...(floor.early === "before" ? early : []),
    ...(reclassify
      ? ([
          ["intake.reclassified", up],
          ["decision.opened", r1],
        ] as [string, object][])
      : []),
    ...(after === 1 ? early : []),
    ["floor.signalled", signalled(signals)],
    ...signals.map((s, i): [string, object] => [
      "decision.opened",
      opened(s, i),
    ]),
    ["floor.checked", floorChecked(BASE, TREE, [])],
    ["run.terminated", {}],
  ];
  return [...head, ...tail].map(([type, payload], seq) =>
    event(seq, type, payload),
  );
}
const RECLASSIFY_OBJECTS = [
  ...FLOOR_OBJECTS,
  "floor.signalled",
  "intake.reclassified",
];
const reclass = (events: readonly Event[], log: readonly Event[] = events) =>
  objectFaults(
    events.filter((e) => e.runId === "run-1"),
    log.filter((e) => RECLASSIFY_OBJECTS.includes(e.type)),
  );

describe("objectFaults: floor Brief claims by rubric version (Q70-1)", () => {
  const R1 = "materiality-rubric-1";
  const R2 = "materiality-rubric-2";
  const claimsOf = (e: Event) => briefOf(e)["claims"] as { tier: string }[];
  const withoutClaims = (e: Event) => {
    const rest = Object.fromEntries(
      Object.entries(briefOf(e)).filter(([key]) => key !== "claims"),
    );
    return withPayload(e, { ...e.payload, brief: rest });
  };

  it("passes a rubric-2 run and a rubric-1 run (an old log) alike", () => {
    expect(floor(signalledRun([runtimeAdd, devAdd], R2))).toEqual([]);
    expect(floor(signalledRun([runtimeAdd, devAdd], R1))).toEqual([]);
    expect(floor(signalledRun([], R2))).toEqual([]);
  });

  it("recomputes the claims: a rubric-2 Brief without them is not its signal's", () => {
    const events = edit(
      signalledRun([runtimeAdd, devAdd], R2),
      4,
      withoutClaims,
    );
    expect(floor(events)).toEqual([NOT_ITS]);
  });

  it("faults a rubric-2 Brief whose claim 0 tier changed", () => {
    const events = edit(signalledRun([runtimeAdd, devAdd], R2), 4, (e) =>
      withBrief(e, {
        claims: claimsOf(e).map((c, i) =>
          i === 0 ? { ...c, tier: "Supported" } : c,
        ),
      }),
    );
    expect(floor(events)).toEqual([NOT_ITS]);
  });

  it("faults a rubric-1 floor.signalled whose Brief has claims added", () => {
    const withClaims = signalledRun([runtimeAdd, devAdd], R2);
    const claims = claimsOf(withClaims[4] as Event);
    const events = edit(signalledRun(), 4, (e) => withBrief(e, { claims }));
    expect(floor(events)).toEqual([NOT_ITS]);
  });

  it("faults a rubric-2 floor.signalled over a rubric-1 Brief", () => {
    const events = edit(signalledRun([runtimeAdd, devAdd], R2), 4, () =>
      event(4, "decision.opened", opened(runtimeAdd, 0)),
    );
    expect(floor(events)).toEqual([NOT_ITS]);
  });
});

describe("objectFaults: intake reclassification (A-dep-3)", () => {
  it("passes a chore reclassified by its final floor signals", () => {
    expect(reclass(choreRun())).toEqual([]);
  });

  it.each<[string, object]>([
    ["from", { from: "bounded" }],
    ["to", { to: "bounded" }],
    ["source", { source: "plan" }],
    ["signalIds", { signalIds: ["evt-7:0"] }],
    ["taskId", { taskId: "task-2" }],
  ])("faults a reclassification whose %s is wrong", (_key, change) => {
    const events = edit(choreRun(), 5, (e) =>
      withPayload(e, { ...e.payload, ...change }),
    );
    // Its Ruling is recomputed from the logged event, so it is not that one's either.
    expect(reclass(events)).toEqual([
      "seq 5: intake.reclassified is not the floor's",
      "seq 6: intake Ruling is not intake.reclassified's",
    ]);
  });

  it.each([["why"], ["costIfWrong"], ["what"]])(
    "faults a reclassification Ruling whose %s is edited",
    (key) => {
      const events = edit(choreRun(), 6, (e) => {
        const ruling = e.payload["ruling"] as object;
        return withPayload(e, {
          ...e.payload,
          ruling: { ...ruling, [key]: "x" },
        });
      });
      expect(reclass(events)).toEqual([
        "seq 6: intake Ruling is not intake.reclassified's",
      ]);
    },
  );

  it("faults a reclassification out of place, or without its Ruling", () => {
    const swapped = choreRun().map((e) =>
      e.seq === 5 || e.seq === 6 ? { ...e, seq: 11 - e.seq } : e,
    );
    expect(reclass(swapped)).toEqual([
      "seq 5: more than one intake Ruling in one run",
      "seq 6: intake.reclassified is not just before floor.signalled",
      "seq 6: intake.reclassified without its intake Ruling",
    ]);
    const moved = edit(choreRun(), 5, (e) => ({ ...e, nodeId: "node-9" }));
    expect(reclass(moved)).toEqual([
      "seq 6: more than one intake Ruling in one run",
      "seq 5: intake.reclassified is not just before floor.signalled",
      "seq 5: intake.reclassified without its intake Ruling",
    ]);
    const alone = edit(choreRun(), 6, () => undefined);
    expect(reclass(alone)).toEqual([
      "seq 5: intake.reclassified without its intake Ruling",
    ]);
  });

  it("faults a second reclassification, and one without floor.signalled", () => {
    const events = choreRun();
    const again = event(12, "intake.reclassified", events[5]?.payload ?? {});
    expect(reclass([...events, again])).toEqual([
      "seq 12: more than one intake.reclassified in one run",
    ]);
    const unsignalled = events.filter((e) => e.type !== "floor.signalled");
    expect(reclass(unsignalled)).toEqual([
      "seq 5: intake.reclassified without floor.signalled",
      "seq 8: floor decision without its signal",
      "seq 9: floor decision without its signal",
    ]);
  });

  it("never reclassifies on an early signal, only the final check's (OQ-AD3-6)", () => {
    const earlier = event(-1, "intake.reclassified", {}, "run-0");
    const quiet = choreRun({ classified: "chore" }, false, {
      ...{ early: "before", quiet: true },
    });
    expect(reclass(quiet)).toEqual([]);
    expect(reclass(quiet, [earlier, ...quiet])).toEqual([]);
    // With final signals too, the reclassification is two seqs before the final one.
    expect(reclass(choreRun(undefined, true, { early: "before" }))).toEqual([]);
    expect(reclass(choreRun(undefined, true, { early: "after" }))).toEqual([
      "seq 5: intake.reclassified is not just before floor.signalled",
    ]);
  });

  it("faults a reclassified run without its intake Ruling: r1 is no legacy run", () => {
    expect(reclass(edit(choreRun(), 4, () => undefined))).toEqual([
      "seq 3: intake.classified without its intake Ruling",
    ]);
  });

  it("treats a chore without a reclassification as legacy only before the first one", () => {
    const old = choreRun({ classified: "chore" }, false);
    expect(reclass(old)).toEqual([]);
    const earlier = event(-1, "intake.reclassified", {}, "run-0");
    expect(reclass(old, [earlier, ...old])).toEqual([
      "seq 5: floor signal on a chore without intake.reclassified",
    ]);
  });

  it("reclassifies by the effective class only (OQ-AD3-1, OQ-AD3-3)", () => {
    const earlier = event(-1, "intake.reclassified", {}, "run-0");
    // A bounded task, or a chore overridden up, is not reclassified.
    for (const classes of [
      { classified: "bounded" },
      { classified: "chore", overridden: "bounded" },
    ] as const) {
      const run = choreRun(classes, false);
      expect(reclass(run, [earlier, ...run])).toEqual([]);
      expect(reclass(choreRun(classes))).toEqual([
        "seq " +
          String(classes.classified === "chore" ? 6 : 5) +
          ": intake.reclassified is not the floor's",
      ]);
    }
    // A downward override to chore is a chore, so it needs one.
    const down = { classified: "bounded", overridden: "chore" } as const;
    expect(reclass(choreRun(down))).toEqual([]);
    const missing = choreRun(down, false);
    expect(reclass(missing, [earlier, ...missing])).toEqual([
      "seq 6: floor signal on a chore without intake.reclassified",
    ]);
  });
});

// A-dep-4 (OQ-AD-6): early floor.signalled events, a warning that opens no decision.
const early = (seq: number, signals: readonly FloorSignal[]) =>
  event(seq, "floor.signalled", {
    ...signalled(
      signals.map((s, i) => ({ ...s, id: `evt-${String(seq)}:${String(i)}` })),
      signals.length === 0 ? [] : LOCKFILES,
    ),
    phase: "early",
  });

/** Task, Run, start, an early floor.signalled (from seq 3) per set, a quiet final check, end. */
function earlyRun(sets: readonly (readonly FloorSignal[])[]): Event[] {
  const n = sets.length;
  return [
    ...signalledRun([]).slice(0, 3),
    ...sets.map((set, i) => early(3 + i, set)),
    event(3 + n, "floor.signalled", signalled([], [])),
    event(4 + n, "floor.checked", floorChecked(BASE, TREE, [])),
    event(5 + n, "run.terminated", {}),
  ];
}
const NO_CHANGE = "early floor.signalled that changes no signal";

describe("objectFaults: early floor signals (A-dep-4)", () => {
  it("passes a dependency added and then removed, and a run with none", () => {
    expect(floor(earlyRun([[runtimeAdd], []]))).toEqual([]);
    expect(floor(earlyRun([[runtimeAdd], [runtimeAdd, devAdd], []]))).toEqual(
      [],
    );
    expect(floor(earlyRun([]))).toEqual([]);
  });

  it("faults an early event that changes no signal", () => {
    expect(floor(earlyRun([[]]))).toEqual(["seq 3: " + NO_CHANGE]);
    expect(floor(earlyRun([[runtimeAdd], [runtimeAdd]]))).toEqual([
      "seq 4: " + NO_CHANGE,
    ]);
    expect(floor(earlyRun([[runtimeAdd], [], []]))).toEqual([
      "seq 5: " + NO_CHANGE,
    ]);
  });

  it.each<[string, (p: Record<string, unknown>) => object]>([
    ["that is not a valid floor event", (p) => ({ ...p, detector: "x" })],
    ["base commit is not run.started's", (p) => ({ ...p, baseCommit: TREE })],
    [
      "rubric version is not known",
      (p) => ({
        ...p,
        materiality: {
          rubricVersion: "materiality-rubric-9",
          threshold: "runtimeAddOrMajor",
        },
      }),
    ],
    [
      "signal ID is not <eventId>:<index>",
      (p) => ({ ...p, signals: [{ ...runtimeAdd, id: "evt-9:0" }] }),
    ],
    [
      "lockfiles are not sorted without repeats",
      (p) => ({ ...p, lockfiles: ["b/yarn.lock", "a/yarn.lock"] }),
    ],
    [
      "lockfiles are not all lockfile paths",
      (p) => ({ ...p, lockfiles: ["app/notes.md"] }),
    ],
    [
      "without lockfiles",
      (p) =>
        Object.fromEntries(
          Object.entries(p).filter(([key]) => key !== "lockfiles"),
        ),
    ],
  ])("faults an early event %s", (text, change) => {
    const events = edit(earlyRun([[runtimeAdd]]), 3, (e) =>
      withPayload(e, change(e.payload)),
    );
    expect(floor(events)).toEqual(["seq 3: early floor.signalled " + text]);
  });

  it("faults an early event out of place", () => {
    const quiet = earlyRun([]);
    const first = [
      ...[...quiet.slice(0, 2), early(2, [runtimeAdd])],
      ...quiet.slice(2),
    ].map((e, seq) => ({ ...e, seq }));
    expect(floor(first)).toEqual([
      "seq 2: early floor.signalled before run.started",
    ]);
    // After the final one, which is then not just before floor.checked.
    const after = [
      ...quiet.slice(0, 4),
      early(4, [runtimeAdd]),
      ...quiet.slice(4).map((e) => ({ ...e, seq: e.seq + 1 })),
    ];
    expect(floor(after)).toEqual([
      "seq 3: floor.signalled and its decisions are not just before floor.checked",
      "seq 4: early floor.signalled after the final one",
    ]);
    // With no final one, an early event is no legacy: floor.checked lacks it.
    const unfinal = earlyRun([[runtimeAdd]]).filter(
      (e) => e.seq !== 4 || e.type !== "floor.signalled",
    );
    expect(floor(unfinal)).toEqual([
      "seq 5: floor.checked without floor.signalled",
    ]);
    const unsignalled = quiet.filter((e) => e.type !== "floor.signalled");
    const checkedFirst = [
      ...unsignalled.slice(0, 4),
      early(5, [runtimeAdd]),
      event(6, "run.terminated", {}),
    ];
    expect(floor(checkedFirst)).toEqual([
      "seq 5: early floor.signalled after floor.checked",
    ]);
  });

  it.each([{ graphId: "graph-9" }, { nodeId: "node-9" }])(
    "faults an early event outside run.started's envelope (%o)",
    (envelope) => {
      const moved = edit(earlyRun([[runtimeAdd]]), 3, (e) => ({
        ...e,
        ...envelope,
      }));
      expect(floor(moved)).toEqual([
        "seq 3: early floor.signalled outside run.started's envelope",
      ]);
    },
  );

  it("opens no decision: one naming an early signal has no signal", () => {
    const events = earlyRun([[runtimeAdd], []]);
    const named = { ...runtimeAdd, id: "evt-3:0" };
    const stray = event(4, "decision.opened", opened(named, 0));
    const strayed = [
      ...events.slice(0, 4),
      stray,
      ...events.slice(4).map((e) => ({ ...e, seq: e.seq + 1 })),
    ];
    expect(floor(strayed)).toEqual([
      "seq 4: floor decision without its signal",
    ]);
  });
});
