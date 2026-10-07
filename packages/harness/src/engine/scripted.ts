import { readFileSync } from "node:fs";
import type { Engine, EngineTurn, ToolCall } from "../loop/types.ts";

/** One scripted engine step; `delayMs` simulates a slow engine before the turn arrives. */
export interface ScriptedTurn extends EngineTurn {
  readonly delayMs?: number;
}

type Fields = Record<string, unknown>;
const isRecord = (v: unknown): v is Fields =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function onlyKeys(v: Fields, allowed: readonly string[], where: string): void {
  for (const key of Object.keys(v)) {
    if (!allowed.includes(key)) {
      throw new TypeError(`${where}: unknown key "${key}"`);
    }
  }
}

function parseCall(v: unknown, where: string): ToolCall {
  if (!isRecord(v)) throw new TypeError(`${where}: must be an object`);
  onlyKeys(v, ["id", "name", "input"], where);
  const { id, name, input } = v;
  if (
    typeof id !== "string" ||
    typeof name !== "string" ||
    input === undefined
  ) {
    throw new TypeError(`${where}: needs string id, string name and an input`);
  }
  return { id, name, input };
}

function parseTurn(v: unknown, where: string): ScriptedTurn {
  if (!isRecord(v)) throw new TypeError(`${where}: must be an object`);
  onlyKeys(v, ["text", "toolCalls", "claimsDone", "delayMs"], where);
  const { text, toolCalls, claimsDone, delayMs } = v;
  if (typeof text !== "string" || typeof claimsDone !== "boolean") {
    throw new TypeError(`${where}: needs string text and boolean claimsDone`);
  }
  if (!Array.isArray(toolCalls)) {
    throw new TypeError(`${where}: toolCalls must be an array`);
  }
  const calls = toolCalls.map((c, i) =>
    parseCall(c, `${where}.toolCalls[${String(i)}]`),
  );
  const turn = { text, toolCalls: calls, claimsDone };
  if (delayMs === undefined) return turn;
  if (!Number.isSafeInteger(delayMs) || (delayMs as number) < 0) {
    throw new TypeError(`${where}: delayMs must be a non-negative integer`);
  }
  return { ...turn, delayMs: delayMs as number };
}

/** Validates a scripted-engine file's JSON: a non-empty array of turns. */
export function parseScript(value: unknown): ScriptedTurn[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError("script: must be a non-empty array of turns");
  }
  return value.map((turn, i) => parseTurn(turn, `script[${String(i)}]`));
}

/** Waits `ms`, rejecting as soon as `signal` aborts (the timer is cleared). */
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("scripted engine step aborted"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * The CI engine: replays `turns` in order, one per step; a step past the end
 * throws (the run fails rather than inventing a turn).
 */
export function createScriptedEngine(turns: readonly ScriptedTurn[]): Engine {
  let next = 0;
  return {
    async step({ signal }) {
      const turn = turns[next];
      if (turn === undefined) {
        throw new Error(
          `scripted engine exhausted after ${String(turns.length)} turns`,
        );
      }
      next += 1;
      if (turn.delayMs !== undefined) await delay(turn.delayMs, signal);
      return {
        text: turn.text,
        toolCalls: turn.toolCalls,
        claimsDone: turn.claimsDone,
      };
    },
  };
}

/** @throws if `path` cannot be read or is not a valid script. */
export function loadScriptedEngine(path: string): Engine {
  const json: unknown = JSON.parse(readFileSync(path, "utf8"));
  return createScriptedEngine(parseScript(json));
}
