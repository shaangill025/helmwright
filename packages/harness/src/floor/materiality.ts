import { createHash, createHmac } from "node:crypto";
import type {
  DecisionBrief,
  DecisionOpened,
  FloorDependencyAdded,
  FloorDependencyMajorBump,
  FloorSignal,
  FloorSignalled,
  Ruling,
} from "@helmwright/schema";
import {
  ObjectEventError,
  decisionOpened,
  footprintAddress,
} from "../objects/events.ts";
import { deepFreeze } from "../permission/policy.ts";
import type { DependencySignal } from "./dependencies.ts";
import { FloorError } from "./events.ts";

/**
 * Q53 materiality (A-dep): which floor signal opens an owner Brief and which a harness
 * Ruling, and their template text. Ring 0 and pure: replay recomputes the route, every
 * Ruling and every Brief field but the seed and the commitment, so any change of rule or
 * wording is a new rubric version (OQ-AD-4).
 */
export const MATERIALITY_RUBRIC = "materiality-rubric-2";
/** Every version replay recomputes by: rubric-1 wording is pinned; rubric-2 adds the Brief claims (Q70-1). */
export const MATERIALITY_RUBRICS: readonly string[] = deepFreeze([
  "materiality-rubric-1",
  MATERIALITY_RUBRIC,
]);

/** The `decisions.briefThreshold` values (OQ-AD-5); the config admits only the first until a fixture exists. */
export type BriefThreshold = FloorSignalled["materiality"]["threshold"];
export const BRIEF_THRESHOLDS: readonly BriefThreshold[] = deepFreeze([
  "runtimeAddOrMajor",
  "everySignal",
  "runtimeAddOnly",
]);

/** The template recommendation (OQ-AD-3): keep what the run did, at low confidence. */
const RECOMMENDED = "a";
/** The shortest HMAC key the nonce accepts, in bytes. */
const MIN_KEY = 32;
const ELLIPSIS = "…";

/**
 * The route of `signal` under `threshold` (Q53): `runtimeAddOrMajor` briefs a runtime
 * add and any major bump (a dev one too) and rules a dev add and a lockfile-only change;
 * `everySignal` briefs all; `runtimeAddOnly` briefs a runtime add only.
 */
export function route(
  signal: DependencySignal,
  threshold: BriefThreshold,
): "brief" | "ruling" {
  if (threshold === "everySignal") return "brief";
  const runtimeAdd = signal.type === "dependency.added" && signal.runtime;
  if (runtimeAdd) return "brief";
  return threshold === "runtimeAddOrMajor" &&
    signal.type === "dependency.majorBump"
    ? "brief"
    : "ruling";
}

/** The ID of the floor decision of the run `runId`'s signal `index`: `decision-floor-<run uuid>-<index>`. */
export function floorDecisionId(runId: string, index: number): string {
  if (!runId.startsWith("run-") || runId.length === "run-".length) {
    throw new FloorError("decision.opened cannot be logged: not a run ID");
  }
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new FloorError("decision.opened cannot be logged: not an index");
  }
  return "decision-floor-" + runId.slice("run-".length) + "-" + String(index);
}

/**
 * The recommendation nonce of `decisionId` (OQ-AD-3): HMAC-SHA256 of its UTF-8 bytes under
 * `key`, as 64 lowercase hex digits, so A3 can derive it again. Loading the key is A-dep-2b's.
 * @throws FloorError for a key under MIN_KEY bytes
 */
export function recommendationNonce(
  key: Uint8Array,
  decisionId: string,
): string {
  if (key.length < MIN_KEY) {
    throw new FloorError("the recommendation key is under 32 bytes");
  }
  return createHmac("sha256", key).update(decisionId, "utf8").digest("hex");
}

/** The salted commitment (OD-3): SHA-256 of the UTF-8 bytes of `JSON.stringify([decisionId, optionId, nonce])`. */
export function recommendationCommitment(
  decisionId: string,
  optionId: string,
  nonce: string,
): string {
  return createHash("sha256")
    .update(JSON.stringify([decisionId, optionId, nonce]), "utf8")
    .digest("hex");
}

/** `text` cut to `max` code points, the last one "…" if cut. */
function clip(text: string, max: number): string {
  const points = Array.from(text);
  return points.length <= max
    ? text
    : points.slice(0, max - 1).join("") + ELLIPSIS;
}

const UNCERTAINTY =
  "The harness did not check the package's licence, upkeep, size or known vulnerabilities.";
