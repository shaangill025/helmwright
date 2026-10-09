import type { Event } from "@helmwright/schema";

// Ring 0 (B5-4b): replay's object relations; this module reads events only.

/** The fields a Run records that must be its `run.started`'s. */
const SAME_AS_STARTED = ["taskId", "baseCommit", "engine"] as const;

/**
 * B5-4b replay faults of one run's `events`, given `objects`: the log's `task.created`
 * and `run.recorded` events (any order). The run has at most one `run.recorded`, before
 * its `run.started`, with that event's taskId, baseCommit and engine, and the class of
 * its `intake.classified` if it has one (a refused run may log none); its Task's text is
 * `run.started`'s title. OD-B54-3 (i): a run with no `run.recorded` is legacy, and so
 * not a fault, only if the log has no `run.recorded` before its `run.started`. Each
 * fault is fixed text and the event's `seq`, like `floorFaults`.
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
