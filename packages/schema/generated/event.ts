// Generated from schemas/event.schema.json by scripts/generate.ts. Do not edit.

/**
 * Opaque identifier. A pattern rather than minLength keeps generated validators free of runtime imports.
 */
export type Id = string;

/**
 * Envelope of every session-log event. Graph, run and node identity are required from the first event (design 06, Ring 0).
 */
export interface Event {
  schemaVersion: 1;
  eventId: Id;
  /**
   * Position in the session log: starts at 0, gap-free and strictly increasing.
   */
  seq: number;
  graphId: Id;
  runId: Id;
  nodeId: Id;
  /**
   * Dotted lowercase event type, e.g. `run.started`: two or more segments, each starting with a letter, at most 64 characters. Split into simple patterns so no regex nests quantifiers (ReDoS).
   */
  type: string;
  /**
   * UTC timestamp exactly as Date.prototype.toISOString() writes it (millisecond precision, `Z`), so string order is time order. No leap seconds.
   */
  at: string;
  /**
   * Event-type-specific body; typed per event kind by the object-model schemas.
   */
  payload: {
    [k: string]: unknown;
  };
}
