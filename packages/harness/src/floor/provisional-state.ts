import type { Event } from "@helmwright/schema";

// Ring 0 (PB-2a): which decision a run waits on is a pure function of logged facts. No
// file, git or clock is read, so replay and the later `--after` and `resolve` steps agree.

/** The owner's answer to a provisional decision, as `provisional.resolved` logs it. */
export interface ResolvedFact {
  readonly seq: number;
  readonly outcome: string;
  readonly chosenOption: string;
}

/** One owner decision, as its `decision.opened` and provisional events show it. */
export interface DecisionState {
  readonly id: string;
  readonly class: string;
  /** The run that opened it. */
  readonly runId: string;
  /** That run's `run.started.repo`, if it started. */
  readonly repo?: string;
  /** `opened`: a fork exists; `refused`: refused at the cap; `none`: neither logged. */
  readonly fork: "opened" | "refused" | "none";
  readonly commit?: string;
  readonly ref?: string;
  readonly resolved?: ResolvedFact;
}

/** The decision a run was built on: its first `provisional.attached`. */
export interface AttachedRun {
  readonly runId: string;
  readonly decisionId: string;
  readonly commit: string;
  readonly seq: number;
}

export interface ProvisionalState {
  /** Owner decisions by ID, in log order. */
  readonly decisions: ReadonlyMap<string, DecisionState>;
  /** By run ID. */
  readonly attached: ReadonlyMap<string, AttachedRun>;
  /** Runs whose `run.terminated` is `completed`. */
  readonly completed: ReadonlySet<string>;
  /** Decision IDs `runId` waits on: its attached decision, then that decision's run's. */
  chain(runId: string): string[];
  /** True while any decision in `chain(runId)` is unresolved. */
  provisional(runId: string): boolean;
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

/**
 * Reads the provisional facts of a whole log (`events` in log order). The first
 * `provisional.attached` of a run and the first `provisional.resolved` of a decision count;
 * a later one is replay's fault, not state. A chain stops at a run it has already seen.
 */
export function provisionalState(events: readonly Event[]): ProvisionalState {
  const decisions = new Map<string, DecisionState>();
  const attached = new Map<string, AttachedRun>();
  const completed = new Set<string>();
  const repos = new Map<string, string>();
  for (const e of events) {
    const p = e.payload;
    if (e.type === "run.started") {
      const repo = str(p["repo"]);
      if (repo !== undefined && !repos.has(e.runId)) repos.set(e.runId, repo);
    } else if (e.type === "run.terminated") {
      const terminal: unknown = p["terminal"];
      if (
        (terminal as Record<string, unknown> | null)?.["kind"] === "completed"
      ) {
        completed.add(e.runId);
      }
    } else if (e.type === "decision.opened" && p["authority"] === "owner") {
      const id = str(p["id"]);
      if (id !== undefined && !decisions.has(id)) {
        decisions.set(id, {
          id,
          class: str(p["class"]) ?? "",
          runId: e.runId,
          fork: "none",
        });
      }
    } else if (e.type === "provisional.attached") {
      const decisionId = str(p["decisionId"]);
      const commit = str(p["commit"]);
      if (decisionId !== undefined && commit !== undefined) {
        if (!attached.has(e.runId)) {
          attached.set(e.runId, {
            runId: e.runId,
            decisionId,
            commit,
            seq: e.seq,
          });
        }
      }
    }
  }
  for (const e of events) {
    const id = str(e.payload["decisionId"]);
    const d = id === undefined ? undefined : decisions.get(id);
    if (id === undefined || d === undefined) continue;
    if (e.type === "provisional.opened" && d.fork === "none") {
      const commit = str(e.payload["commit"]);
      const ref = str(e.payload["ref"]);
      decisions.set(id, {
        ...d,
        fork: "opened",
        ...(commit === undefined ? {} : { commit }),
        ...(ref === undefined ? {} : { ref }),
      });
    } else if (e.type === "provisional.refused" && d.fork === "none") {
      decisions.set(id, { ...d, fork: "refused" });
    } else if (e.type === "provisional.resolved" && d.resolved === undefined) {
      decisions.set(id, {
        ...d,
        resolved: {
          seq: e.seq,
          outcome: str(e.payload["outcome"]) ?? "",
          chosenOption: str(e.payload["chosenOption"]) ?? "",
        },
      });
    }
  }
  for (const [id, d] of decisions) {
    const repo = repos.get(d.runId);
    if (repo !== undefined) decisions.set(id, { ...d, repo });
  }
  const chain = (runId: string): string[] => {
    const out: string[] = [];
    const seen = new Set<string>();
    let run: string | undefined = runId;
    while (run !== undefined && !seen.has(run)) {
      seen.add(run);
      const a = attached.get(run);
      if (a === undefined) break;
      out.push(a.decisionId);
      run = decisions.get(a.decisionId)?.runId;
    }
    return out;
  };
  const provisional = (runId: string): boolean =>
    chain(runId).some((id) => decisions.get(id)?.resolved === undefined);
  return { decisions, attached, completed, chain, provisional };
}
