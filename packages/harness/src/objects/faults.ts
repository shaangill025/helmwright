import { isDeepStrictEqual } from "node:util";
import {
  validateFloorEvent,
  validateIntakeEvent,
  type Event,
  type FloorSignalled,
} from "@helmwright/schema";
import { FloorError } from "../floor/events.ts";
import {
  MATERIALITY_RUBRIC,
  floorDecision,
  type FloorDecisionInput,
} from "../floor/materiality.ts";
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

const isFloorDecision = (e: Event) =>
  e.type === "decision.opened" && e.payload["source"] === "floor";
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const SEED = /^[0-9a-f]{32}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const ARTIFACT = /^artifact-[0-9a-f]{64}$/;
/** Replay cannot know the key; a Brief's commitment is checked for format only. */
const REPLAY_KEY = new Uint8Array(32);

/** A legacy Brief's footprint: the recomputed IDs, then any footprint IDs. */
const isLegacyFootprint = (footprint: unknown, fixed: readonly string[]) =>
  Array.isArray(footprint) &&
  fixed.every((id, i) => footprint[i] === id) &&
  footprint
    .slice(fixed.length)
    .every((id) => typeof id === "string" && ARTIFACT.test(id));

/**
 * Whether `logged` is the floor decision of `input` (A-dep): its route, a Ruling's body
 * and every Brief field recomputed, with the proposed footprints of `floor.signalled`'s
 * `lockfiles`, but the seed and the commitment, which are checked for format only. A
 * legacy `floor.signalled` (`lockfiles` undefined) names no lockfiles, so past the
 * recomputed footprints its Briefs may hold any footprint ID.
 */
function isFloorDecisionOf(
  logged: Record<string, unknown>,
  input: Omit<FloorDecisionInput, "lockfiles" | "seed" | "key">,
  lockfiles: readonly string[] | undefined,
): boolean {
  const brief = logged["brief"];
  const seed = isRecord(brief) ? brief["optionOrderSeed"] : undefined;
  const given = typeof seed === "string" && SEED.test(seed) ? seed : undefined;
  let expected;
  try {
    expected = floorDecision({
      ...{ ...input, lockfiles: lockfiles ?? [] },
      ...{ seed: given ?? "0".repeat(32), key: REPLAY_KEY },
    });
  } catch (error) {
    if (error instanceof FloorError) return false;
    throw error;
  }
  if (expected.authority === "harness") {
    return isDeepStrictEqual(logged, expected);
  }
  if (!isRecord(brief) || given === undefined) return false;
  const { recommendationSha256: commitment, proposedFootprint: footprint } =
    brief;
  const fixed = expected.brief.proposedFootprint;
  const legacy = lockfiles === undefined;
  return (
    typeof commitment === "string" &&
    SHA256.test(commitment) &&
    (!legacy || isLegacyFootprint(footprint, fixed)) &&
    isDeepStrictEqual(logged, {
      ...expected,
      brief: {
        ...expected.brief,
        recommendationSha256: commitment,
        proposedFootprint: legacy ? footprint : fixed,
      },
    })
  );
}

/**
 * A-dep replay faults of a run's floor decisions: at most one final `floor.signalled`,
 * valid, of a known rubric, with `run.started`'s base commit and `floor.checked`'s
 * candidate tree, signal `i` with the ID `<eventId>:<i>`, and `lockfiles` sorted without
 * repeats and, with a `lockfile.only` signal, those signals' paths; then each signal's
 * decision at the next seqs in signal order, in this run's envelope and equal to the
 * recomputed one (`isFloorDecisionOf`), and `floor.checked` right after them; and no
 * other floor decision of the run (in its events or naming it). A run with
 * `floor.checked` and no `floor.signalled` is legacy, and so not a fault, only if no
 * `floor.signalled` precedes that event in the log; likewise a `floor.signalled` without
 * `lockfiles` (written before the field) is legacy, its Briefs' lockfile footprints
 * checked for format only, only if no `floor.signalled` with it precedes it in the log.
 * Legacy is keyed on the field, not a detector version: the signals are the same
 * `dependency-1` ones.
 */
