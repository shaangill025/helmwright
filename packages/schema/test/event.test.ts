import { describe, expect, expectTypeOf, it } from "vitest";
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

  it("accepts a timestamp produced by Date.prototype.toISOString", () => {
    const at = new Date(Date.UTC(2026, 11, 31, 23, 59, 59, 999)).toISOString();
    expect(validateEvent({ ...event, at })).toBe(true);
  });

  it.each(Object.keys(event) as (keyof Event)[])(
    "rejects an event without %s",
    (key) => {
      expect(validateEvent(without(key))).toBe(false);
    },
  );

  it.each([null, [], "event", 1])("rejects the non-object %j", (value) => {
    expect(validateEvent(value)).toBe(false);
  });

  it("rejects unknown properties", () => {
    expect(validateEvent({ ...event, extra: true })).toBe(false);
  });

  it.each([2, "1"])("rejects schemaVersion %j", (schemaVersion) => {
    expect(validateEvent({ ...event, schemaVersion })).toBe(false);
  });

  it.each([-1, 1.5, 2 ** 53])("rejects seq %s", (seq) => {
    expect(validateEvent({ ...event, seq })).toBe(false);
  });

  it("accepts the largest safe seq", () => {
    expect(validateEvent({ ...event, seq: Number.MAX_SAFE_INTEGER })).toBe(
      true,
    );
  });

  it("accepts a 128-character identifier and rejects 129", () => {
    expect(validateEvent({ ...event, runId: "r".repeat(128) })).toBe(true);
    expect(validateEvent({ ...event, runId: "r".repeat(129) })).toBe(false);
  });

  it.each(["", "-run", "_run", "run 1", "rün"])(
    "rejects the identifier %j",
    (runId) => {
      expect(validateEvent({ ...event, runId })).toBe(false);
    },
  );

  it.each(["started", "Run.started", "run.", "run..started", ".run"])(
    "rejects the event type %j",
    (type) => {
      expect(validateEvent({ ...event, type })).toBe(false);
    },
  );

  it.each([
    "2026-10-06T12:00:00+02:00",
    "2026-10-06T12:00:00Z",
    "2026-10-06T12:00:00.0Z",
    "2026-13-06T12:00:00.000Z",
    "2026-10-32T12:00:00.000Z",
    "2026-10-06T24:00:00.000Z",
    "2026-10-06T12:60:00.000Z",
    "2026-10-06T12:00:60.000Z",
  ])("rejects the timestamp %j", (at) => {
    expect(validateEvent({ ...event, at })).toBe(false);
  });

  it.each([[], null, "payload"])("rejects the payload %j", (payload) => {
    expect(validateEvent({ ...event, payload })).toBe(false);
  });

  it("reports why validation failed", () => {
    validateEvent(without("nodeId"));
    expect(validateEvent.errors?.[0]?.params).toEqual({
      missingProperty: "nodeId",
    });
  });

  it("narrows unknown input to Event", () => {
    const input: unknown = JSON.parse(JSON.stringify(event));
    if (validateEvent(input)) {
      expectTypeOf(input).toEqualTypeOf<Event>();
    } else {
      expect.unreachable();
    }
  });
});
