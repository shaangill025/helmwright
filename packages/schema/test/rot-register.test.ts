import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  validateRotRegister as validate,
  type RotRegister,
  type RotRegisterEntry,
} from "../src/index.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const repoPath = (path: string) => relative(root, path).split(sep).join("/");

/**
 * Every module the register must cover (Q60): each packages/*\/src/**\/*.ts, each
 * schema and the sandbox Dockerfile. Generated files are not modules.
 */
function modules(): string[] {
  const found: string[] = [];
  for (const pkg of readdirSync(join(root, "packages"))) {
    const src = join(root, "packages", pkg, "src");
    if (!existsSync(src)) continue;
    for (const entry of readdirSync(src, {
      recursive: true,
      withFileTypes: true,
    })) {
      if (entry.isFile() && entry.name.endsWith(".ts")) {
        found.push(repoPath(join(entry.parentPath, entry.name)));
      }
    }
  }
  const schemas = join(root, "packages", "schema", "schemas");
  for (const name of readdirSync(schemas)) {
    if (name.endsWith(".schema.json"))
      found.push(repoPath(join(schemas, name)));
  }
  const dockerfile = join(root, "packages", "harness", "sandbox", "Dockerfile");
  if (existsSync(dockerfile)) found.push(repoPath(dockerfile));
  return found.sort();
}

/** A component covers its own path and, as a directory, every path below it. */
const covers = (component: string, path: string) =>
  path === component || path.startsWith(`${component}/`);

const uncovered = (register: readonly RotRegisterEntry[], paths: string[]) =>
  paths.filter((path) => !register.some((e) => covers(e.component, path)));

const missing = (register: readonly RotRegisterEntry[]) =>
  register
    .map((e) => e.component)
    .filter((component) => !existsSync(join(root, component)));

/** Q60 amendment: an entry's key is its component and facet; no facet is a key too. */
const key = (e: RotRegisterEntry) =>
  e.facet === undefined ? e.component : e.component + "#" + e.facet;

const duplicates = (register: readonly RotRegisterEntry[]) =>
  register.map(key).filter((name, index, all) => all.indexOf(name) !== index);

function load(): RotRegister {
  const data: unknown = JSON.parse(
    readFileSync(join(root, "rot-register.json"), "utf8"),
  );
  if (!validate(data)) {
    throw new Error(`rot-register.json: ${JSON.stringify(validate.errors)}`);
  }
  return data;
}

const register = load();
const [entry] = register;

describe("rot-register.json", () => {
  it("covers every module with at least one entry", () => {
    expect(uncovered(register, modules())).toEqual([]);
  });

  it("names only paths that exist", () => {
    expect(missing(register)).toEqual([]);
  });

  it("names each component and facet once", () => {
    expect(duplicates(register)).toEqual([]);
  });
});

describe("rot register checks", () => {
  it("finds the sources, schemas and Dockerfile, and no generated file", () => {
    const paths = modules();
    expect(paths).toContain("packages/schema/src/index.ts");
    expect(paths).toContain("packages/harness/src/loop/loop.ts");
    expect(paths).toContain("packages/schema/schemas/rot-register.schema.json");
    expect(paths).toContain("packages/harness/sandbox/Dockerfile");
    expect(paths.filter((path) => path.includes("/generated/"))).toEqual([]);
  });

  it("reports a module that no entry covers", () => {
    const path = "packages/harness/sandbox/Dockerfile";
    const without = register.filter((e) => !covers(e.component, path));
    expect(uncovered(without, modules())).toEqual([path]);
  });

  it("covers a path below a directory component, not a name prefix", () => {
    expect(
      covers("packages/harness/src/log", "packages/harness/src/log/a.ts"),
    ).toBe(true);
    expect(
      covers("packages/harness/src/lo", "packages/harness/src/log/a.ts"),
    ).toBe(false);
  });

  it("reports an entry whose path was removed", () => {
    const gone = { ...entry, component: "packages/harness/src/removed.ts" };
    expect(missing([...register, gone])).toEqual([gone.component]);
  });

  it("reports a repeated component without a facet", () => {
    expect(entry.facet).toBeUndefined();
    expect(duplicates([...register, entry])).toEqual([entry.component]);
  });

  it("allows facets of one component, not a repeated facet (Q60 amendment)", () => {
    const [a, b] = [
      { ...entry, facet: "a" },
      { ...entry, facet: "b-2" },
    ];
    expect(validate([a, b])).toBe(true);
    expect(duplicates([a, b])).toEqual([]);
    expect(duplicates([a, b, a])).toEqual([entry.component + "#a"]);
  });
});

describe("RotRegister schema", () => {
  it.each(["2026-13-01", "2026-10-7", "2026-10-32", "07-10-2026", ""])(
    "rejects the date %j",
    (date) => {
      expect(validate([{ ...entry, added: date }])).toBe(false);
      expect(validate([{ ...entry, lastReviewed: date }])).toBe(false);
    },
  );

  it.each([
    "/packages",
    "../x",
    "a/../b",
    "./a",
    "a/.",
    "a\\b",
    "a//b",
    "a/",
    "",
  ])("rejects the component %j", (component) => {
    expect(validate([{ ...entry, component }])).toBe(false);
  });

  it.each([
    { ring: 3 },
    { ring: "0" },
    { assumption: "" },
    { assumption: " leading space" },
    { evidence: [] },
    { evidence: [""] },
    { reviewTrigger: [] },
    { reviewTrigger: ["weekly"] },
    { owner: "me" },
    { facet: "" },
    { facet: "Git" },
    { facet: "a_b" },
    { facet: "-a" },
    { facet: "a-" },
    { facet: "a--b" },
    { facet: "a".repeat(33) },
    { facet: 1 },
  ])("rejects an entry with %j", (change) => {
    expect(validate([{ ...entry, ...change }])).toBe(false);
  });

  it.each(Object.keys(entry))("rejects an entry without %s", (key) => {
    const partial = Object.entries(entry).filter(([name]) => name !== key);
    expect(validate([Object.fromEntries(partial)])).toBe(false);
  });

  it.each([[], {}, null])("rejects the register %j", (value) => {
    expect(validate(value)).toBe(false);
  });
});
