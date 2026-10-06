import { describe, expect, it } from "vitest";
import { validateEvent, type Event } from "../src/index.ts";

const event: Event = {
  schemaVersion: 1,
  eventId: "evt_01",
  seq: 0,
  graphId: "graph_01",
  runId: "run_01",
  nodeId: "node_01",
  type: "run.started",
  at: "2026-10-06T12:00:00.000Z",
  payload: {},
};

function without(key: keyof Event): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(event).filter(([name]) => name !== key),
  );
}

describe("Event envelope", () => {
  it("accepts a well-formed event", () => {
    expect(validateEvent(event)).toBe(true);
  });

  it.each(["graphId", "runId", "nodeId"] as const)(
    "rejects an event without %s",
    (key) => {
      expect(validateEvent(without(key))).toBe(false);
    },
  );

  it("rejects an empty identifier", () => {
    expect(validateEvent({ ...event, runId: "" })).toBe(false);
  });

  it("rejects unknown properties", () => {
    expect(validateEvent({ ...event, extra: true })).toBe(false);
  });

  it.each([-1, 1.5])("rejects seq %s", (seq) => {
    expect(validateEvent({ ...event, seq })).toBe(false);
  });

  it("rejects a timestamp without the UTC designator", () => {
    expect(validateEvent({ ...event, at: "2026-10-06T12:00:00+02:00" })).toBe(
      false,
    );
  });

  it("rejects an undotted event type", () => {
    expect(validateEvent({ ...event, type: "started" })).toBe(false);
  });

  it("reports why validation failed", () => {
    validateEvent(without("nodeId"));
    expect(validateEvent.errors?.length).toBeGreaterThan(0);
  });
});