const BLOCKED = "Merging this run's candidate and work that builds on ";
/** The longest `line` (OD-5), less BLOCKED and its full stop. */
const BLOCKED_NAME = 200 - Array.from(BLOCKED).length - 1;
/** The longest option label (OD-5), less "Keep ". */
const KEEP_NAME = 80 - "Keep ".length;

/** The signal-specific parts of a Brief, as the owner approved them (OQ-AD-4; the bump trade-offs OQ-AD-13). */
function template(signal: FloorDependencyAdded | FloorDependencyMajorBump): {
  readonly question: string;
  readonly options: DecisionBrief["options"];
  readonly costIfWrong: string;
  readonly concept: string;
} {
  if (signal.type === "dependency.added") {
    const { name, to, path } = signal;
    return {
      question: `Add runtime dependency ${clip(name, 60)} (${clip(to, 32)}) in ${clip(path, 32)}?`,
      options: [
        {
          id: "a",
          label: "Keep " + clip(name, KEEP_NAME),
          tradeoffs:
            "The run's code stays; the project takes on the package's code, licence, updates and security fixes.",
        },
        {
          id: "b",
          label: "Remove it and write the code in the project",
          tradeoffs:
            "No new dependency; the run's change is redone with project code to write, test and keep up.",
        },
        {
          id: "c",
          label: "Use a different package",
          tradeoffs:
            "The owner names another package; the run's change is redone against it.",
        },
      ],
      costIfWrong:
        "Removing the package later means rewriting the code that calls it and its tests.",
      concept: "runtime-dependency",
    };
  }
  const { name, from, to, path } = signal;
  return {
    question: `Bump ${clip(name, 48)} from ${clip(from, 24)} to ${clip(to, 24)} (major) in ${clip(path, 32)}?`,
    options: [
      {
        id: "a",
        label: "Keep the new major version",
        tradeoffs:
          "The run's code stays; the project takes on the new major version's breaking changes.",
      },
      {
        id: "b",
        label: "Stay on the previous major version",
        tradeoffs:
          "The run's change is redone against the previous major version, which may stop getting fixes.",
      },
    ],
    costIfWrong:
      "Undoing the upgrade later means reverting code changed for the new major version.",
    concept: "semver-major",
  };
}

/**
 * The claims of a runtime add or a major bump under materiality-rubric-2 (Q70-1): a fixed,
 * pure table. A Direct claim cites the signal ID (the log holds it from `floor.signalled`);
 * the Unknown claim says what the harness did not check; the Inferred claim reasons from
 * the Direct one (`claim:0`) and restates the Brief's cost if wrong.
 */
function briefClaims(
  signal: FloorDependencyAdded | FloorDependencyMajorBump,
  fixed: { readonly costIfWrong: string },
): NonNullable<DecisionBrief["claims"]> {
  const path = clip(signal.path, 32);
  const name = clip(signal.name, 60);
  const direct =
    signal.type === "dependency.added"
      ? `Manifest ${path} adds ${name} ${clip(signal.to, 32)}`
      : `Manifest ${path} changes ${clip(signal.name, 48)} from ${clip(signal.from, 24)} to ${clip(signal.to, 24)}`;
  const unchecked =
    signal.type === "dependency.added"
      ? UNCERTAINTY
      : "The harness did not check the new major version's breaking changes or release notes.";
  return [
    { text: direct, tier: "Direct", evidence: [signal.id] },
    { text: unchecked, tier: "Unknown", evidence: [] },
    { text: fixed.costIfWrong, tier: "Inferred", evidence: ["claim:0"] },
  ];
}

/** What the Brief of a floor decision needs beyond its signal. */
interface BriefContext {
  readonly decisionId: string;
  readonly repoId: string;
  /**
   * The changed lockfile paths as shown text (already escaped with displayText, as
   * `signal.path` is), each also a proposed `footprint.file` with that text as its ref.
   */
  readonly lockfiles: readonly string[];
  /** The option order seed: 128 random bits as 32 lowercase hex digits. */
  readonly seed: string;
  /** The recommendation key (see `recommendationNonce`). */
  readonly key: Uint8Array;
}

/**
 * The template Brief of a runtime add or a major bump (spec §4): every field is fixed by
 * the rubric version and the signal but the seed and the commitment; a model fills nothing.
 * @throws FloorError for another signal (its template comes with the `everySignal` fixture)
 */
