import { describe, expect, it } from "vitest";
import type { Event } from "@helmwright/schema";
import { AFTER_REFUSALS, attachedRecord } from "../../src/run/after.ts";

let seq = 0;
const event = (runId: string, type: string, payload: object): Event =>
  ({
    ...{ schemaVersion: 1, eventId: "e" + String(seq), graphId: "g" },
    ...{ seq: seq++, runId, nodeId: "n", type, at: "2026-01-01T00:00:00.000Z" },
    payload,
  }) as Event;

const commit = "c".repeat(40);
const plan = { decisionId: "decision-1", commit };
const forked = (): Event[] => {
  seq = 0;
  return [
    event("run-1", "run.started", { repo: "/repo" }),
    event("run-1", "decision.opened", {
      ...{ id: "decision-1", authority: "owner", class: "technology" },
      source: "floor",
    }),
    event("run-1", "provisional.opened", {
      ...{ kind: "provisional.opened", decisionId: "decision-1", commit },
      ref: "refs/helmwright/provisional/decision-1",
    }),
  ];
};

describe("attachedRecord (PB-2b race check)", () => {
  it("returns the attached record of an unresolved decision", () => {
    expect(attachedRecord(forked(), plan, "run-2")).toEqual({
      type: "provisional.attached",
      payload: {
        ...{ kind: "provisional.attached", decisionId: "decision-1" },
        runId: "run-2",
        commit,
      },
    });
  });

  it("refuses a decision that a logged provisional.resolved resolved", () => {
    const events = [
      ...forked(),
      event("run-x", "provisional.resolved", {
        ...{ kind: "provisional.resolved", decisionId: "decision-1" },
        ...{ outcome: "discarded", chosenOption: "b" },
        resolvedBy: "owner-tty:none",
      }),
    ];
    expect(() => attachedRecord(events, plan, "run-2")).toThrow(
      "run refused: " + AFTER_REFUSALS.resolved,
    );
  });

  it("ignores the resolve of another decision", () => {
    const events = [
      ...forked(),
      event("run-x", "provisional.resolved", {
        ...{ kind: "provisional.resolved", decisionId: "decision-9" },
        ...{ outcome: "discarded", chosenOption: "b" },
        resolvedBy: "owner-tty:none",
      }),
    ];
    expect(attachedRecord(events, plan, "run-2").type).toBe(
      "provisional.attached",
    );
  });
});
