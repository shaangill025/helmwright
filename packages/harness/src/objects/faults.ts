import { isDeepStrictEqual } from "node:util";
import {
  validateFloorEvent,
  validateIntakeEvent,
  type Event,
  type FloorSignalled,
} from "@helmwright/schema";
import { isLockfilePath } from "../floor/dependencies.ts";
import { FloorError } from "../floor/events.ts";
import {
  MATERIALITY_RUBRICS,
  floorDecision,
  type FloorDecisionInput,
} from "../floor/materiality.ts";
import {
  intakeReclassified,
  intakeReclassifiedRuling,
  intakeRuling,
} from "../intake/events.ts";
import { IntakeError } from "../intake/rubric.ts";

// Ring 0 (B5-4b): replay's object relations; this module reads events only.
// PB-1: it only steps over a `provisional.opened` or `provisional.refused` between floor
// decisions; their content (commit, tree, ref, position, a missing one) is checked by
// `provisionalFaults` (floor/provisional.ts), which replay must run with this.

/** The fields a Run records that must be its `run.started`'s. */
const SAME_AS_STARTED = ["taskId", "baseCommit", "engine"] as const;

const isIntakeRuling = (e: Event) =>
  e.type === "decision.opened" &&
  e.payload["authority"] === "harness" &&
  e.payload["source"] === "intake";
const sameEnvelope = (a: Event, b: Event) =>
  a.graphId === b.graphId && a.runId === b.runId && a.nodeId === b.nodeId;
/** A-dep-3: whether `e` is the intake Ruling of the `intake.reclassified` event `r`. */
const isRulingOf = (r: Event, e: Event) =>
  isIntakeRuling(e) && e.seq === r.seq + 1 && sameEnvelope(r, e);

/** What `build` gives, or undefined if it throws IntakeError. */
function unlessIntakeError<T>(build: () => T): T | undefined {
  try {
    return build();
  } catch (error) {
    if (error instanceof IntakeError) return undefined;
    throw error;
  }
}

/** The intake Ruling replay derives from the `intake.classified` event `e`, if any. */
function recomputed(runId: string, e: Event): unknown {
  const { payload } = e;
  if (!validateIntakeEvent(payload) || payload.kind !== "intake.classified") {
    return undefined;
  }
  return unlessIntakeError(() => intakeRuling(runId, e.eventId, payload));
}

/**
 * B5-5 (OQ-B55-1) replay faults of a run's intake Ruling: each `intake.classified` has
 * one at the next seq, equal to `intakeRuling` of it; the run has no other one (in its
 * events or naming it); each `intake.overridden` comes after it and has its ID. A run
 * whose `intake.classified` has none is legacy, and so not a fault, only if no intake
 * Ruling precedes that event in the log, none is the run's and (A-dep-3) the run has no
 * `intake.reclassified`. A-dep-3: the Ruling of
 * one of the run's `intake.reclassified` events is checked by `reclassificationFaults`.
 */