function floorBrief(
  signal: FloorSignal,
  context: BriefContext,
  rubric: string,
): DecisionBrief {
  if (
    signal.type === "lockfile.only" ||
    (signal.type === "dependency.added" && !signal.runtime)
  ) {
    throw new FloorError("decision.opened cannot be logged: no Brief template");
  }
  const fixed = template(signal);
  const { decisionId, repoId } = context;
  const nonce = recommendationNonce(context.key, decisionId);
  const file = (path: string) =>
    footprintAddress("footprint.file", repoId, path).id;
  const lockfiles = [...new Set(context.lockfiles)].sort();
  return {
    question: fixed.question,
    options: fixed.options,
    recommendationSha256: recommendationCommitment(
      decisionId,
      RECOMMENDED,
      nonce,
    ),
    optionOrderSeed: context.seed,
    confidence: "low",
    costIfWrong: fixed.costIfWrong,
    reversibility: "costly",
    uncertainty: UNCERTAINTY,
    blocked: BLOCKED + clip(signal.name, BLOCKED_NAME) + ".",
    concepts: [fixed.concept],
    proposedFootprint: [
      ...new Set([
        footprintAddress("footprint.dependency", repoId, signal.name).id,
        file(signal.path),
        ...lockfiles.map(file),
      ]),
    ],
    // Q70-1: rubric-1 Briefs have no claims, so an old log replays unchanged.
    ...(rubric === MATERIALITY_RUBRIC
      ? { claims: briefClaims(signal, fixed) }
      : {}),
  };
}

/**
 * The Ruling of a dev add or a lockfile-only change (spec §4): what, why (the rubric,
 * threshold and rule, then the signal ID) and the cost if wrong.
 * @throws FloorError for another signal (no Ruling template yet)
 */
function floorRuling(
  signal: FloorSignal,
  threshold: BriefThreshold,
  rubric: string,
): Ruling {
  let what: string;
  let rule: string;
  let costIfWrong: string;
  if (signal.type === "dependency.added" && !signal.runtime) {
    what =
      "Accepted the dev dependency " +
      clip(signal.name, 60) +
      " (" +
      clip(signal.to, 32) +
      ") in " +
      clip(signal.path, 32);
    rule = "a dev dependency add is under the brief threshold";
    costIfWrong =
      "If it matters, a build or test tool was added without an owner brief.";
  } else if (signal.type === "lockfile.only") {
    what = "Accepted a lockfile-only change to " + clip(signal.path, 160);
    rule = "a lockfile-only change is under the brief threshold";
    costIfWrong =
      "If it matters, a transitive version changed without an owner brief.";
  } else {
    throw new FloorError(
      "decision.opened cannot be logged: no Ruling template",
    );
  }
  const why =
    rubric + ", threshold " + threshold + ": " + rule + "\nsignal " + signal.id;
  return { what, why, costIfWrong, rubricVersion: rubric };
}

/** One floor decision's inputs: the signal with its ID, and its index in `floor.signalled`. */
export interface FloorDecisionInput {
  readonly runId: string;
  readonly taskId: string;
  readonly repoId: string;
  readonly index: number;
  readonly signal: FloorSignal;
  readonly threshold: BriefThreshold;
  /** The changed lockfile paths as shown text (see `BriefContext.lockfiles`). */
  readonly lockfiles: readonly string[];
  readonly seed: string;
  readonly key: Uint8Array;
  /** The rubric version to build by; replay passes the recorded one. Default: the current. */
  readonly rubricVersion?: string;
}

/**
 * The `decision.opened` of one floor signal (OQ-AD-8): class technology, source floor,
 * its only signal `signal.id`, and a Brief or a Ruling by `route`.
 * @throws FloorError with fixed text if there is no template or the log would refuse it
 */
export function floorDecision(input: FloorDecisionInput): DecisionOpened {
  const { runId, taskId, signal, threshold } = input;
  const rubric = input.rubricVersion ?? MATERIALITY_RUBRIC;
  if (!MATERIALITY_RUBRICS.includes(rubric)) {
    throw new FloorError("decision.opened cannot be logged: unknown rubric");
  }
  const id = floorDecisionId(runId, input.index);
  const common = {
    id,
    taskId,
    runId,
    signalIds: [signal.id],
    class: "technology" as const,
    source: "floor" as const,
  };
  try {
    return route(signal, threshold) === "brief"
      ? decisionOpened({
          ...common,
          authority: "owner",
          brief: floorBrief(signal, { ...input, decisionId: id }, rubric),
        })
      : decisionOpened({
          ...common,
          authority: "harness",
          ruling: floorRuling(signal, threshold, rubric),
        });
  } catch (error) {
    if (!(error instanceof ObjectEventError)) throw error;
    // Fixed text: "decision.opened cannot be logged: <reason>".
    throw new FloorError(error.message);
  }
}
