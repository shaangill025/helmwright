import {
  validateIntakeEvent,
  type DecisionOpened,
  type IntakeClass,
  type IntakeClassified,
  type IntakeDeclared,
  type IntakeOverridden,
} from "@helmwright/schema";
import { ObjectEventError, decisionOpened } from "../objects/events.ts";
import {
  IntakeError,
  frictionFor,
  type IntakeInput,
  type IntakeResult,
} from "./rubric.ts";

/** OQ-B10-1: the fixed reason a run fails when a downward override is not approved. */
export const INTAKE_OVERRIDE_NOT_APPROVED =
  "downward intake override was not approved";

/** The owner's CLI override: the class asked for and why. */
export interface IntakeOverride {
  readonly to: IntakeClass;
  readonly reason: string;
}

/** `payload` if it is a valid intake event of its kind. @throws IntakeError with fixed text */
function checked<P extends IntakeClassified | IntakeOverridden>(payload: P): P {
  // A copy, so the guard does not narrow `payload` itself.
  if (!validateIntakeEvent({ ...payload })) {
    throw new IntakeError(payload.kind + " cannot be logged");
  }
  return payload;
}

/** B10-2: the `intake.classified` payload of `result`, for the sorted unique scope. */
export function intakeClassified(
  taskId: string,
  scope: readonly string[],
  declared: IntakeDeclared,
  result: IntakeResult,
): IntakeClassified {
  return checked({
    kind: "intake.classified",
    taskId,
    class: result.class,
    rubricVersion: result.rubricVersion,
    // classify always gives at least one reason; the schema checks it again.
    reasons: result.reasons.map((r) => ({
      ...r,
      entries: [...r.entries],
    })) as IntakeClassified["reasons"],
    scope: [...new Set(scope)].sort(),
    scopeSha256: result.scopeSha256,
    ring0Sha256: result.ring0Sha256,
    declared: {
      newDependencies: [...declared.newDependencies],
      newModules: [...declared.newModules],
      surfaceChanges: [...declared.surfaceChanges],
      newProcessBoundary: declared.newProcessBoundary,
    },
    friction: { ...result.friction },
    sparring: result.sparring,
  });
}

/**
 * S3: `from` is always the class this run just classified, never the caller's.
 * B10-3 S2: `friction` is `to`'s by the rubric's rule under the run's `friction` config.
 * B5-5: `decisionId` is the ID of the run's intake Ruling, which the override overrules.
 */
export function intakeOverridden(
  taskId: string,
  result: IntakeResult,
  override: IntakeOverride,
  friction: IntakeInput["friction"],
  decisionId: string,
): IntakeOverridden {
  return checked({
    kind: "intake.overridden",
    taskId,
    from: result.class,
    to: override.to,
    reason: override.reason,
    by: "cli",
    attestation: { kind: "none" },
    scopeSha256: result.scopeSha256,
    rubricVersion: result.rubricVersion,
    friction: frictionFor(override.to, friction),
    decisionId,
  });
}

/**
 * B5-5 (Q53, OQ-B55-1): the cost if an intake Ruling is wrong, per rubric version and
 * class, as the owner approved it. Ring 0: replay recomputes the Ruling, so a change of
 * wording is a new rubric version.
 */
export const INTAKE_COST_IF_WRONG: ReadonlyMap<
  string,
  Readonly<Record<IntakeClass, string>>
> = new Map([
  [
    "intake-rubric-1",
    Object.freeze({
      chore:
        "If the task is not a chore, it runs at minimal friction and a change that needs review or a brief gets none.",
      bounded:
        "If the task is architectural, owned decisions get no early brief; if it is a chore, the run has more friction than it needs.",
      architectural:
        "If the task is smaller, the run has more friction and owner attention than it needs.",
    }),
  ],
]);

/** The longest `why` of an intake Ruling, in code points (the Ruling's `text`). */
const MAX_WHY = 8192;

/** B5-5: the ID of the intake Ruling of the run `runId` (`run-<id>`): `decision-intake-<id>`. */
export function intakeRulingId(runId: string): string {
  if (!runId.startsWith("run-") || runId.length === "run-".length) {
    throw new IntakeError("decision.opened cannot be logged: not a run ID");
  }
  return "decision-intake-" + runId.slice("run-".length);
}

/**
 * Each rule on its own line, then each of its entries, already escaped, on its own
 * indented line. Over MAX_WHY code points, entries are kept in order while they and the
 * marker fit; the rest are counted in the marker, so the text can be rule names only.
 */
function rulingWhy(reasons: IntakeClassified["reasons"]): string {
  const size = (text: string) => Array.from(text).length;
  const text = (entries: readonly (readonly string[])[]) =>
    reasons
      .map((r, i) => [r.rule, ...(entries[i] ?? [])].join("\n"))
      .join("\n");
  const all = reasons.map((r) => r.entries.map((e) => "  " + e));
  if (size(text(all)) <= MAX_WHY) return text(all);
  const total = all.reduce((n, lines) => n + lines.length, 0);
  const marker = (k: number) =>
    "\n…[+" + String(k) + " more entries; see intake.classified]";
  // The marker counts at most `total` entries, so this reserves its longest form.
  let room = MAX_WHY - size(text([])) - size(marker(total));
  let stopped = false;
  const shown = all.map((lines) => {
    const out: string[] = [];
    for (const line of lines) {
      // A newline and the line; the first entry that does not fit ends the list.
      stopped ||= size(line) + 1 > room;
      if (stopped) break;
      room -= size(line) + 1;
      out.push(line);
    }
    return out;
  });
  const left = total - shown.reduce((n, lines) => n + lines.length, 0);
  return text(shown) + marker(left);
}

/**
 * B5-5 (Q-B5-2, Q53): the intake Ruling of `classified`, the `intake.classified` event
 * `eventId` of the run `runId`: authority harness, class null, source intake, its only
 * signal that event, and what, why and costIfWrong derived from the event alone, so
 * replay can recompute it.
 * @throws IntakeError with fixed text if the Ruling is not a valid `decision.opened`
 */
export function intakeRuling(
  runId: string,
  eventId: string,
  classified: IntakeClassified,
): DecisionOpened {
  const costs = INTAKE_COST_IF_WRONG.get(classified.rubricVersion);
  if (costs === undefined) {
    throw new IntakeError("decision.opened cannot be logged: no cost if wrong");
  }
  try {
    return decisionOpened({
      id: intakeRulingId(runId),
      authority: "harness",
      taskId: classified.taskId,
      runId,
      signalIds: [eventId],
      class: null,
      source: "intake",
      ruling: {
        what: "Classified the task as " + classified.class,
        why: rulingWhy(classified.reasons),
        costIfWrong: costs[classified.class],
        rubricVersion: classified.rubricVersion,
      },
    });
  } catch (error) {
    if (!(error instanceof ObjectEventError)) throw error;
    throw new IntakeError("decision.opened cannot be logged", { cause: error });
  }
}