function intakeFaults(
  events: readonly Event[],
  objects: readonly Event[],
  fault: (seq: number, text: string) => void,
): void {
  const runId = events[0]?.runId ?? "";
  const reclassified = events.filter((e) => e.type === "intake.reclassified");
  const rulings = objects
    .filter(
      (e) =>
        isIntakeRuling(e) &&
        (e.runId === runId || e.payload["runId"] === runId) &&
        !reclassified.some((r) => isRulingOf(r, e)),
    )
    .sort((a, b) => a.seq - b.seq);
  const classified = events.filter((e) => e.type === "intake.classified");
  const [first] = classified;
  // A-dep-3: an own intake.reclassified is from a build that logs intake Rulings.
  const legacy =
    first !== undefined &&
    rulings.length === 0 &&
    reclassified.length === 0 &&
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
 * The faults of a `floor.signalled` event's `lockfiles` (A-dep): sorted without repeats,
 * each a lockfile path, and with a `lockfile.only` signal, those signals' paths.
 */
function lockfileFaults(
  signals: FloorSignalled["signals"],
  lockfiles: readonly string[],
  at: (text: string) => void,
): void {
  if (!isDeepStrictEqual(lockfiles, [...new Set(lockfiles)].sort())) {
    at("lockfiles are not sorted without repeats");
  }
  if (!lockfiles.every(isLockfilePath)) {
    at("lockfiles are not all lockfile paths");
  }
  const only = signals.flatMap((s) =>
    s.type === "lockfile.only" ? [s.path] : [],
  );
  const paths = [...new Set(only)].sort();
  if (paths.length > 0 && !isDeepStrictEqual(paths, lockfiles)) {
    at("lockfiles are not its lockfile.only paths");
  }
}

/**
 * A-dep replay faults of a run's floor decisions: at most one final `floor.signalled`,
 * valid, of a known rubric, with `run.started`'s base commit and `floor.checked`'s
 * candidate tree, signal `i` with the ID `<eventId>:<i>`, and `lockfiles` sorted without
 * repeats, each a path the detector reads as a lockfile (`isLockfilePath`) and, with a
 * `lockfile.only` signal, those signals' paths; then each signal's
 * decision at the next seqs in signal order, in this run's envelope and equal to the
 * recomputed one (`isFloorDecisionOf`), and `floor.checked` right after them; and no
 * other floor decision of the run (in its events or naming it). A run with
 * `floor.checked` and no `floor.signalled` is legacy, and so not a fault, only if no
 * `floor.signalled` precedes that event in the log; likewise a `floor.signalled` without
 * `lockfiles` (written before the field) is legacy, its Briefs' lockfile footprints
 * checked for format only, only if no `floor.signalled` with it precedes it in the log.
 * A rubric older than that of an earlier `floor.signalled` in the log is a fault.
 * Legacy is keyed on the field, not a detector version: the signals are the same
 * `dependency-1` ones. `lockfiles`, like `signals`, is self-attested until SIG's hash
 * chain: replay checks it against the signals, not the candidate tree.
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
      lockfileFaults(signals, lockfiles, at);
    }
    if (signalled.payload["baseCommit"] !== started?.payload["baseCommit"]) {
      at("base commit is not run.started's");
    }
    const tree = signalled.payload["candidateTree"];
    if (checked !== undefined && tree !== checked.payload["candidateTree"]) {
      at("candidate tree is not floor.checked's");
    }
    if (!MATERIALITY_RUBRICS.includes(materiality.rubricVersion)) {
      at("rubric version is not known");
    }
    // Rubric versions only move forward in a log, as the lockfiles legacy rule does.
    const rank = (v: unknown) => MATERIALITY_RUBRICS.indexOf(String(v));
    const mine = rank(materiality.rubricVersion);
    const later = (e: Event) => {
      const m = e.payload["materiality"] as { rubricVersion?: unknown } | null;
      return rank(m?.rubricVersion) > mine;
    };
    const earlier = (e: Event) =>
      e.type === "floor.signalled" && e.seq < signalled.seq && later(e);
    if (mine >= 0 && objects.some(earlier)) {
      at("rubric version is older than an earlier one's");
    }
    if (signals.some((s, i) => s.id !== `${signalled.eventId}:${String(i)}`)) {
      at("signal ID is not <eventId>:<index>");
    }
    const recorded = events.find((e) => e.type === "run.recorded");
    const taskId = recorded?.payload["taskId"] ?? started?.payload["taskId"];
    const task = objects.find(
      (e) => e.type === "task.created" && e.payload["id"] === taskId,
    );
    // PB-1: a provisional event directly after an owner decision is not a slot.
    let next = signalled.seq + 1;
    const skipFork = () => {
      while (
        (events.find((x) => x.seq === next)?.type ?? "").startsWith(
          "provisional.",
        )
      ) {
        next += 1;
      }
    };
    for (const [index, signal] of signals.entries()) {
      if (index > 0) skipFork();
      const seq = next;
      next += 1;
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
      // An unknown rubric cannot be recomputed; its one fault stands for the decisions.
      if (!MATERIALITY_RUBRICS.includes(materiality.rubricVersion)) continue;
      const input = {
        ...{ runId, taskId: String(taskId), index, signal },
        repoId: String(task?.payload["repoId"]),
        threshold: materiality.threshold,
        rubricVersion: materiality.rubricVersion,
      };
      if (!isFloorDecisionOf(e.payload, input, lockfiles)) {
        fault(seq, "floor decision is not its signal's");
      }
    }
    skipFork();
    if (checked !== undefined && checked.seq !== next) {
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
 * A-dep-3 (OQ-AD-7, OQ-AD3-1 to OQ-AD3-6) replay faults of a run's reclassification: a
 * run that logged `intake.classified`, whose effective class (the last
 * `intake.overridden`'s `to`, else the classified class) is chore and whose final
 * `floor.signalled` has a signal, has one `intake.reclassified` two seqs before that
 * event in its envelope, equal to the recomputed one (`intakeReclassified`, every
 * signal ID in order), and its intake Ruling at the next seq in its envelope, equal to
 * `intakeReclassifiedRuling` of it; in a run that needs none, one is a fault. A
 * run that needs one and has none is legacy, and so not a fault, only if no
 * `intake.reclassified` precedes its `floor.signalled` in the log.
 */
function reclassificationFaults(
  events: readonly Event[],
  objects: readonly Event[],
  fault: (seq: number, text: string) => void,
): void {
  const runId = events[0]?.runId ?? "";
  const classified = events.find((e) => e.type === "intake.classified");
  const overridden = events.findLast((e) => e.type === "intake.overridden");
  const effective = overridden?.payload["to"] ?? classified?.payload["class"];
  const signalled = events.find(
    (e) => e.type === "floor.signalled" && e.payload["phase"] !== "early",
  );
  const signals = signalled?.payload["signals"];
  const ids: unknown[] = Array.isArray(signals)
    ? signals.map((s: unknown) => (isRecord(s) ? s["id"] : s))
    : [];
  const due =
    classified !== undefined && effective === "chore" && ids.length > 0;
  const [reclassified, ...extra] = events.filter(
    (e) => e.type === "intake.reclassified",
  );
  for (const e of extra) {
    fault(e.seq, "more than one intake.reclassified in one run");
  }
  if (reclassified === undefined) {
    const before = signalled?.seq ?? -1;
    const earlier = (e: Event) =>
      e.type === "intake.reclassified" && e.seq < before;
    if (due && signalled !== undefined && objects.some(earlier)) {
      fault(
        signalled.seq,
        "floor signal on a chore without intake.reclassified",
      );
    }
    return;
  }
  if (signalled === undefined) {
    fault(reclassified.seq, "intake.reclassified without floor.signalled");
  } else {
    if (
      reclassified.seq !== signalled.seq - 2 ||
      !sameEnvelope(reclassified, signalled)
    ) {
      fault(
        reclassified.seq,
        "intake.reclassified is not just before floor.signalled",
      );
    }
    const expected = unlessIntakeError(() =>
      due
        ? intakeReclassified(
            String(classified.payload["taskId"]),
            "chore",
            ids as string[],
            String(classified.payload["rubricVersion"]),
          )
        : undefined,
    );
    if (!isDeepStrictEqual(reclassified.payload, expected)) {
      fault(reclassified.seq, "intake.reclassified is not the floor's");
    }
  }
  const ruling = events.find((e) => isRulingOf(reclassified, e));
  const { payload } = reclassified;
  const recomputedRuling =
    validateIntakeEvent(payload) && payload.kind === "intake.reclassified"
      ? unlessIntakeError(() =>
          intakeReclassifiedRuling(runId, reclassified.eventId, payload),
        )
      : undefined;
  if (ruling === undefined) {
    fault(reclassified.seq, "intake.reclassified without its intake Ruling");
  } else if (!isDeepStrictEqual(ruling.payload, recomputedRuling)) {
    fault(ruling.seq, "intake Ruling is not intake.reclassified's");
  }
}

/**
 * A-dep-4 (OQ-AD-6) replay faults of a run's early `floor.signalled` events: each valid,
 * in `run.started`'s envelope, with its base commit, a known rubric, signal `i` with the ID
 * `<eventId>:<i>` and `lockfiles` as `lockfileFaults` checks them; after `run.started`
 * and before the final `floor.signalled` (without one, `floor.checked`); and with
 * signals (IDs aside) other than the previous early one's, at first none. An early
 * event opens no decision (a decision naming its signal is `floorDecisionFaults`' fault)
 * and never reclassifies (OQ-AD3-6). Its signals are self-attested until SIG's hash chain.
 */
function earlyFaults(
  events: readonly Event[],
  fault: (seq: number, text: string) => void,
): void {
  const started = events.find((e) => e.type === "run.started");
  const final = events.find(
    (e) => e.type === "floor.signalled" && e.payload["phase"] !== "early",
  );
  const end = final ?? events.find((e) => e.type === "floor.checked");
  let previous: unknown = [];
  const early = (e: Event) =>
    e.type === "floor.signalled" && e.payload["phase"] === "early";
  for (const e of events.filter(early)) {
    const at = (text: string) => {
      fault(e.seq, "early floor.signalled " + text);
    };
    const payload = { ...e.payload };
    if (!validateFloorEvent(payload) || payload.kind !== "floor.signalled") {
      at("that is not a valid floor event");
      continue;
    }
    const { signals, materiality, lockfiles } = payload as FloorSignalled;
    if (started === undefined || e.seq < started.seq) at("before run.started");
    if (started !== undefined && !sameEnvelope(e, started)) {
      at("outside run.started's envelope");
    }
    if (end !== undefined && e.seq > end.seq) {
      at(final === undefined ? "after floor.checked" : "after the final one");
    }
    if (payload.baseCommit !== started?.payload["baseCommit"]) {
      at("base commit is not run.started's");
    }
    if (!MATERIALITY_RUBRICS.includes(materiality.rubricVersion)) {
      at("rubric version is not known");
    }
    if (signals.some((s, i) => s.id !== `${e.eventId}:${String(i)}`)) {
      at("signal ID is not <eventId>:<index>");
    }
    if (lockfiles === undefined) at("without lockfiles");
    else lockfileFaults(signals, lockfiles, at);
    const set = signals.map((signal) => ({ ...signal, id: "" }));
    if (isDeepStrictEqual(set, previous)) at("that changes no signal");
    previous = set;
  }
}

/**
 * B5-4b replay faults of one run's `events`, given `objects`: the log's `task.created`,
 * `run.recorded`, (B5-5) `decision.opened`, (A-dep) `floor.signalled` and (A-dep-3)
 * `intake.reclassified` events (any order). The run has at most
 * one `run.recorded`, before its `run.started`, with that event's taskId, baseCommit
 * and engine, and the class of its `intake.classified` if it has one (a refused run
 * may log none); its Task's text is `run.started`'s title. OD-B54-3 (i): a run with no
 * `run.recorded` is legacy, and so not a fault, only if the log has no `run.recorded`
 * before its `run.started`. B5-5: also the faults of its intake Ruling
 * (`intakeFaults`), A-dep-3 of its reclassification (`reclassificationFaults`),
 * A-dep of its floor decisions (`floorDecisionFaults`) and A-dep-4 of its early
 * `floor.signalled` events (`earlyFaults`). Each
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
  reclassificationFaults(events, objects, fault);
  floorDecisionFaults(events, objects, fault);
  earlyFaults(events, fault);
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
