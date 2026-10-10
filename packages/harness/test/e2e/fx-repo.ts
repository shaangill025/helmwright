import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * FX (T-12-06, Dogfood targets): the seeded fixture repository whose task needs a new
 * dependency; its project is in app/ (owner, 2026-10-10). It is one JSON tree (path to
 * lines), so its code is never type-checked, linted or scanned as helmwright's own; its
 * lockfiles were written by pnpm 10.21
 * (`install --lockfile-only --offline`), not by hand. Ring 0 (OQ-FX-3).
 */
const FIXTURE = fileURLToPath(
  new URL("./fixtures/fx-repo.json", import.meta.url),
);

/**
 * The pinned base. Any edit to the fixture's files changes these, and materializeFx fails
 * until they are updated in the same reviewed change.
 */
export const FX_BASE_TREE = "9bb04ccfe86dd1925cc55cefcef3ce95d19b0ecf";
export const FX_BASE_COMMIT = "397baa60d318f2548b7b68f6b450ca0098ad9d9e";

export type FxKind = "dependency" | "control";

export interface FxTask {
  /** The task text, also the baseline arm's prompt (Q57). */
  readonly title: string;
  readonly intake: { readonly scope: readonly string[] };
  /** The scripted-engine turn file, in the e2e fixtures directory. */
  readonly turns: string;
}

interface FxFixture {
  readonly files: Readonly<Record<string, readonly string[]>>;
  readonly tasks: Readonly<Record<FxKind, FxTask>>;
}

const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as FxFixture;

/** The fixture's paths, sorted. */
export const FX_PATHS: readonly string[] = Object.keys(fixture.files).sort();

/** The dependency task (it needs @helmwright/fx-duration) or the control task (it needs none). */
export function fxTask(kind: FxKind): FxTask {
  return fixture.tasks[kind];
}

const DATE = "2026-01-01T00:00:00Z";
/** Set last, so the host's identity and dates never reach the commit. */
const IDENTITY = {
  ...{ GIT_AUTHOR_NAME: "fx", GIT_AUTHOR_EMAIL: "fx@example.com" },
  ...{ GIT_COMMITTER_NAME: "fx", GIT_COMMITTER_EMAIL: "fx@example.com" },
  ...{ GIT_AUTHOR_DATE: DATE, GIT_COMMITTER_DATE: DATE },
};
/** `-c` beats every config file and GIT_CONFIG_* variable: no line-ending change, hook or signature. */
const FLAGS = [
  ...["-c", "core.autocrlf=false", "-c", "core.safecrlf=false"],
  ...["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false"],
];

/**
 * Writes the fixture into `dir` (LF endings, sorted) and commits it as the only commit on
 * `main` (git 2.29 or later). Inherited GIT_* variables are dropped; `env` is added after
 * that, so a test can set git config through GIT_CONFIG_COUNT.
 * @throws Error if the tree or the commit differs from the pin.
 */
export function materializeFx(
  dir: string,
  env: Readonly<Record<string, string>> = {},
): { repo: string; baseTree: string; baseCommit: string } {
  for (const path of FX_PATHS) {
    const file = join(dir, path);
    mkdirSync(dirname(file), { recursive: true });
    const lines = fixture.files[path] ?? [];
    writeFileSync(file, lines.join("\n") + "\n", { mode: 0o644 });
  }
  const inherited = Object.entries(process.env).filter(
    ([key]) => !key.startsWith("GIT_"),
  );
  const full = { ...Object.fromEntries(inherited), ...env, ...IDENTITY };
  const git = (...args: string[]) => {
    const result = spawnSync("git", [...FLAGS, "-C", dir, ...args], {
      encoding: "utf8",
      env: full,
    });
    if (result.status !== 0) {
      throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
    }
    return result.stdout.trim();
  };
  git("init", "--quiet", "--object-format=sha1", "-b", "main");
  git("add", "-A");
  git("commit", "--quiet", "--no-verify", "-m", "FX base");
  const baseTree = git("rev-parse", "HEAD^{tree}");
  const baseCommit = git("rev-parse", "HEAD");
  if (baseTree !== FX_BASE_TREE || baseCommit !== FX_BASE_COMMIT) {
    throw new Error(
      `FX base drifted: tree ${baseTree}, commit ${baseCommit} (pinned ${FX_BASE_TREE}, ${FX_BASE_COMMIT})`,
    );
  }
  return { repo: dir, baseTree, baseCommit };
}
