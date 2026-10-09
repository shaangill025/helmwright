import { createHash } from "node:crypto";
import {
  validateObjectEvent,
  validateObjectRecord,
  type ArtifactRecorded,
  type ArtifactType,
  type DecisionFootprintRecorded,
  type DecisionOpened,
  type DecisionOpenedOwned,
  type DecisionOpenedRuling,
  type DecisionOutcomeSignalled,
  type Event,
  type ObjectEvent,
  type ObjectRecord,
  type RunRecorded,
  type TaskCreated,
} from "@helmwright/schema";

// Ring 0 (B5-2): this module must not import the session log, which imports it.

/** An object event could not be built or mapped (fail closed); the message is fixed text. */
export class ObjectEventError extends Error {
  override name = "ObjectEventError";
}

/** The object event types with a payload in object-event.schema.json (B5-2). */
export const OBJECT_EVENT_TYPES: readonly string[] = Object.freeze([
  "task.created",
  "run.recorded",
  "artifact.recorded",
  "decision.opened",
  "decision.footprint.recorded",
  "decision.outcome.signalled",
]);

/** The namespaces the object model claims (OD-4); `run.` stays open for run.started and run.terminated. */
const CLAIMED = ["task.", "artifact.", "decision."] as const;
const OWNER_PREFIX = "decision.owner.";
const REVEALED = "decision.recommendation.revealed";

/** The content address of a footprint artifact (Q47): SHA-256 of the UTF-8 bytes of `JSON.stringify([type, repoId, ref])`. */
export function footprintAddress(
  type: ArtifactType,
  repoId: string,
  ref: string,
): { readonly id: string; readonly sha256: string } {
  const sha256 = createHash("sha256")
    .update(JSON.stringify([type, repoId, ref]), "utf8")
    .digest("hex");
  return { id: "artifact-" + sha256, sha256 };
}

const unique = (values: readonly string[]) =>
  new Set(values).size === values.length;

/** Sorted in default sort order with no repeat. */
const sortedUnique = (values: readonly string[]) =>
  values.every((value, i) => i === 0 || (values[i - 1] ?? "") < value);

/**
 * A Ruling's class and rubric family by its source: intake is outside the owned classes
 * (OD-2) and uses the intake rubric; a plan or floor call keeps its owned class and uses
 * the materiality rubric (Q53, B5-5a).
 */
function rulingReason(p: DecisionOpenedRuling): string | undefined {
  if (p.source === "intake") {
    if (p.class !== null) {
      return "decision.opened intake Ruling must have class null";
    }
    return p.ruling.rubricVersion.startsWith("intake-rubric-")
      ? undefined
      : "decision.opened intake Ruling needs an intake-rubric- version";
  }
  if (p.class === null) {
    return "decision.opened plan or floor Ruling must have a class";
  }
  return p.ruling.rubricVersion.startsWith("materiality-rubric-")
    ? undefined
    : "decision.opened plan or floor Ruling needs a materiality-rubric- version";
}

/** The relations of a schema-valid payload that the schema cannot express. */
function relationReason(p: ObjectEvent): string | undefined {
  switch (p.kind) {
    case "task.created":
      return sortedUnique(p.scope)
        ? undefined
        : "task.created scope is not sorted and unique";
    case "run.recorded":
      return undefined;
    case "artifact.recorded": {
      if (!p.type.startsWith("footprint.")) return undefined;
      const address =
        p.repoId === undefined
          ? undefined
          : footprintAddress(p.type, p.repoId, p.ref);
      return address?.sha256 === p.sha256 && address.id === p.id
        ? undefined
        : "artifact.recorded footprint is not content-addressed";
    }
    case "decision.opened":
      if (!unique(p.signalIds)) return "decision.opened signalIds repeat";
      if (p.authority === "harness") return rulingReason(p);
      if (!unique(p.brief.options.map((o) => o.id))) {
        return "decision.opened option IDs repeat";
      }
      if (!unique(p.brief.concepts)) return "decision.opened concepts repeat";
      return unique(p.brief.proposedFootprint)
        ? undefined
        : "decision.opened proposedFootprint repeats";
    case "decision.footprint.recorded":
    case "decision.outcome.signalled":
      return unique(p.artifactIds) ? undefined : p.kind + " artifactIds repeat";
  }
}

/** Steps 1 to 4 of checkObjectEvent, which need only the type and payload. */
function payloadReason(type: string, payload: unknown): string | undefined {
  if (type.startsWith(OWNER_PREFIX)) {
    return "decision.owner.* events are refused until SIG";
  }
  if (type === REVEALED) {
    return "decision.recommendation.revealed is refused until A3";
  }
  if (!OBJECT_EVENT_TYPES.includes(type)) {
    return CLAIMED.some((prefix) => type.startsWith(prefix))
      ? "unknown object event type"
      : undefined;
  }
  if (!validateObjectEvent(payload)) return "invalid object event payload";
  if (payload.kind !== type) return "object event kind is not its type";
  return relationReason(payload);
}

/**
 * The record an object creation event creates, from its payload and envelope (OD-1):
 * `createdAt`/`createdSeq` are the envelope's `at`/`seq`, a Run's `id`, `graphId` and
 * `nodeId` the envelope's `runId`, `graphId` and `nodeId`, and kind, ring and the
 * creation-time constants come from objects.schema.json. Not validated; undefined for
 * a type that creates no object.
 */
