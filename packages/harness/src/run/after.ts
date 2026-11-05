import { existsSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Event } from "@helmwright/schema";
import { runGit } from "../config/config.ts";
import { provisionalRef } from "../floor/provisional.ts";
import { provisionalState } from "../floor/provisional-state.ts";
import { openSessionLog } from "../log/session-log.ts";

// PB-2b: `run --after <decisionId>`. Every refusal is decided from the log and the repo
// before any worktree or log write (Ring 0: a refusal writes nothing). Fixed texts.

export const AFTER_REFUSALS = {
  shape: "--after: not a decision ID",
  unknown: "--after: unknown decision",
  architecture: "--after: an architecture decision has no provisional branch",
  capped: "--after: the provisional branch was refused at the cap",
  noFork: "--after: the decision has no provisional branch",
  resolved: "--after: the decision is already resolved",
  otherRepo: "--after: the decision was opened in another repository",
  moved: "--after: the provisional ref does not match the log",
  gone: "--after: the provisional commit is missing from the repository",
} as const;

/** A refused `--after`; the caller turns it into a usage error. */
export class AfterRefused extends Error {}

/**
 * The `provisional.attached` record of a run on `plan`, decided from the logged `events`
 * alone (a pure function: run.started's transaction calls it with the log it holds, so a
 * resolve that committed after the preflight cannot slip in).
 * @throws Error "run refused: ..." if the decision is resolved in `events`.
 */
export function attachedRecord(
  events: readonly Event[],
  plan: Pick<AfterPlan, "decisionId" | "commit">,
  runId: string,
): {
  readonly type: "provisional.attached";
  readonly payload: Record<string, unknown>;
} {
  const { decisionId, commit } = plan;
  const { decisions } = provisionalState(events);
  if (decisions.get(decisionId)?.resolved !== undefined) {
    throw new Error("run refused: " + AFTER_REFUSALS.resolved);
  }
  const payload = { kind: "provisional.attached", decisionId, runId, commit };
  return { type: "provisional.attached", payload };
}

/** What a run on a provisional commit needs. */
export interface AfterPlan {
  readonly decisionId: string;
  /** The provisional commit: the run's base. */
  readonly commit: string;
  /** The decisions the run waits on: `decisionId`, then those of the run that opened it. */
  readonly chain: readonly string[];
  /** Re-creates a missing ref, create-only; the log is truth. Idempotent. */
  readonly restoreRef: () => void;
}

const git = (commonDir: string, args: readonly string[]) =>
  runGit(commonDir, ["--git-dir=" + commonDir, ...args])
    .toString("utf8")
    .trim();

/** The ref's value, or undefined if it does not exist. */
function refValue(commonDir: string, ref: string): string | undefined {
  try {
    return (
      git(commonDir, ["rev-parse", "--verify", "--quiet", ref]) || undefined
    );
  } catch {
    return undefined;
  }
}

function sameRepo(logged: string | undefined, repo: string): boolean {
  if (logged === undefined) return false;
  try {
    return realpathSync(logged) === realpathSync(repo);
  } catch {
    return false;
  }
}

/**
 * Checks `decisionId` against the log in `stateDir` and the repo at `repo`.
 * @throws AfterRefused
 */
export function preflightAfter(
  stateDir: string,
  repo: string,
  decisionId: string,
): AfterPlan {
  try {
    provisionalRef(decisionId);
  } catch {
    throw new AfterRefused(AFTER_REFUSALS.shape);
  }
  const path = join(resolve(stateDir), "session.sqlite");
  if (!existsSync(path)) throw new AfterRefused(AFTER_REFUSALS.unknown);
  const log = openSessionLog(path);
  let state;
  try {
    state = provisionalState(log.events());
  } finally {
    log.close();
  }
  const d = state.decisions.get(decisionId);
  if (d === undefined) throw new AfterRefused(AFTER_REFUSALS.unknown);
  if (d.class === "architecture") {
    throw new AfterRefused(AFTER_REFUSALS.architecture);
  }
  if (d.fork === "refused") throw new AfterRefused(AFTER_REFUSALS.capped);
  const { commit, ref } = d;
  if (d.fork !== "opened" || commit === undefined || ref === undefined) {
    throw new AfterRefused(AFTER_REFUSALS.noFork);
  }
  if (d.resolved !== undefined) throw new AfterRefused(AFTER_REFUSALS.resolved);
  if (!sameRepo(d.repo, repo)) throw new AfterRefused(AFTER_REFUSALS.otherRepo);
  const common = realpathSync(
    resolve(
      repo,
      runGit(repo, ["rev-parse", "--git-common-dir"]).toString("utf8").trim(),
    ),
  );
  const value = refValue(common, ref);
  if (value !== undefined && value !== commit) {
    throw new AfterRefused(AFTER_REFUSALS.moved);
  }
  if (
    value === undefined &&
    refValue(common, commit + "^{commit}") === undefined
  ) {
    throw new AfterRefused(AFTER_REFUSALS.gone);
  }
  const zero = "0".repeat(commit.length);
  const restoreRef = () => {
    if (value !== undefined) return;
    try {
      git(common, ["update-ref", "--no-deref", "--", ref, commit, zero]);
    } catch (error) {
      // A concurrent run may have created the same ref: equal to the log is fine.
      if (refValue(common, ref) !== commit) throw error;
    }
  };
  return {
    decisionId,
    commit,
    chain: [decisionId, ...state.chain(d.runId)],
    restoreRef,
  };
}
