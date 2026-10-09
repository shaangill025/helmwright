import type { Event } from "@helmwright/schema";
import { describe, expect, it } from "vitest";
import { objectFaults, runRecorded, taskCreated } from "../../src/index.ts";

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