function mapRecord(event: Event): Record<string, unknown> | undefined {
  const { type, payload } = event;
  const created = { ring: 0, createdAt: event.at, createdSeq: event.seq };
  switch (type) {
    case "task.created":
      return { ...payload, kind: "task", ...created, status: "open" };
    case "run.recorded":
      return {
        ...payload,
        id: event.runId,
        kind: "run",
        ...created,
        graphId: event.graphId,
        nodeId: event.nodeId,
        terminal: null,
      };
    case "artifact.recorded":
      return { ...payload, kind: "artifact", ...created };
    case "decision.opened":
      return {
        ...payload,
        kind: "decision",
        ...created,
        footprint: [],
        outcomes: [],
        status: payload["authority"] === "owner" ? "pending" : "resolved",
      };
    default:
      return undefined;
  }
}

/**
 * Why the session log must refuse `event`, as fixed text, or undefined (B5-2, OD-3). In
 * order: (1) every `decision.owner.*` type until SIG (Q-B5-1, prefix match); (2)
 * `decision.recommendation.revealed` until A3 (OD-2); (3) an object event type whose
 * payload is not a valid object event of that kind, breaks a relation the schema cannot
 * express (sorted unique scope, unique IDs, the footprint content address, an intake
 * Ruling's null class), or creates a record that objects.schema.json rejects; (4) any
 * other `task.`, `artifact.` or `decision.` type (OD-4). Other types pass.
 */
export function checkObjectEvent(event: Event): string | undefined {
  const reason = payloadReason(event.type, event.payload);
  if (reason !== undefined) return reason;
  const record = mapRecord(event);
  return record === undefined || validateObjectRecord(record)
    ? undefined
    : "object event does not create a valid record";
}

/**
 * The record that the creation event `event` creates (OD-8), validated against
 * objects.schema.json. B5-3 applies it to the projection.
 * @throws ObjectEventError with fixed text if `event` is not a valid creation event
 */
export function createdRecord(event: Event): ObjectRecord {
  const reason = checkObjectEvent(event);
  if (reason !== undefined) throw new ObjectEventError(reason);
  const record = mapRecord(event);
  if (record === undefined || !validateObjectRecord(record)) {
    throw new ObjectEventError("the event creates no object");
  }
  return record;
}

/** `payload` if the log would accept it as its kind. @throws ObjectEventError with fixed text */
function checked<P extends ObjectEvent>(payload: P): P {
  const reason = payloadReason(payload.kind, { ...payload });
  if (reason !== undefined) {
    throw new ObjectEventError(payload.kind + " cannot be logged: " + reason);
  }
  return payload;
}

/** The `task.created` payload, for the sorted unique scope. */
export function taskCreated(task: {
  readonly id: string;
  readonly repoId: string;
  readonly text: string;
  readonly scope: readonly string[];
}): TaskCreated {
  return checked({
    kind: "task.created",
    id: task.id,
    repoId: task.repoId,
    text: task.text,
    scope: [...new Set(task.scope)].sort(),
  });
}

/** The `run.recorded` payload; the record's id, graphId and nodeId come from the envelope. */
export function runRecorded(run: Omit<RunRecorded, "kind">): RunRecorded {
  return checked({
    kind: "run.recorded",
    taskId: run.taskId,
    engine: run.engine,
    baseCommit: run.baseCommit,
    class: run.class,
  });
}

/** The `artifact.recorded` payload; a footprint's id and sha256 must be `footprintAddress`'s. */
export function artifactRecorded(
  artifact: Omit<ArtifactRecorded, "kind">,
): ArtifactRecorded {
  const { repoId, runId } = artifact;
  return checked({
    kind: "artifact.recorded",
    id: artifact.id,
    type: artifact.type,
    ...(repoId === undefined ? {} : { repoId }),
    ref: artifact.ref,
    sha256: artifact.sha256,
    ...(runId === undefined ? {} : { runId }),
  });
}

/** The `decision.opened` payload of an owned decision or a Ruling, as a deep copy. */
export function decisionOpened(
  decision:
    Omit<DecisionOpenedOwned, "kind"> | Omit<DecisionOpenedRuling, "kind">,
): DecisionOpened {
  return checked({ ...structuredClone(decision), kind: "decision.opened" });
}

/** The `decision.footprint.recorded` payload. */
export function decisionFootprintRecorded(
  decisionId: string,
  artifactIds: readonly string[],
): DecisionFootprintRecorded {
  return checked({
    kind: "decision.footprint.recorded",
    decisionId,
    // The schema checks at least one ID again.
    artifactIds: [...artifactIds] as DecisionFootprintRecorded["artifactIds"],
  });
}

/** The `decision.outcome.signalled` payload; the outcome's at and seq come from the envelope. */
export function decisionOutcomeSignalled(
  signal: Omit<DecisionOutcomeSignalled, "kind" | "artifactIds"> & {
    readonly artifactIds: readonly string[];
  },
): DecisionOutcomeSignalled {
  return checked({
    kind: "decision.outcome.signalled",
    decisionId: signal.decisionId,
    signal: signal.signal,
    runId: signal.runId,
    artifactIds: [
      ...signal.artifactIds,
    ] as DecisionOutcomeSignalled["artifactIds"],
  });
}
