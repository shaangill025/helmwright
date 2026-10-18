import { describe, expect, it } from "vitest";
import type { Event } from "@helmwright/schema";
import { provisionalState } from "../../src/floor/provisional-state.ts";

let seq = 0;
const event = (runId: string, type: string, payload: object): Event =>
  ({
    ...{ schemaVersion: 1, eventId: "e" + String(seq), graphId: "g" },
    ...{ seq: seq++, runId, nodeId: "n", type, at: "2026-01-01T00:00:00.000Z" },
    payload,
  }) as Event;

const oid = (c: string) => c.repeat(40);
const owner = (id: string, cls = "technology") => ({
  id,
  authority: "owner",
  class: cls,
  source: "floor",
});
const opened = (id: string, c: string) => ({
  kind: "provisional.opened",
  decisionId: id,
  class: "technology",
  commit: oid(c),
  tree: oid("b"),
  baseCommit: oid("a"),
  ref: "refs/helmwright/provisional/" + id,
});
const attached = (id: string, runId: string, c: string) => ({
  kind: "provisional.attached",
  decisionId: id,
  runId,
  commit: oid(c),
});
const resolved = (id: string, outcome = "confirmed") => ({
  kind: "provisional.resolved",
  decisionId: id,
  outcome,
  chosenOption: outcome === "confirmed" ? "a" : "b",
  resolvedBy: "owner-tty:none",
});
const started = (runId: string, repo = "/repo") =>
  event(runId, "run.started", { repo, baseCommit: oid("a") });
const ended = (runId: string, kind = "completed") =>
  event(runId, "run.terminated", { terminal: { kind } });

/** run-1 forks d1; run-2 attaches to d1 and forks d2; run-3 attaches to d2. */
function chain(): Event[] {
  seq = 0;
  return [
    started("run-1"),
    event("run-1", "decision.opened", owner("decision-1")),
    event("run-1", "provisional.opened", opened("decision-1", "c")),
    ended("run-1"),
    event("run-2", "run.recorded", { taskId: "t" }),
    event(
      "run-2",
      "provisional.attached",
      attached("decision-1", "run-2", "c"),
    ),
    started("run-2"),
    event("run-2", "decision.opened", owner("decision-2", "scope")),
    event("run-2", "provisional.opened", opened("decision-2", "d")),
    ended("run-2"),
    event(
      "run-3",
      "provisional.attached",
      attached("decision-2", "run-3", "d"),
    ),
    started("run-3"),
    ended("run-3", "failed"),
  ];
}

