import type { FloorFinding, FloorRule } from "@helmwright/schema";
import { caseFold, isRing0Path } from "../permission/normalize.ts";
import {
  RING0_PATHS,
  canonical,
  deepFreeze,
  displayText,
} from "../permission/policy.ts";

/**
 * The sensor floor's rule table (06 Ring 0 contents; B3 owner answers OQ-B3-1..4, 2026-10-07).
 * It is pure and deterministic: it reads only the changes between the run's base commit and
 * the candidate tree. A candidate cannot pass by adding a suppression, changing config
 * discovery, replacing a test command or changing a protected path: any change to a
 * protected path is a finding, even an owner-approved one (OQ-B3-3). A change to a rule or
 * list needs a new version.
 */
export const FLOOR_RULES_VERSION = "floor-3";

/** One path that differs between the base commit and the candidate tree. */
export interface FloorChange {
  readonly path: string;
  /** Git modes on each side: `000000` when absent, `120000` a symlink, `160000` a gitlink. */
  readonly baseMode: string;
  readonly candidateMode: string;
  /** The bytes of a regular file (mode 100644 or 100755) on that side, else undefined. */
  readonly base?: Uint8Array | undefined;
  readonly candidate?: Uint8Array | undefined;
}

// Lines compare case-folded with each whitespace run as one space (`norm`). Markers are
// built by concatenation, so this file holds none.
const MARKERS = deepFreeze([
  ...[
    "eslint-" + "disable",
    "eslint-" + "enable",
    "/* " + "eslint",
    "/*" + "eslint",
  ],
  ...["@ts-" + "ignore", "@ts-" + "expect-error", "@ts-" + "nocheck"],
  ...["gitleaks" + ":allow", "prettier-" + "ignore", "node:" + "coverage"],
  ...["c8", "v8", "istanbul"].map((tool) => tool + " ignore"),
  ...["biome-" + "ignore", "oxlint-" + "disable", "cspell" + ":disable"],
]);
/**
 * Whole-word inline ignores: Semgrep's in both spellings, and (N1) Python's, Bandit's and
 * gosec's, golangci-lint's, Sonar's, mypy's and Pylint's.
 */
const WORD_MARKERS = deepFreeze([
  new RegExp("\\bno" + "sem(?:grep)?(?![a-z0-9_])"),
  new RegExp("(?<![a-z0-9_])no(?:" + "qa|" + "sec|" + "sonar)(?![a-z0-9_])"),
  new RegExp("//no" + "lint\\b"),
  new RegExp("# ?(?:type: ?" + "ignore|pylint: ?" + "disable)\\b"),
]);
/** Test-skipping and focusing names, matched in test files only. */
const NAMES = ["skip", "only", "todo", "fails"];
const CALLS = [
  ...NAMES,
  ...["skipif", "runif", "failing", "skipnow", "skipf", "todoif"],
  // pytest.mark.xfail, unittest's expectedFailure and skipUnless, Playwright's fixme.
  ...["xfail", "expectedfailure", "skipunless", "fixme"],
].join("|");
/**
 * S1: the values a key may have before `,` or `}` on its line: a number (such as Prisma's
 * `skip: 10`) or `false`.
 */
const KEEPS = "(?! ?(?:false|-?\\d[\\w.]*) ?[,}])";
const TEST_FORMS = deepFreeze([
  // A member access of a skip or focus name: a call, a chained call or a bare reference.
  new RegExp("\\.(?:" + CALLS + ")(?![\\w$])"),
  // A bracket access, such as `it["skip"]`.
  new RegExp("\\[ ?[\"'`](?:" + CALLS + ")[\"'`] ?\\]"),
  // Bun's conditional calls, such as `test.if(ci)`.
  new RegExp("\\.if ?\\("),
  // A focus or exclude call: an x- or f-prefixed it, describe or test.
  new RegExp(
    "(?<![\\w$.])(?:x" +
      "it|x" +
      "describe|x" +
      "test|f" +
      "it|f" +
      "describe) ?\\(",
  ),
  // A bare imported decorator, such as unittest's `@skip("r")`.
  /(?<![\w$.])@ ?(?:skip|skipif|skipunless|expectedfailure)\b/,
  // S1: an options-object key at a line start or after `{`, `,` or a block comment's end,
  // such as `{ skip: true }` or a shorthand `{ skip }`, unless KEEPS keeps its value. A
  // quoted or computed key, such as `["skip"]: x`, needs a value.
  new RegExp(
    "(?:^|[{,]|\\*/) ?(?:" + NAMES.join("|") + ") ?(?:[,}]|$|:" + KEEPS + ")",
  ),
  new RegExp(
    "(?:^|[{,]|\\*/) ?(?:\\[ ?)?[\"'`](?:" +
      NAMES.join("|") +
      ")[\"'`](?: ?\\])? ?:" +
      KEEPS,
  ),
]);
/**
 * S2: an import or require of a test framework, so its test forms count in any code file,
 * not only a test path. Matched over the case-folded text in linear time: no two
 * adjacent `\s*` can split one whitespace run.
 */
