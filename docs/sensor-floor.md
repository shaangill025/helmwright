# CI sensor floor: scope and known gaps

Owner decision (2026-10-06, `docs/decisions.md`, CI sensor floor → Enforcement): the scanning jobs
run on `pull_request_target`, so their workflow, tool pins and owner configs come from `main` and a
PR cannot weaken the scans that gate it. Each scanning job checks out the PR head as data and reads
it with pinned tools; no scanning job runs PR code. Jobs that run PR code stay on `pull_request` and
remain a backstop: `verify`, and the Grype image build (it runs the PR's Dockerfile). The harness's
own sensor floor (B3) runs trusted, pinned tools on candidate trees outside the candidate's control.

Transition: the change ships in two PRs. CI1a adds `pull_request_target`; until CI1b removes
`pull_request` from `sensors.yml`, every PR also gets same-name scanning runs from its own copy, so
the guarantee above holds only after CI1b merges. CI1b merges directly after CI1a, with no other PR
in between. CI1a itself is gated only by its own copy (`main`'s copy has no `pull_request_target`
trigger yet), the same as before this change.

## What CI enforces

- **verify** (`.github/workflows/verify.yml`, `pull_request`): frozen install with no lifecycle
  scripts or pnpmfile; Prettier with no repo config; ESLint with the explicit root config
  (`noInlineConfig`, TypeScript directive comments banned); `tsc`; Vitest with the explicit root
  config; schema drift.
- **sensors** (`.github/workflows/sensors.yml`, `pull_request_target` on PRs to `main`): gitleaks over
  full history ignoring `gitleaks:allow`; osv-scanner on the lockfile; Semgrep (pinned image and rules,
  `nosemgrep` ignored, owner ignore file, git ignore files not honored); actionlint (owner config) and
  zizmor (no ignores or config, all inputs collected regardless of `.gitignore`, unparsable inputs
  fail). The token is read-only and is used only by checkout (to fetch, not persisted) and by zizmor's
  GitHub API audits; no job uses a secret or
  the Actions cache; each job checks out the PR head with `persist-credentials: false` and first
  rejects symlinks. The scans cover the PR head, not a merge commit; the ruleset's up-to-date rule
  makes the two the same. No concurrency group, so other workflows cannot cancel these runs.
- **Accepted findings**: the `pull_request_target` trigger itself, by a filter in the workflow
  (ignore comments and repo config stay disabled): exactly one zizmor `dangerous-triggers` finding on
  `sensors.yml` for `pull_request_target`, and exactly 5 Semgrep `pull-request-target-code-checkout`
  findings on `sensors.yml` (one per job). Any other finding, another trigger, a sixth checkout, or
  `pull_request_target` in any other workflow fails the job. The scanners cannot see a plain `run:`
  step added to `sensors.yml`; see Known gaps. The expected counts come from `main`'s copy, so a PR
  that adds or removes a scanning job, or a tool or rules bump that changes a rule ID or annotation,
  is blocked: first merge a PR that accepts both values, then the change, then tighten the value.
- **image** (`.github/workflows/image.yml`, `pull_request`): Grype on the sandbox image built from
  `packages/harness/sandbox/Dockerfile` (owner empty config; fails on fixable high or critical).
- **config guard**: rejects tool config, ignore and hook files the tools would discover; install
  scripts, pnpm settings, `devEngines`, `resolutions`/`overrides`; dependency specifiers other than
  registry semver or `@helmwright/*` workspace packages; non-registry lockfile resolutions and
  foreign `link:` entries; a `pnpm-workspace.yaml` that differs from the owner's content; a pnpm or
  Node version other than the workflow's. The lockfile text checks are best-effort (YAML can spell the
  same value many ways); the authoritative check runs after install in `verify`: each checker
  (`eslint`, `typescript`, `prettier`, `vitest` and the ESLint plugins) must resolve to the registry
  package of the same name in the pnpm store, and each checker binary must run from that package.
- **main ruleset**: PRs only; all of the above required and up to date; linear history. Required
  checks match by job name and by the GitHub Actions app.

## Known gaps

| Gap                                                                                                                                                                           | Why CI can't close it                                           | Where it is closed                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| A PR that edits `sensors.yml` passes on `main`'s copy, and its change takes effect after merge; the scanners cannot detect, for example, a `run:` step added after a checkout | The scans that gate a PR come from the base branch by design    | Security review of every workflow change before merge (M1)                                                                                    |
| A PR can add a `pull_request` job that reuses a required check's name, and GitHub reports a job skipped by `if:` as success; a PR to another base branch can do the same      | Required checks match by name and app, not by workflow file     | Security review of every workflow change (M1); the CI1b PR records GitHub's behavior for duplicate names, tested on a PR that is never merged |
| A PR's own workflow can use a concurrency group that cancels `verify` runs                                                                                                    | Concurrency groups are shared across workflows                  | Cancelled runs are not successes, so this delays a merge but cannot pass one; `sensors.yml` uses no group                                     |
| `verify` and the image job run on `pull_request`, so a PR controls them                                                                                                       | They run PR code, which must not run in the base-branch context | Harness floor (B3, M1); security review of every workflow change                                                                              |
| Allowed configs (`eslint.config.js`, `tsconfig*.json`, `vitest.config.ts`) are checked by path, not content; code they run can affect later steps (e.g. `$GITHUB_PATH`)       | The PR controls the files and their execution in `verify`       | Harness floor runs owner-pinned configs and tools in the sandbox (B3, M1)                                                                     |
| The schema generator is PR code, so the drift check proves self-consistency only                                                                                              | Same                                                            | Harness floor regenerates with the base revision's generator (B3, M1)                                                                         |
| A newly published registry package could ship another tool's `bin`                                                                                                            | Specifier checks can't see package contents                     | Owner-routed dependency decisions; harness structural floor flags dependency changes (A2, M1)                                                 |
| `minimumReleaseAge` applies at resolution time, not to a hand-edited lockfile                                                                                                 | `--frozen-lockfile` does not re-resolve                         | Harness floor installs from a trusted lockfile (B3, M1)                                                                                       |
| Grype's vulnerability database is fetched at scan time, so results can change without a code change                                                                           | Pinning the database would hide new advisories                  | Accepted: a new finding blocks the next PR until the image is fixed (M1)                                                                      |
| Runner-provided `jq`, `git` and `docker` are not pinned                                                                                                                       | GitHub-hosted runner image                                      | Accepted; harness floor pins its own tools (B3, M1)                                                                                           |
