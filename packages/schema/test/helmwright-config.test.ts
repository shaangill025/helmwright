import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CONFIG_DEFAULTS,
  RING0_CONFIG_KEYS,
  validateHelmwrightConfig as validate,
} from "../src/index.ts";

interface Node {
  readonly type?: string;
  readonly enum?: readonly unknown[];
  readonly default?: unknown;
  readonly $comment?: string;
  readonly properties?: Readonly<Record<string, Node>>;
}

const schema = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "schemas",
      "helmwright-config.schema.json",
    ),
    "utf8",
  ),
) as Node;

/** Every setting (a node without properties) and every object level, by dotted name. */
function walk(node: Node, prefix: string[] = []) {
  const settings: [string[], Node][] = [];
  const levels: string[][] = [prefix];
  for (const [key, child] of Object.entries(node.properties ?? {})) {
    if (child.properties === undefined) {
      settings.push([[...prefix, key], child]);
    } else {
      const inner = walk(child, [...prefix, key]);
      settings.push(...inner.settings);
      levels.push(...inner.levels);
    }
  }
  return { settings, levels };
}

const { settings, levels } = walk(schema);
const enumerated = settings.filter(([, node]) => node.enum !== undefined);

/** A config that sets only `path` to `value`. */
const at = (path: readonly string[], value: unknown): unknown =>
  path.reduceRight<unknown>((inner, key) => ({ [key]: inner }), value);

const lookup = (data: unknown, path: readonly string[]): unknown =>
  path.reduce<unknown>(
    (inner, key) =>
      typeof inner === "object" && inner !== null
        ? (inner as Record<string, unknown>)[key]
        : undefined,
    data,
  );

const dotted = (path: readonly string[]) => path.join(".");

describe("HelmwrightConfig", () => {
  it("accepts the empty config (every setting takes its default)", () => {
    expect(validate({})).toBe(true);
  });

  it("accepts the defaults, and a policy override object", () => {
    expect(validate(CONFIG_DEFAULTS)).toBe(true);
    expect(validate(at(["permissions", "policy"], {}))).toBe(true);
  });

  it("lists the settings of the plan", () => {
    expect(settings.map(([path]) => dotted(path)).sort()).toEqual([
      "decisions.briefFormat",
      "decisions.detection",
      "decisions.evaluator",
      "decisions.pendingWork",
      "friction.choreDowngrade",
      "friction.defaultIntensity",
      "intake.classification",
      "ownerLoop.consequences",
      "ownerLoop.preCommitment",
      "ownerLoop.tutor",
      "permissions.policy",
      "permissions.untrustedContent.hintBytes",
      "permissions.untrustedContent.mode",
      "topology",
    ]);
  });

  // Admitting an alternative needs a fixture (07 rule 1); that is the loader's job.
  it.each(
    enumerated.flatMap(([path, node]) =>
      (node.enum ?? []).map((value) => [dotted(path), value, path] as const),
    ),
  )("accepts %s %j as schema-valid", (_name, value, path) => {
    expect(validate(at(path, value))).toBe(true);
  });

  it.each(levels.map((path) => [dotted(path) || "(top)", path] as const))(
    "rejects an unknown key at %s",
    (_name, path) => {
      const level = path.length === 0 ? {} : lookup(CONFIG_DEFAULTS, path);
      const data = { ...(level as object), unknownKey: "x" };
      expect(validate(path.length === 0 ? data : at(path, data))).toBe(false);
    },
  );

  it.each(
    settings.flatMap(([path, node]) =>
      [null, true, node.type === "integer" ? "1" : 1, "on ", [], {}]
        .filter(() => node.type !== "object")
        .map((value) => [dotted(path), value, path] as const),
    ),
  )("rejects %s %j", (_name, value, path) => {
    expect(validate(at(path, value))).toBe(false);
  });

  it.each([null, "policy", [], 1])("rejects permissions.policy %j", (value) => {
    expect(validate(at(["permissions", "policy"], value))).toBe(false);
  });

  it.each(
    levels.flatMap((path) =>
      [null, "x", [], 1].map((value) => [dotted(path), value, path] as const),
    ),
  )("rejects the level %s as %j", (_name, value, path) => {
    expect(validate(path.length === 0 ? value : at(path, value))).toBe(false);
  });

  const hintBytes = ["permissions", "untrustedContent", "hintBytes"];
  it.each([1, 512, 1024])("accepts hintBytes %j", (value) => {
    expect(validate(at(hintBytes, value))).toBe(true);
  });

  it.each([0, -1, 1025, 1.5, "1024", null])("rejects hintBytes %j", (value) => {
    expect(validate(at(hintBytes, value))).toBe(false);
  });

  it.each(["sessionHarnessOneProcess", "allInOneProcess", "allSeparate"])(
    "accepts topology %j",
    (value) => {
      expect(validate({ topology: value })).toBe(true);
    },
  );

  it.each(["sessionHarnessTwoProcess", "", "SessionHarnessOneProcess"])(
    "rejects topology %j",
    (value) => {
      expect(validate({ topology: value })).toBe(false);
    },
  );
});

describe("CONFIG_DEFAULTS", () => {
  it.each(settings.map(([path, node]) => [dotted(path), path, node] as const))(
    "gives %s the schema's default, one of its listed values",
    (name, path, node) => {
      const value = lookup(CONFIG_DEFAULTS, path);
      // The policy's default is the harness's DEFAULT_PERMISSION_POLICY, so it is absent here.
      if (name === "permissions.policy") {
        expect(value).toBeUndefined();
        expect(node.default).toBeUndefined();
        return;
      }
      expect(value).toBeDefined();
      expect(value).toEqual(node.default);
      if (node.enum !== undefined) expect(node.enum).toContain(value);
      expect(node.$comment).toContain(`Default ${JSON.stringify(value)}.`);
    },
  );

  it("is frozen at every level", () => {
    for (const path of levels) {
      expect(Object.isFrozen(lookup(CONFIG_DEFAULTS, path))).toBe(true);
    }
  });
});

describe("RING0_CONFIG_KEYS", () => {
  it("names the Ring 0 settings of design 08 by their policy floor names", () => {
    expect(RING0_CONFIG_KEYS).toEqual(["intake.classification", "permissions"]);
    expect(Object.isFrozen(RING0_CONFIG_KEYS)).toBe(true);
  });

  it("covers exactly the settings the schema marks Ring 0", () => {
    const covered = (path: readonly string[]) =>
      RING0_CONFIG_KEYS.some(
        (key) => dotted(path) === key || dotted(path).startsWith(`${key}.`),
      );
    for (const [path, node] of settings) {
      const marked = /\bRing 0: yes\b/.test(node.$comment ?? "");
      expect([dotted(path), covered(path)]).toEqual([dotted(path), marked]);
      expect(node.$comment).toMatch(/\bRing 0: (yes|no)\b/);
    }
  });
});