function floorDecisionFaults(
  events: readonly Event[],
  objects: readonly Event[],
  fault: (seq: number, text: string) => void,
): void {
  const started = events.find((e) => e.type === "run.started");
  const runId = started?.runId ?? events[0]?.runId ?? "";
  const checked = events.find((e) => e.type === "floor.checked");
  const [signalled, ...extra] = events.filter(
    (e) => e.type === "floor.signalled" && e.payload["phase"] !== "early",
  );
  for (const e of extra) fault(e.seq, "more than one floor.signalled");
  // Seqs, as the run's events and `objects` hold copies of one event.
  const matched = new Set<number>();
  if (signalled === undefined) {
    const before = checked?.seq ?? -1;
    if (objects.some((e) => e.type === "floor.signalled" && e.seq < before)) {
      fault(before, "floor.checked without floor.signalled");
    }
  } else {
    const at = (text: string) => {
      fault(signalled.seq, "floor.signalled " + text);
    };
    const payload = { ...signalled.payload };
    if (!validateFloorEvent(payload) || payload.kind !== "floor.signalled") {
      // Its decisions cannot be recomputed, so this one fault stands for them.
      at("that is not a valid floor event");
      return;
    }
    const { signals, materiality, lockfiles } = payload as FloorSignalled;
    if (checked === undefined) at("without floor.checked");
    if (lockfiles === undefined) {
      const named = (e: Event) =>
        e.type === "floor.signalled" &&
        e.seq < signalled.seq &&
        e.payload["lockfiles"] !== undefined;
      if (objects.some(named)) at("without lockfiles");
    } else {
      if (!isDeepStrictEqual(lockfiles, [...new Set(lockfiles)].sort())) {
        at("lockfiles are not sorted without repeats");
      }
      const only = signals.flatMap((s) =>
        s.type === "lockfile.only" ? [s.path] : [],
      );
      const paths = [...new Set(only)].sort();
      if (paths.length > 0 && !isDeepStrictEqual(paths, lockfiles)) {
        at("lockfiles are not its lockfile.only paths");
      }
    }
    if (signalled.payload["baseCommit"] !== started?.payload["baseCommit"]) {
      at("base commit is not run.started's");
    }
    const tree = signalled.payload["candidateTree"];
    if (checked !== undefined && tree !== checked.payload["candidateTree"]) {
      at("candidate tree is not floor.checked's");
    }
    if (materiality.rubricVersion !== MATERIALITY_RUBRIC) {
      at("rubric version is not known");
    }
    if (signals.some((s, i) => s.id !== `${signalled.eventId}:${String(i)}`)) {
      at("signal ID is not <eventId>:<index>");
    }
    const recorded = events.find((e) => e.type === "run.recorded");
    const taskId = recorded?.payload["taskId"] ?? started?.payload["taskId"];
    const task = objects.find(
      (e) => e.type === "task.created" && e.payload["id"] === taskId,
    );
    for (const [index, signal] of signals.entries()) {
      const seq = signalled.seq + 1 + index;
      const e = events.find((x) => x.seq === seq);
      if (
        e === undefined ||
        !isFloorDecision(e) ||
        e.graphId !== signalled.graphId ||
        e.nodeId !== signalled.nodeId
      ) {
        at(`signal ${String(index)} without its floor decision`);
        continue;
      }
      matched.add(seq);
      const input = {
        ...{ runId, taskId: String(taskId), index, signal },
        repoId: String(task?.payload["repoId"]),
        threshold: materiality.threshold,
      };
      if (!isFloorDecisionOf(e.payload, input, lockfiles)) {
        fault(seq, "floor decision is not its signal's");
      }
    }
    if (
      checked !== undefined &&
      checked.seq !== signalled.seq + 1 + signals.length
    ) {
      at("and its decisions are not just before floor.checked");
    }
  }
  const own = (e: Event) =>
    isFloorDecision(e) &&
    (e.runId === runId || e.payload["runId"] === runId) &&
    !matched.has(e.seq);
  const unmatched = [...events, ...objects].filter(own);
  for (const seq of new Set(unmatched.map((e) => e.seq))) {
    fault(seq, "floor decision without its signal");
  }
}

/**
 * B5-4b replay faults of one run's `events`, given `objects`: the log's `task.created`,
 * `run.recorded`, (B5-5) `decision.opened` and (A-dep) `floor.signalled` events (any order). The run has at most
 * one `run.recorded`, before its `run.started`, with that event's taskId, baseCommit
 * and engine, and the class of its `intake.classified` if it has one (a refused run
 * may log none); its Task's text is `run.started`'s title. OD-B54-3 (i): a run with no
 * `run.recorded` is legacy, and so not a fault, only if the log has no `run.recorded`
 * before its `run.started`. B5-5: also the faults of its intake Ruling
 * (`intakeFaults`), and A-dep of its floor decisions (`floorDecisionFaults`). Each
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
  intakeFaults(events, objects, fault);
  floorDecisionFaults(events, objects, fault);
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
