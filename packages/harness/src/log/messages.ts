import { isDeepStrictEqual } from "node:util";
import type { Event } from "@helmwright/schema";
import type { Message } from "../loop/types.ts";

/** Event type whose payload `{ message }` adds one message to a run's context. */
export const MESSAGE_APPENDED = "message.appended";
const STATUSES: readonly unknown[] = ["ok", "denied", "error"];

/** The outgoing context differs from a fresh derivation from the log. */
export class DesyncError extends Error {
  readonly index: number;
  /** Seq of the logged message at `index`; `undefined` if the log has none there. */
  readonly seq: number | undefined;
  constructor(index: number, seq: number | undefined) {
    const at = seq === undefined ? "" : ` (log seq ${String(seq)})`;
    super(`context desync at message index ${String(index)}${at}`);
    this.name = "DesyncError";
    this.index = index;
    this.seq = seq;
  }
}

type Fields = Record<string, unknown>;
const isRecord = (v: unknown): v is Fields =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const keysAre = (v: Fields, keys: readonly string[]): boolean =>
  Object.keys(v).length === keys.length &&
  keys.every((k) => Object.hasOwn(v, k));

function isToolCall(v: unknown): boolean {
  return (
    isRecord(v) &&
    keysAre(v, ["id", "name", "input"]) &&
    typeof v["id"] === "string" &&
    typeof v["name"] === "string"
  );
}

/** Exact shape check: unknown keys are rejected so a derivation is lossless. */
export function isMessage(v: unknown): v is Message {
  if (!isRecord(v) || typeof v["text"] !== "string") return false;
  switch (v["role"]) {
    case "system":
    case "user":
      return keysAre(v, ["role", "text"]);
    case "assistant":
      return (
        keysAre(v, ["role", "text", "toolCalls"]) &&
        Array.isArray(v["toolCalls"]) &&
        v["toolCalls"].every(isToolCall)
      );
    case "tool":
      return (
        keysAre(v, ["role", "toolCallId", "status", "text"]) &&
        typeof v["toolCallId"] === "string" &&
        STATUSES.includes(v["status"])
      );
    default:
      return false;
  }
}

const isMessagePayload = (p: Fields): p is { message: Message } =>
  keysAre(p, ["message"]) && isMessage(p["message"]);

/** True if `payload` is a valid `{ message }` that a JSON round trip leaves unchanged. */
export function isStorableMessagePayload(payload: Fields): boolean {
  const stored: unknown = JSON.parse(JSON.stringify(payload));
  return (
    isRecord(stored) &&
    isMessagePayload(stored) &&
    isDeepStrictEqual(stored, payload)
  );
}

function deriveEntries(events: readonly Event[], runId: string) {
  const entries: { message: Message; seq: number }[] = [];
  for (const { runId: run, type, payload, seq } of events) {
    if (run !== runId || type !== MESSAGE_APPENDED) continue;
    if (!isMessagePayload(payload)) {
      throw new TypeError(
        `malformed ${MESSAGE_APPENDED} event at seq ${String(seq)}`,
      );
    }
    entries.push({ message: payload.message, seq });
  }
  return entries;
}

/** Derives a run's model context from its `message.appended` events, in the order given. */
export function deriveMessages(
  events: readonly Event[],
  runId: string,
): Message[] {
  return deriveEntries(events, runId).map((e) => e.message);
}

/** Dev-mode check: throws a DesyncError where `sent` first differs from the run's derived context. */
export function assertNoDesync(
  sent: readonly Message[],
  events: readonly Event[],
  runId: string,
): void {
  const derived = deriveEntries(events, runId);
  const length = Math.max(sent.length, derived.length);
  for (let i = 0; i < length; i += 1) {
    if (!isDeepStrictEqual(sent[i], derived[i]?.message)) {
      throw new DesyncError(i, derived[i]?.seq);
    }
  }
}
