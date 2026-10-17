import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Event } from "@helmwright/schema";
import { expect } from "vitest";

const FLOW = new URL(
  "../../../schema/schemas/event-flow.json",
  import.meta.url,
);

/** Q68(b): observed ⊆ declared; each consecutive pair of types in every e2e log is a declared edge. */
export function expectFlowDeclared(events: readonly Event[]): void {
  const flow = JSON.parse(readFileSync(fileURLToPath(FLOW), "utf8")) as {
    groups: { edges: string[] }[];
  };
  const declared = new Set(flow.groups.flatMap((g) => g.edges));
  const missing = events
    .slice(1)
    .map((e, i) => `${events[i]?.type ?? ""} -> ${e.type}`)
    .filter((edge) => !declared.has(edge));
  expect([...new Set(missing)], "undeclared event-flow edges").toEqual([]);
}