const FRAMEWORK = new RegExp(
  /(?:\bfrom|\bimport|\brequire)\s*(?:\(\s*)?["'`]/.source +
    "(?:vit" +
    "est|node:test|@jest/globals|mocha|bun:test|@playwright/test|ava)" +
    /(?:\/[^"'`\s]{0,200})?["'`]/.source,
);
/** The code files whose framework imports count (S2). */
const CODE = /\.(?:[cm]?[jt]sx?|py|go)$/;
/** Tool config, ignore, hook and build file names, matched at any depth (`*` within the name). */
const CONFIG_NAMES = deepFreeze([
  ...["eslint.config.*", ".eslintrc", ".eslintrc.*", ".eslintignore"],
  ...[
    "tsconfig*.json",
    "jsconfig*.json",
    "vitest.config.*",
    "vitest.workspace.*",
  ],
  ...["vite.config.*", ".prettierrc*", "prettier.config.*", ".prettierignore"],
  ...[".editorconfig", ".npmrc", ".pnpmfile.*", "pnpm-workspace.yaml"],
  ...[".semgrep*", ".gitleaks*", "osv-scanner*", ".grype*", ".gitattributes"],
  ...[
    ".gitignore",
    ".gitmodules",
    "lefthook*",
    ".lefthook*",
    ".pre-commit-config.yaml",
  ],
  ...[".node-version", ".nvmrc", ".yarnrc*", "package.yaml", "package.json5"],
  ...[
    "zizmor.*",
    "actionlint.*",
    "dockerfile*",
    ".c8rc*",
    ".nycrc*",
    "jest.config.*",
  ],
  ...["babel.config.*", ".babelrc*", "biome.json*", "makefile", "justfile"],
  ...["pyproject.toml", "setup.cfg", "tox.ini", "pytest.ini", "conftest.py"],
  ...[
    ".mocharc*",
    "ava.config.*",
    "playwright.config.*",
    ".swcrc",
    "turbo.json",
  ],
  ...["nx.json", "deno.json*", "bunfig.toml", ".tool-versions", "mise.toml"],
  ...["gnumakefile", "*.mk", "containerfile", ".dockerignore"],
  ...[".lintstagedrc*", "lint-staged.config.*", ".simple-git-hooks*"],
  ...["simple-git-hooks.json", "commitlint.config.*", ".mise.toml"],
  ...[
    ".trivyignore",
    "compose*.y*ml",
    "docker-compose*.y*ml",
    ".gitlab-ci.yml",
  ],
  "jenkinsfile",
  // F4 (owner, 2026-10-08): agent instruction and MCP files a hosted engine could load.
  ...["claude.md", "agents.md", ".mcp.json"],
]);
/** Directories whose every file is config: CI, git hook managers, Semgrep rules, tool, dev and agent environments. */
const CONFIG_DIRS = new Set([
  ...[".github", ".husky", ".githooks", ".semgrep"],
  ...[".devcontainer", ".circleci", ".mise", ".claude"],
]);
/** package.json keys that change how the checkers, the build or the install run (dependencies are A2's). */
const PACKAGE_KEYS = deepFreeze([
  ...["pnpm", "overrides", "resolutions", "devEngines", "packageManager"],
  ...["eslintConfig", "prettier", "vitest", "imports", "exports", "main"],
  ...["types", "typings", "typesVersions", "type", "workspaces", "engines"],
  ...[
    "c8",
    "nyc",
    "jest",
    "mocha",
    "ava",
    "lint-staged",
    "simple-git-hooks",
    "husky",
  ],
  ...["module", "browser", "config", "bin"],
  ...["babel", "volta", "eslintIgnore", "browserslist", "tsup", "ts-node"],
  ...["tap", "xo"],
]);
const TEST_DIRS = new Set(["test", "tests", "__tests__"]);
const TEST_MARKS = [".test.", ".spec.", ".test-d.", ".e2e-spec."];
const SYMLINK = "120000";
const GITLINK = "160000";
const ABSENT = "000000";
const REGULAR = new Set(["100644", "100755"]);
const UTF8 = new TextDecoder("utf-8", { fatal: true });

type Finding = Omit<FloorFinding, "path"> & { path: string };
const found = (rule: FloorRule, path: string, detail: string, line?: number) =>
  ({
    rule,
    path: displayText(path),
    ...(line === undefined ? {} : { line }),
    detail: displayText(detail),
  }) satisfies Finding;

const segments = (path: string) => caseFold(path).split("/");
const nameOf = (path: string) => segments(path).at(-1) ?? "";
const norm = (line: string) => caseFold(line).split(/\s+/).join(" ").trim();

function isTestFile(path: string): boolean {
  const parts = segments(path);
  const name = parts.pop() ?? "";
  return (
    TEST_MARKS.some((mark) => name.includes(mark)) ||
    (name.startsWith("test_") && name.endsWith(".py")) ||
    name.endsWith("_test.go") ||
    parts.some((part) => TEST_DIRS.has(part))
  );
}

/** UTF-8 text without NUL (a UTF-8 BOM is dropped), or undefined for anything else. */
function decode(bytes: Uint8Array): string | undefined {
  if (bytes.includes(0)) return undefined;
  try {
    return UTF8.decode(bytes);
  } catch {
    return undefined;
  }
}

/** The candidate's lines not in the base, as a multiset of normalised lines, so a moved line is not added. */
function addedLines(base: string, candidate: string): [number, string][] {
  const left = new Map<string, number>();
  for (const line of base.split("\n")) {
    const key = norm(line);
    left.set(key, (left.get(key) ?? 0) + 1);
  }
  const added: [number, string][] = [];
  candidate.split("\n").forEach((line, index) => {
    const key = norm(line);
    const count = left.get(key) ?? 0;
    if (count > 0) left.set(key, count - 1);
    else added.push([index + 1, line]);
  });
  return added;
}

/**
 * R3: a block-comment directive, which can span lines, matched over the whole case-folded
 * file. Built by concatenation, so this file holds none.
 */
const BLOCK_DIRECTIVE = new RegExp(
  "/\\*\\s*(?:es" + "lint|glo" + "bals?|exp" + "orted)\\b",
  "g",
);

/** The 1-based lines where BLOCK_DIRECTIVE matches in `text`. */
function blockDirectiveLines(text: string): number[] {
  const folded = caseFold(text);
  return Array.from(folded.matchAll(BLOCK_DIRECTIVE), (match) => {
    return folded.slice(0, match.index).split("\n").length;
  });
}

/**
 * `key` without the block comments outside string literals, by one linear scan (an
 * unterminated comment ends the line), so an options key after a comment shows. A quote in
 * a regex literal can mislead the scan; test forms match `key` or this.
 */
function uncomment(key: string): string {
  const kept: string[] = [];
  let from = 0;
  let quote = "";
  for (let i = 0; i < key.length; i += 1) {
    const c = key.charAt(i);
    if (quote !== "") {
      if (c === "\\") i += 1;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'" || c === "`") {
      quote = c;
    } else if (c === "/" && key.charAt(i + 1) === "*") {
      kept.push(key.slice(from, i), " ");
      const close = key.indexOf("*/", i + 2);
      i = close === -1 ? key.length : close + 1;
      from = i + 1;
    }
  }
  kept.push(key.slice(from));
  return norm(kept.join(""));
}

function suppressions(path: string, base: string, candidate: string) {
  const test =
    isTestFile(path) ||
    (CODE.test(nameOf(path)) && FRAMEWORK.test(caseFold(candidate)));
  const marked = (line: string) => {
    const key = norm(line);
    const keys = key.includes("/*") ? [key, uncomment(key)] : [key];
    return (
      MARKERS.some((m) => key.includes(m)) ||
      WORD_MARKERS.some((m) => m.test(key)) ||
      (test && TEST_FORMS.some((form) => keys.some((k) => form.test(k))))
    );
  };
  const findings = addedLines(base, candidate)
    .filter(([, line]) => marked(line))
    .map(([at, line]) => found("suppression.added", path, line.trim(), at));
  // More block directives than the base: one finding at the first match past the
  // base's count, unless a line finding already reports that line.
  const before = blockDirectiveLines(base).length;
  const at = blockDirectiveLines(candidate)[before];
  if (at !== undefined && !findings.some((f) => f.line === at)) {
    const detail = "block-comment directive added";
    findings.push(found("suppression.added", path, detail, at));
  }
  return findings;
}

/** A tool config, ignore, hook or build file, by name or directory (`config.changed`). */
export function isConfig(path: string): boolean {
  const parts = segments(path);
  return (
    parts.slice(0, -1).some((part) => CONFIG_DIRS.has(part)) ||
    isRing0Path(nameOf(path), CONFIG_NAMES)
  );
}

/** The parsed object, `{}` when absent, or undefined if it is not a JSON object. */
function packageObject(text: string | undefined): object | undefined {
  if (text === undefined) return {};
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value === "object" && value !== null && !Array.isArray(value))
      return value;
  } catch {
    // Not JSON: undefined below.
  }
  return undefined;
}

/** The value of own key `key`, or undefined. */
const own = (value: object, key: string): unknown =>
  Object.hasOwn(value, key)
    ? (value as Record<string, unknown>)[key]
    : undefined;

/** Equal as canonical JSON; a value canonical cannot write counts as changed. */
function same(a: unknown, b: unknown): boolean {
  try {
    return canonical(a ?? null) === canonical(b ?? null);
  } catch {
    return false;
  }
}

function packageChanges(path: string, base?: string, candidate?: string) {
  const after = packageObject(candidate);
  if (after === undefined) {
    return [
      found("package.changed", path, "package.json is not a JSON object"),
    ];
  }
  const before = packageObject(base) ?? {};
  const scripts = (value: object) => {
    const inner = own(value, "scripts");
    return typeof inner === "object" && inner !== null ? inner : {};
  };
  const names = new Set([
    ...Object.keys(scripts(before)),
    ...Object.keys(scripts(after)),
  ]);
  const changedScripts = [...names]
    .filter((n) => !same(own(scripts(before), n), own(scripts(after), n)))
    .map((n) => "scripts." + n);
  const changedKeys = PACKAGE_KEYS.filter(
    (key) => !same(own(before, key), own(after, key)),
  );
  return [...changedScripts, ...changedKeys].map((key) =>
    found("package.changed", path, key + " changed"),
  );
}

/** The findings of one change. */
function check(
  change: FloorChange,
  protect: readonly string[],
  chain: ReadonlySet<string>,
): Finding[] {
  const { path, baseMode, candidateMode } = change;
  const bytes = (mode: string, data: Uint8Array | undefined) =>
    REGULAR.has(mode) ? data : undefined;
  const [baseBytes, candidateBytes] = [
    bytes(baseMode, change.base),
    bytes(candidateMode, change.candidate),
  ];
  // An unreadable base reads as empty, so every candidate line counts as added.
  const base = baseBytes && (decode(baseBytes) ?? "");
  const candidate = candidateBytes && decode(candidateBytes);
  const findings: Finding[] = [];
  if (candidateBytes !== undefined && candidate === undefined) {
    const detail = "not UTF-8 text without NUL";
    findings.push(found("encoding.unreadable", path, detail));
  }
  if (candidate !== undefined) {
    findings.push(...suppressions(path, base ?? "", candidate));
  }
  if (isConfig(path)) {
    findings.push(found("config.changed", path, "config file changed"));
  } else if (chain.has(caseFold(path))) {
    findings.push(found("config.changed", path, "config chain"));
  }
  if (nameOf(path) === "package.json") {
    // An unreadable candidate is not a JSON object; an absent one is `{}`.
    const text = candidateBytes === undefined ? undefined : (candidate ?? "");
    findings.push(...packageChanges(path, base, text));
  }
  if (isRing0Path(path, protect)) {
    const what =
      baseMode === ABSENT
        ? "added"
        : candidateMode === ABSENT
          ? "deleted"
          : "modified";
    findings.push(found("protected.changed", path, what));
  }
  if (candidateMode === SYMLINK) {
    findings.push(found("symlink.added", path, "symlink in candidate"));
  }
  if (candidateMode === GITLINK) {
    findings.push(found("gitlink.added", path, "gitlink in candidate"));
  }
  return findings;
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const order = (a: FloorFinding, b: FloorFinding) =>
  compare(a.path ?? "", b.path ?? "") ||
  (a.line ?? 0) - (b.line ?? 0) ||
  compare(a.rule, b.rule) ||
  compare(a.detail, b.detail);

/** `findings` sorted in place by path (none first), line, rule and detail. */
export const sortFindings = (findings: FloorFinding[]) => findings.sort(order);

/**
 * The findings of `floor-3` for `changes`, sorted; paths and details are escaped and
 * bounded for display. `protectedGlobs` are the run's Ring 0 paths (the resolved policy's
 * and the floor's): any change to one of them is `protected.changed` (OQ-B3-3, OQ-B3-4).
 * `chain` holds the case-folded paths the base commit's configs extend or import (S3):
 * a change to one of them is `config.changed`.
 */
export function floorFindings(
  changes: readonly FloorChange[],
  protectedGlobs: readonly string[],
  chain: ReadonlySet<string> = new Set(),
): FloorFinding[] {
  // R2: the floor's own Ring 0 paths always count, whatever the caller passes.
  const protect = [...protectedGlobs, ...RING0_PATHS];
  return sortFindings(
    changes.flatMap((change) => check(change, protect, chain)),
  );
}