describe("provisionalState (PB-2a)", () => {
  it("reads decisions, forks, attached runs and terminals from the log", () => {
    const state = provisionalState(chain());
    expect([...state.decisions.keys()]).toEqual(["decision-1", "decision-2"]);
    expect(state.decisions.get("decision-1")).toMatchObject({
      class: "technology",
      runId: "run-1",
      repo: "/repo",
      fork: "opened",
      commit: oid("c"),
      ref: "refs/helmwright/provisional/decision-1",
    });
    expect(state.decisions.get("decision-2")?.class).toBe("scope");
    expect(state.attached.get("run-2")).toMatchObject({
      decisionId: "decision-1",
      commit: oid("c"),
    });
    expect([...state.attached.keys()]).toEqual(["run-2", "run-3"]);
    expect([...state.completed]).toEqual(["run-1", "run-2"]);
  });

  it("marks a refusal, a decision with no fork and an architecture decision", () => {
    seq = 0;
    const state = provisionalState([
      started("run-1"),
      event("run-1", "decision.opened", owner("decision-r")),
      event("run-1", "provisional.refused", {
        kind: "provisional.refused",
        decisionId: "decision-r",
        reason: "cap",
      }),
      event("run-1", "decision.opened", owner("decision-n")),
      event("run-1", "decision.opened", owner("decision-a", "architecture")),
      event("run-1", "decision.opened", {
        ...owner("decision-h"),
        authority: "harness",
      }),
    ]);
    expect(state.decisions.get("decision-r")?.fork).toBe("refused");
    expect(state.decisions.get("decision-n")?.fork).toBe("none");
    expect(state.decisions.get("decision-a")).toMatchObject({
      class: "architecture",
      fork: "none",
    });
    expect(state.decisions.has("decision-h")).toBe(false);
  });

  it("gives a run's chain and is provisional while any decision above is open", () => {
    const state = provisionalState(chain());
    expect(state.chain("run-1")).toEqual([]);
    expect(state.chain("run-2")).toEqual(["decision-1"]);
    expect(state.chain("run-3")).toEqual(["decision-2", "decision-1"]);
    expect(state.provisional("run-1")).toBe(false);
    expect(state.provisional("run-2")).toBe(true);
    expect(state.provisional("run-3")).toBe(true);
  });

  it("ends provisional status only when the whole chain is resolved", () => {
    const log = chain();
    seq = 100;
    const d2 = event("run-9", "provisional.resolved", resolved("decision-2"));
    const d1 = event("run-9", "provisional.resolved", resolved("decision-1"));
    const some = provisionalState([...log, d2]);
    expect(some.decisions.get("decision-2")?.resolved).toMatchObject({
      outcome: "confirmed",
      chosenOption: "a",
    });
    expect(some.provisional("run-3")).toBe(true);
    expect(some.provisional("run-2")).toBe(true);
    const all = provisionalState([...log, d2, d1]);
    expect(all.provisional("run-3")).toBe(false);
    expect(all.provisional("run-2")).toBe(false);
  });

  it("keeps the first attached and the first resolved, and stops on a cycle", () => {
    const log = chain();
    seq = 100;
    const again = event(
      "run-2",
      "provisional.attached",
      attached("decision-2", "run-2", "d"),
    );
    const first = event(
      "run-9",
      "provisional.resolved",
      resolved("decision-1", "discarded"),
    );
    const second = event(
      "run-9",
      "provisional.resolved",
      resolved("decision-1"),
    );
    const state = provisionalState([...log, again, first, second]);
    expect(state.attached.get("run-2")?.decisionId).toBe("decision-1");
    expect(state.decisions.get("decision-1")?.resolved?.outcome).toBe(
      "discarded",
    );
    // decision-1 opened by run-1, and run-1 attached to decision-2 (forged): a cycle.
    const looped = provisionalState([
      ...log,
      event(
        "run-1",
        "provisional.attached",
        attached("decision-2", "run-1", "d"),
      ),
    ]);
    expect(looped.chain("run-1")).toEqual(["decision-2", "decision-1"]);
  });

  it("counts an attach to an unknown decision as unresolved", () => {
    seq = 0;
    const state = provisionalState([
      event(
        "run-5",
        "provisional.attached",
        attached("decision-x", "run-5", "c"),
      ),
    ]);
    expect(state.decisions.size).toBe(0);
    expect(state.chain("run-5")).toEqual(["decision-x"]);
    expect(state.provisional("run-5")).toBe(true);
  });

  it("ignores opened, refused and resolved with no owner decision.opened", () => {
    seq = 0;
    const state = provisionalState([
      started("run-1"),
      event("run-1", "provisional.opened", opened("decision-g", "c")),
      event("run-1", "provisional.refused", {
        kind: "provisional.refused",
        decisionId: "decision-g",
        reason: "cap",
      }),
      event("run-9", "provisional.resolved", resolved("decision-g")),
    ]);
    expect(state.decisions.size).toBe(0);
  });

  it("is a pure function of the events: same log, same answer", () => {
    const log = chain();
    const a = provisionalState(log);
    const b = provisionalState(log);
    expect([...a.decisions]).toEqual([...b.decisions]);
    expect(a.chain("run-3")).toEqual(b.chain("run-3"));
  });
});
