# CI sensor floor: scope and known gaps

This page describes the CI setup on `main` today: every job runs on `pull_request`, so CI is a
backstop against accidental or casual bypass. The harness's own sensor floor (B3) runs trusted,
pinned tools on candidate trees outside the candidate's control.

The owner revised the decision on 2026-10-06 (`docs/decisions.md`, CI sensor floor → Enforcement):
the scanning jobs move to `pull_request_target`, so they run the workflow and configs from `main`.
Jobs that execute PR code (`verify`, and the Grype image build unless proven safe) stay on
`pull_request`. The CI1 PR makes that change and updates this page; the "backstop only" framing
then no longer applies to the scanning jobs.

## What CI enforces

- **verify** (`.github/workflows/verify.yml`): frozen install with no lifecycle scripts or
  pnpmfile; Prettier with no repo config; ESLint with the explicit root config (`noInlineConfig`,
  TypeScript directive comments banned); `tsc`; Vitest with the explicit root config; schema drift.
- **sensors** (`.github/workflows/sensors.yml`): gitleaks over full history ignoring
  `gitleaks:allow`; osv-scanner on the lockfile; Semgrep (pinned image and rules, `nosemgrep`
  ignored, owner ignore file); actionlint (owner config) and zizmor (no ignores or config); Grype on
  the sandbox image built from `packages/harness/sandbox/Dockerfile` (owner empty config; fails on fixable
  high or critical).
- **config guard**: rejects tool config, ignore and hook files the tools would discover; install
  scripts, pnpm settings, `devEngines`, `resolutions`/`overrides`; dependency specifiers other than
  registry semver or `@helmwright/*` workspace packages; non-registry lockfile resolutions and
  foreign `link:` entries; a `pnpm-workspace.yaml` that differs from the owner's content; a pnpm or
  Node version other than the workflow's. The lockfile text checks are best-effort (YAML can spell the
  same value many ways); the authoritative check runs after install: each checker (`eslint`,
  `typescript`, `prettier`, `vitest` and the ESLint plugins) must resolve to the registry package of the
  same name in the pnpm store, and each checker binary must run from that package.
- **main ruleset**: PRs only; all of the above required and up to date; linear history.

## Known gaps

| Gap                                                                                                                                                                     | Why CI can't close it                             | Where it is closed                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| A PR can edit the workflows themselves                                                                                                                                  | `pull_request` runs the PR's copy of the workflow | Security review of every workflow change before merge (M1); the harness floor (B3, M1)        |
| Allowed configs (`eslint.config.js`, `tsconfig*.json`, `vitest.config.ts`) are checked by path, not content; code they run can affect later steps (e.g. `$GITHUB_PATH`) | The PR controls the files and their execution     | Harness floor runs owner-pinned configs and tools in the sandbox (B3, M1)                     |
| The schema generator is PR code, so the drift check proves self-consistency only                                                                                        | Same                                              | Harness floor regenerates with the base revision's generator (B3, M1)                         |
| A newly published registry package could ship another tool's `bin`                                                                                                      | Specifier checks can't see package contents       | Owner-routed dependency decisions; harness structural floor flags dependency changes (A2, M1) |
| `minimumReleaseAge` applies at resolution time, not to a hand-edited lockfile                                                                                           | `--frozen-lockfile` does not re-resolve           | Harness floor installs from a trusted lockfile (B3, M1)                                       |
| Grype's vulnerability database is fetched at scan time, so results can change without a code change                                                                     | Pinning the database would hide new advisories    | Accepted: a new finding blocks the next PR until the image is fixed (M1)                      |
| Runner-provided `jq`, `git` and `docker` are not pinned                                                                                                                 | GitHub-hosted runner image                        | Accepted for the backstop; harness floor pins its own tools (B3, M1)                          |
