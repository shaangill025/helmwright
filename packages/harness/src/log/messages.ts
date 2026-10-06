import { isDeepStrictEqual } from "node:util";
import type { Event } from "@helmwright/schema";
import type { Message } from "../loop/types.ts";

/** Event type whose payload `{ message }` adds one message to a run's context. */
export const MESSAGE_APPENDED = "message.appended";
const STATUSES: readonly unknown[] = ["ok", "denied", "error"];

/** The outgoing context differs from a fresh derivation from the log. */
export class DesyncError extends Error {
  readonly index: number;
  constructor(index: number) {
    super(`context desync at message index ${String(index)}`);
    this.name = "DesyncError";
    this.index = index;
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

/** Derives a run's model context from its `message.appended` events, in the order given. */
export function deriveMessages(
  events: readonly Event[],
  runId: string,
): Message[] {
  const messages: Message[] = [];
  for (const event of events) {
    if (event.runId !== runId || event.type !== MESSAGE_APPENDED) continue;
    const { payload } = event;
    const message = payload["message"];
    if (!keysAre(payload, ["message"]) || !isMessage(message)) {
      throw new TypeError(
        `malformed ${MESSAGE_APPENDED} event at seq ${String(event.seq)}`,
      );
    }
    messages.push(message);
  }
  return messages;
}

/** Dev-mode check: throws a DesyncError at the first index where `sent` and `derived` differ. */
export function assertNoDesync(
  sent: readonly Message[],
  derived: readonly Message[],
): void {
  const length = Math.max(sent.length, derived.length);
  for (let i = 0; i < length; i += 1) {
    if (!isDeepStrictEqual(sent[i], derived[i])) throw new DesyncError(i);
  }
}
