import { isDeepStrictEqual } from "node:util";
import { validateIntakeEvent, type Event } from "@helmwright/schema";
import { intakeRuling } from "../intake/events.ts";
import { IntakeError } from "../intake/rubric.ts";

// Ring 0 (B5-4b): replay's object relations; this module reads events only.

/** The fields a Run records that must be its `run.started`'s. */
const SAME_AS_STARTED = ["taskId", "baseCommit", "engine"] as const;

const isIntakeRuling = (e: Event) =>
  e.type === "decision.opened" &&
  e.payload["authority"] === "harness" &&
  e.payload["source"] === "intake";

/** The intake Ruling replay derives from the `intake.classified` event `e`, if any. */
function recomputed(runId: string, e: Event): unknown {
  const { payload } = e;
  if (!validateIntakeEvent(payload) || payload.kind !== "intake.classified") {
    return undefined;
  }
  try {
    return intakeRuling(runId, e.eventId, payload);
  } catch (error) {
    if (error instanceof IntakeError) return undefined;
    throw error;
  }
}

/**
 * B5-5 (OQ-B55-1) replay faults of a run's intake Ruling: each `intake.classified` has
 * one at the next seq, equal to `intakeRuling` of it; the run has no other one (in its
 * events or naming it); each `intake.overridden` comes after it and has its ID. A run
 * whose `intake.classified` has none is legacy, and so not a fault, only if no intake
 * Ruling precedes that event in the log and none is the run's.
 */
function intakeFaults(
  events: readonly Event[],
  objects: readonly Event[],
  fault: (seq: number, text: string) => void,
): void {
  const runId = events[0]?.runId ?? "";
  const rulings = objects
    .filter(
      (e) =>
        isIntakeRuling(e) &&
        (e.runId === runId || e.payload["runId"] === runId),
    )
    .sort((a, b) => a.seq - b.seq);
  const classified = events.filter((e) => e.type === "intake.classified");
  const [first] = classified;
  const legacy =
    first !== undefined &&
    rulings.length === 0 &&
    !objects.some((e) => isIntakeRuling(e) && e.seq < first.seq);
  if (legacy) return;
  const next = new Set(classified.map((e) => e.seq + 1));
  for (const [i, e] of rulings.entries()) {
    if (i > 0) fault(e.seq, "more than one intake Ruling in one run");
    else if (!next.has(e.seq)) {
      fault(e.seq, "intake Ruling without intake.classified");
    }
  }
  // The Ruling of a classification is the run's own event at the next seq, never one
  // logged under another run that names this run.
  const own = (r: Event, seq: number) => r.runId === runId && r.seq === seq + 1;
  for (const e of classified) {
    const ruling = rulings.find((r) => own(r, e.seq));
    if (ruling === undefined) {
      fault(e.seq, "intake.classified without its intake Ruling");
    } else if (!isDeepStrictEqual(ruling.payload, recomputed(runId, e))) {
      fault(ruling.seq, "intake Ruling is not intake.classified's");
    }
  }
  const ruling = rulings.find((r) => first !== undefined && own(r, first.seq));
  for (const e of events.filter((x) => x.type === "intake.overridden")) {
    if (
      ruling === undefined ||
      e.seq < ruling.seq ||
      e.payload["decisionId"] !== ruling.payload["id"]
    ) {
      fault(
        e.seq,
        "intake.overridden is not linked to the run's intake Ruling",
      );
    }
  }
}

/**
 * B5-4b replay faults of one run's `events`, given `objects`: the log's `task.created`,
 * `run.recorded` and (B5-5) `decision.opened` events (any order). The run has at most
 * one `run.recorded`, before its `run.started`, with that event's taskId, baseCommit
 * and engine, and the class of its `intake.classified` if it has one (a refused run
 * may log none); its Task's text is `run.started`'s title. OD-B54-3 (i): a run with no
 * `run.recorded` is legacy, and so not a fault, only if the log has no `run.recorded`
 * before its `run.started`. B5-5: also the faults of its intake Ruling
 * (`intakeFaults`). Each fault is fixed text and the event's `seq`, like `floorFaults`.
 */
export function objectFaults(
  events: readonly Event[],
  objects: readonly Event[],
): string[] {
  const faults: string[] = [];
  const fault = (seq: number, text: string) =>
    faults.push(`seq ${String(seq)}: ${text}`);
  const started = events.find((e) => e.type === "run.started");
  const records = events.filter((e) => e.type === "run.recorded");
  const [recorded, ...extra] = records;
  for (const e of extra) fault(e.seq, "more than one run.recorded in one run");
  // A legacy run has no Run row to refuse a second end: replay must not trust the last.
  for (const type of ["run.started", "run.terminated"]) {
    for (const e of events.filter((x) => x.type === type).slice(1)) {
      fault(e.seq, `more than one ${type} in one run`);
    }
  }
  intakeFaults(events, objects, fault);
  if (recorded === undefined) {
    const first = Math.min(
      ...objects.filter((e) => e.type === "run.recorded").map((e) => e.seq),
    );
    if (started !== undefined && first < started.seq) {
      fault(started.seq, "run.started without run.recorded");
    }
    return faults;
  }
  if (started === undefined) {
    fault(recorded.seq, "run.recorded without run.started");
    return faults;
  }
  for (const e of records) {
    if (e.seq > started.seq) fault(e.seq, "run.recorded after run.started");
  }
  const run = recorded.payload;
  for (const key of SAME_AS_STARTED) {
    if (run[key] !== started.payload[key]) {
      fault(recorded.seq, `run.recorded ${key} is not run.started's`);
    }
  }
  const classified = events.find((e) => e.type === "intake.classified");
  if (
    classified !== undefined &&
    run["class"] !== classified.payload["class"]
  ) {
    fault(recorded.seq, "run.recorded class is not intake.classified's");
  }
  const task = objects.find(
    (e) => e.type === "task.created" && e.payload["id"] === run["taskId"],
  );
  if (task?.payload["text"] !== started.payload["title"]) {
    fault(started.seq, "Task text is not run.started's title");
  }
  return faults;
}
