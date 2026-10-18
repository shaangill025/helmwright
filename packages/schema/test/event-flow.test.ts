import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Q68(b): the declared event flow names only known types, and every schema kind is a node.
const schemas = join(dirname(fileURLToPath(import.meta.url)), "..", "schemas");
const read = (name: string): unknown =>
  JSON.parse(readFileSync(join(schemas, name), "utf8"));
const flow = read("event-flow.json") as {
  groups: { group: string; types: string[]; edges: string[] }[];
};
const CODE_ONLY = "code-only";

/** Every `"kind": { "const": ... }` in a schema, other than the "none" attestation. */
function kinds(node: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(node)) {
    for (const item of node) kinds(item, found);
  } else if (typeof node === "object" && node !== null) {
    for (const [key, value] of Object.entries(node)) {
      const constant: unknown =
        typeof value === "object" && value !== null
          ? (value as Record<string, unknown>)["const"]
          : undefined;
      if (key === "kind" && typeof constant === "string") found.add(constant);
      kinds(value, found);
    }
  }
  return found;
}
const schemaKinds = (group: string) =>
  [...kinds(read(group + ".schema.json"))].filter((k) => k !== "none").sort();

const nodes = flow.groups.flatMap((g) => g.types);
const edges = flow.groups.flatMap((g) => g.edges);

describe("event-flow.json (Q68(b))", () => {
  it("lists each schema group's kinds exactly, and a code-only group", () => {
    const names = flow.groups.map((g) => g.group);
    expect(names).toContain(CODE_ONLY);
    for (const { group, types } of flow.groups) {
      if (group === CODE_ONLY) continue;
      expect([...types].sort(), group).toEqual(schemaKinds(group));
    }
  });

  it("covers every event-schema kind as a node", () => {
    for (const group of [
      "permission",
      "intake",
      "object",
      "floor",
      "tool",
      "provisional",
    ]) {
      for (const kind of schemaKinds(group + "-event")) {
        expect(nodes, kind).toContain(kind);
      }
    }
  });

  it("lists no node twice and no code-only type that is a schema kind", () => {
    expect(new Set(nodes).size).toBe(nodes.length);
    const code = flow.groups.find((g) => g.group === CODE_ONLY)?.types ?? [];
    const all = flow.groups
      .filter((g) => g.group !== CODE_ONLY)
      .flatMap((g) => schemaKinds(g.group));
    expect(code.filter((type) => all.includes(type))).toEqual([]);
  });

  it("has no duplicate edge and no edge to or from an unknown node", () => {
    expect(new Set(edges).size).toBe(edges.length);
    for (const { group, types, edges: own } of flow.groups) {
      for (const edge of own) {
        const [from, to, ...rest] = edge.split(" -> ");
        expect(rest, edge).toEqual([]);
        expect(types, `${edge} is listed under ${group}`).toContain(from);
        expect(nodes, edge).toContain(to);
      }
    }
  });
});
