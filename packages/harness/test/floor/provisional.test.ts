import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Event } from "@helmwright/schema";
import {
  MAX_PROVISIONAL,
  PROVISIONAL_FAILED,
  PROVISIONAL_REFUSED,
  planProvisional,
  provisionalCommitId,
  provisionalFaults,
  provisionalRef,
} from "../../src/floor/provisional.ts";
import { FLOOR_LIMITS, checkCandidate } from "../../src/floor/tree.ts";

const tree = "b".repeat(40);
const base = "a".repeat(40);
const id = "decision-floor-1-0";

const event = (seq: number, type: string, payload: object): Event =>
  ({
    ...{ schemaVersion: 1, eventId: "e" + String(seq), seq, graphId: "g" },
    ...{ runId: "run-1", nodeId: "n", type, at: "2026-01-01T00:00:00.000Z" },
    payload,
  }) as Event;

const decision = {
  id,
  authority: "owner",
  class: "technology",
  source: "floor",
};
const opened = (change: object = {}) => ({
  kind: "provisional.opened",
  ...{ decisionId: id, class: "technology", tree, baseCommit: base },
  commit: provisionalCommitId(tree, base, id),
  ref: provisionalRef(id),
  ...change,
});
const refused = { kind: "provisional.refused", decisionId: id, reason: "cap" };
const checkedPayload = (verdict = "pass") => ({
  verdict,
  candidateTree: tree,
  baseCommit: base,
});
const log = (change: object = {}, verdict = "pass"): Event[] => [
  event(0, "decision.opened", decision),
  event(1, "provisional.opened", opened(change)),
  event(2, "floor.checked", checkedPayload(verdict)),
];

describe("provisional commit (PB-1)", () => {
  it("gives the same ID for the same facts, another for another", () => {
    expect(provisionalCommitId(tree, base, id)).toBe(
      provisionalCommitId(tree, base, id),
    );
    expect(provisionalCommitId(tree, base, id)).toMatch(/^[0-9a-f]{40}$/);
    expect(provisionalCommitId(tree, base, "decision-x")).not.toBe(
      provisionalCommitId(tree, base, id),
    );
    expect(provisionalCommitId("c".repeat(64), "d".repeat(64), id)).toMatch(
      /^[0-9a-f]{64}$/,
    );
    expect(() => provisionalCommitId(tree, "d".repeat(64), id)).toThrow();
  });

  it("fixes the cap at 10 open branches", () => {
    expect(MAX_PROVISIONAL).toBe(10);
  });

  it("keeps the ref under refs/helmwright/provisional, never refs/heads", () => {
    expect(provisionalRef(id)).toBe("refs/helmwright/provisional/" + id);
    expect(() => provisionalRef("../heads/main")).toThrow();
  });
});

describe("provisionalFaults (PB-1, Q68a)", () => {
  it("finds no fault in a well-formed log or a refusal", () => {
    expect(provisionalFaults(log())).toEqual([]);
    const refusal = [
      event(0, "decision.opened", decision),
      event(1, "provisional.refused", refused),
      event(2, "floor.checked", checkedPayload()),
    ];
    expect(provisionalFaults(refusal)).toEqual([]);
  });

  it("leaves a log from before PB-1 alone (legacy)", () => {
    const legacy = [
      event(0, "decision.opened", decision),
      event(1, "floor.checked", checkedPayload()),
    ];
    expect(provisionalFaults(legacy)).toEqual([]);
  });

  it("faults a passing floor whose owner decision has no provisional event", () => {
    const missing = [
      event(0, "decision.opened", decision),
      event(1, "floor.checked", checkedPayload()),
      event(2, "run.terminated", { terminal: { kind: "completed" } }),
    ];
    // Another run's earlier provisional event: the log is no longer legacy.
    const earlier = [event(0, "provisional.opened", opened())];
    expect(provisionalFaults(missing, earlier)).toEqual([
      expect.stringContaining("owner decision without provisional.opened"),
    ]);
    // B1 (owner ruling 2026-10-17): a run that did not end completed is due no fork.
    const ended = (terminal: object) => [
      ...missing.slice(0, 2),
      event(2, "run.terminated", { terminal }),
    ];
    for (const terminal of [
      { kind: "incomplete", reason: "limit" },
      { kind: "failed", error: "engine failed" },
    ]) {
      expect(provisionalFaults(ended(terminal), earlier)).toEqual([]);
    }
    // S1: the terminal's text decides nothing. A run failed by these texts, with or
    // without entries, is not owed a fork, and an engine error cannot spoof them.
    for (const error of [
      PROVISIONAL_REFUSED,
      PROVISIONAL_REFUSED + " (suffix)",
      PROVISIONAL_FAILED + ": x",
    ]) {
      expect(
        provisionalFaults(ended({ kind: "failed", error }), earlier),
      ).toEqual([]);
    }
    // Architecture is never provisional, and a harness Ruling has no fork.
    const architecture = [
      event(0, "decision.opened", { ...decision, class: "architecture" }),
      event(1, "floor.checked", checkedPayload()),
    ];
    expect(provisionalFaults(architecture, earlier)).toEqual([]);
    // A provisional event after a harness Ruling (not an owner decision) is a fault.
    const afterRuling = [
      event(0, "decision.opened", { ...decision, authority: "harness" }),
      event(1, "provisional.opened", opened()),
      event(2, "floor.checked", checkedPayload()),
    ];
    expect(provisionalFaults(afterRuling)).toEqual([
      expect.stringContaining("not directly after its owner decision"),
    ]);
  });

  it.each([
    ["a forged commit", { commit: "e".repeat(40) }],
    ["another tree", { tree: "c".repeat(40) }],
    ["another base commit", { baseCommit: "c".repeat(40) }],
    ["another ref", { ref: "refs/heads/main" }],
    ["architecture", { class: "architecture" }],
  ])("faults %s", (_name, change) => {
    expect(provisionalFaults(log(change)).length).toBeGreaterThan(0);
  });

  it("faults a reserved provisional.resolved until PB-3 defines it (A1)", () => {
    const retyped = log();
    retyped[1] = event(1, "provisional.resolved", {
      kind: "provisional.resolved",
      decisionId: id,
      runId: "run-1",
      commit: "a".repeat(40),
    });
    expect(provisionalFaults(retyped)).toEqual([
      expect.stringContaining(
        "reserved provisional event provisional.resolved",
      ),
    ]);
  });

  it("faults a rejected floor and a missing owner decision", () => {
    expect(provisionalFaults(log({}, "reject")).length).toBeGreaterThan(0);
    expect(provisionalFaults(log().slice(1)).length).toBeGreaterThan(0);
  });
});

// PB-2a: a dependent run "run-2" is built on the provisional commit that "run-1" forked.
const commit = provisionalCommitId(tree, base, id);
const inRun = (runId: string, e: Event): Event => ({ ...e, runId });
/** The run that forked the commit, in the whole-log history. */
const forkEvent = inRun("run-1", event(1, "provisional.opened", opened()));
const attachedPayload = (change: object = {}) => ({
  kind: "provisional.attached",
  decisionId: id,
  runId: "run-2",
  commit,
  ...change,
});
/** run-2's events: recorded, attached, started, checked, with each part overridable. */
function dependent(
  options: {
    attached?: object | null;
    start?: string;
    check?: string;
  } = {},
): Event[] {
  const { attached = {}, start = commit, check = commit } = options;
  return [
    event(10, "run.recorded", { taskId: "task-2" }),
    ...(attached === null
      ? []
      : [event(11, "provisional.attached", attachedPayload(attached))]),
    event(12, "run.started", { baseCommit: start }),
    event(13, "floor.checked", { ...checkedPayload(), baseCommit: check }),
  ].map((e) => inRun("run-2", e));
}
const history = (...more: Event[]): Event[] => [forkEvent, ...more];

describe("provisional.attached replay rules (PB-2a)", () => {
  it("finds no fault in a well-formed dependent run", () => {
    expect(provisionalFaults(dependent(), history())).toEqual([]);
  });

  it("finds no fault in an ordinary run with no attached event or fork base", () => {
    const plain = dependent({ attached: null, start: base, check: base });
    expect(provisionalFaults(plain, history())).toEqual([]);
  });

  // Rule 1.
  it("faults an invalid payload and a kind that is not the type", () => {
    for (const attached of [
      { commit: "not-an-oid" },
      { kind: "provisional.opened" },
    ]) {
      const run = dependent({ attached, start: base, check: base });
      expect(provisionalFaults(run, history())).toEqual([
        "seq 11: provisional.attached that is not a valid provisional event",
      ]);
    }
  });

  // Rule 2.
  it("faults a payload runId that is not the event's", () => {
    expect(
      provisionalFaults(dependent({ attached: { runId: "run-9" } }), history()),
    ).toEqual(["seq 11: attached runId is not the event's"]);
  });

  // Rule 3.
  it("faults a second attached event in one run", () => {
    const twice = [
      event(10, "run.recorded", { taskId: "task-2" }),
      event(11, "provisional.attached", attachedPayload()),
      event(12, "provisional.attached", attachedPayload()),
      event(13, "run.started", { baseCommit: commit }),
    ].map((e) => inRun("run-2", e));
    expect(provisionalFaults(twice, history())).toEqual([
      "seq 12: second provisional.attached in one run",
    ]);
  });

  // Rule 4.
  it("faults an attached event not between run.recorded and run.started", () => {
    const text = (seq: number) =>
      `seq ${String(seq)}: provisional.attached is not between run.recorded and run.started`;
    const late = [
      event(10, "run.recorded", { taskId: "task-2" }),
      event(12, "run.started", { baseCommit: commit }),
      event(14, "provisional.attached", attachedPayload()),
    ].map((e) => inRun("run-2", e));
    expect(provisionalFaults(late, history())).toEqual([text(14)]);
    const unrecorded = dependent().slice(1);
    expect(provisionalFaults(unrecorded, history())).toEqual([text(11)]);
  });

  // Rule 5.
  it("faults a decision with no earlier provisional.opened", () => {
    const text = "seq 11: attached decision has no earlier provisional.opened";
    expect(provisionalFaults(dependent(), [])).toEqual([text]);
    const refusal = inRun("run-1", event(1, "provisional.refused", refused));
    expect(provisionalFaults(dependent(), [refusal])).toEqual([text]);
    const later = { ...forkEvent, seq: 20 };
    expect(provisionalFaults(dependent(), [later])).toEqual([text]);
    expect(
      provisionalFaults(
        dependent({ attached: { decisionId: "decision-x" } }),
        history(),
      ),
    ).toEqual([text]);
  });

  // Rule 6.
  it("faults a commit that is not the opened commit", () => {
    const other = "e".repeat(40);
    expect(
      provisionalFaults(
        dependent({ attached: { commit: other }, start: other, check: other }),
        history(),
      ),
    ).toEqual([
      "seq 11: attached commit is not the decision's provisional commit",
    ]);
  });

  // Rule 7.
  it("faults an attach to a decision opened in the same run", () => {
    const self = dependent().map((e) => inRun("run-1", e));
    const own = [
      ...self.slice(0, 1),
      inRun("run-1", event(5, "provisional.opened", opened())),
      ...self.slice(1),
    ];
    const ownAttached = own.map((e) =>
      e.type === "provisional.attached"
        ? { ...e, payload: attachedPayload({ runId: "run-1" }) }
        : e,
    ) as Event[];
    const fork = ownAttached.filter((e) => e.type === "provisional.opened");
    expect(provisionalFaults(ownAttached, fork)).toContain(
      "seq 11: attached to a decision opened in the same run",
    );
  });

  // Rule 8.
  it("faults a run.started or floor.checked base that is not the commit", () => {
    expect(provisionalFaults(dependent({ start: base }), history())).toEqual([
      "seq 12: run.started base commit is not the attached commit",
    ]);
    expect(provisionalFaults(dependent({ check: base }), history())).toEqual([
      "seq 13: floor.checked base commit is not the attached commit",
    ]);
  });

  // Rule 9.
  it("faults an attach above a resolved decision", () => {
    const resolved = inRun(
      "run-3",
      event(5, "provisional.resolved", {
        kind: "provisional.resolved",
        decisionId: id,
        outcome: "confirmed",
        chosenOption: "a",
        resolvedBy: "owner-tty:none",
      }),
    );
    expect(provisionalFaults(dependent(), history(resolved))).toEqual([
      "seq 11: attached after the decision was resolved",
    ]);
    const after = { ...resolved, seq: 50 };
    expect(provisionalFaults(dependent(), history(after))).toEqual([]);
  });
});

describe("floor base rule (PB-2a, 1.3)", () => {
  it("faults a run on a provisional commit with no attached event", () => {
    expect(provisionalFaults(dependent({ attached: null }), history())).toEqual(
      [
        "seq 12: run on a provisional commit without provisional.attached",
        "seq 13: run on a provisional commit without provisional.attached",
      ],
    );
  });

  it("allows the provisional commit only as the attached commit", () => {
    const other = "d".repeat(40);
    const second = dependent({
      attached: { commit: other },
      start: other,
      check: other,
    });
    // Attached to another commit, the run's base is that commit, not a fork's; rule 6 speaks.
    expect(provisionalFaults(second, history())).toEqual([
      "seq 11: attached commit is not the decision's provisional commit",
    ]);
  });

  it("leaves a run's own fork base alone", () => {
    expect(provisionalFaults(log(), history())).toEqual([]);
  });
});

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync(
    "git",
    [...["-c", "user.name=t", "-c", "user.email=t@example.com"], ...args],
    { cwd, encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(args.join(" ") + result.stderr);
  return result.stdout.trim();
}

describe("planProvisional (PB-1, real git)", () => {
  let tmp: string;
  let common: string;
  let baseCommit: string;
  let held: NonNullable<ReturnType<typeof checkCandidate>["held"]>;
  let candidateTree: string;

  beforeEach(() => {
    tmp = realpathSync(mkdtempSync(join(tmpdir(), "hw-prov-")));
    const repo = join(tmp, "repo");
    git(tmp, "init", "--quiet", repo);
    writeFileSync(join(repo, "a.txt"), "one\n");
    git(repo, "add", "a.txt");
    git(repo, "commit", "--quiet", "-m", "init");
    baseCommit = git(repo, "rev-parse", "HEAD");
    common = realpathSync(join(repo, ".git"));
    const wt = join(tmp, "wt");
    git(repo, "worktree", "add", "--quiet", "--detach", wt);
    writeFileSync(join(wt, "a.txt"), "two\n");
    const pass = checkCandidate(
      { worktree: wt, commonDir: common },
      baseCommit,
      [],
      FLOOR_LIMITS,
      true,
    );
    if (pass.held === undefined) throw new Error("no held objects");
    held = pass.held;
    candidateTree = pass.checked.candidateTree;
    // The fork must not read the worktree again: it is gone.
    rmSync(wt, { recursive: true, force: true });
  });

  afterEach(() => {
    held.dispose();
    rmSync(tmp, { recursive: true, force: true });
  });

  const decisions = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: "decision-u-" + String(i),
      class: "technology",
    }));

  it("makes the commit object from the held pass, then the ref only on apply", () => {
    const heads = git(common, "for-each-ref", "refs/heads");
    const plan = planProvisional(
      common,
      baseCommit,
      candidateTree,
      decisions(1),
      held,
    );
    const entry = plan.entries.get("decision-u-0");
    expect(entry?.type).toBe("provisional.opened");
    const commit = provisionalCommitId(
      candidateTree,
      baseCommit,
      "decision-u-0",
    );
    expect(git(common, "cat-file", "-t", commit)).toBe("commit");
    expect(git(common, "rev-parse", commit + "^{tree}")).toBe(candidateTree);
    expect(git(common, "for-each-ref", "refs/helmwright/")).toBe("");
    plan.apply([]);
    const ref = provisionalRef("decision-u-0");
    expect(git(common, "rev-parse", ref)).toBe(commit);
    expect(git(common, "for-each-ref", "refs/heads")).toBe(heads);
    // A second apply finds the ref there: create-only refuses, the ref is unchanged.
    expect(() => {
      plan.apply([]);
    }).toThrow();
    expect(git(common, "rev-parse", ref)).toBe(commit);
  });

  it("refuses a pre-existing same-name ref and keeps it as it was", () => {
    const ref = provisionalRef("decision-u-0");
    git(common, "update-ref", ref, baseCommit);
    const plan = planProvisional(
      common,
      baseCommit,
      candidateTree,
      decisions(1),
      held,
    );
    expect(() => {
      plan.apply([]);
    }).toThrow();
    expect(git(common, "rev-parse", ref)).toBe(baseCommit);
  });

  it("reports the refs made before a later one fails (C5)", () => {
    // A ref below the second decision's name makes its ref a directory/file conflict.
    git(
      common,
      "update-ref",
      provisionalRef("decision-u-1") + "/x",
      baseCommit,
    );
    const plan = planProvisional(
      common,
      baseCommit,
      candidateTree,
      decisions(2),
      held,
    );
    const created: string[] = [];
    expect(() => {
      plan.apply(created);
    }).toThrow();
    expect(created).toEqual([provisionalRef("decision-u-0")]);
  });

  it("fails closed, with no commit made, if the held objects are packed (A2)", () => {
    const gitDir = join(held.objects, "..");
    git(gitDir, "--git-dir=" + gitDir, "repack", "-a", "-d", "-q");
    expect(() =>
      planProvisional(common, baseCommit, candidateTree, decisions(1), held),
    ).toThrow(/packed/);
    const commit = provisionalCommitId(
      candidateTree,
      baseCommit,
      "decision-u-0",
    );
    expect(() => git(common, "cat-file", "-e", commit)).toThrow();
  });

  it("fails closed, with no commit made, if a held object is missing (B4)", () => {
    // The tree is only in the held dir until the fork copies it.
    const gitDir = join(held.objects, "..");
    const blob = git(
      gitDir,
      "--git-dir=" + gitDir,
      "rev-parse",
      candidateTree + ":a.txt",
    );
    rmSync(join(held.objects, blob.slice(0, 2), blob.slice(2)));
    // The rev-list completeness guard fails, with git's own text.
    expect(() =>
      planProvisional(common, baseCommit, candidateTree, decisions(1), held),
    ).toThrow(/rev-list/);
    const commit = provisionalCommitId(
      candidateTree,
      baseCommit,
      "decision-u-0",
    );
    expect(() => git(common, "cat-file", "-e", commit)).toThrow();
  });

  it("logs a refusal, not a fork, past the cap, and writes no commit", () => {
    for (let i = 0; i < MAX_PROVISIONAL - 1; i += 1) {
      git(
        common,
        "update-ref",
        provisionalRef("decision-p-" + String(i)),
        baseCommit,
      );
    }
    const plan = planProvisional(
      common,
      baseCommit,
      candidateTree,
      decisions(2),
      held,
    );
    expect(plan.entries.get("decision-u-0")?.type).toBe("provisional.opened");
    expect(plan.entries.get("decision-u-1")).toEqual({
      type: "provisional.refused",
      payload: {
        kind: "provisional.refused",
        decisionId: "decision-u-1",
        reason: "cap",
      },
    });
    plan.apply([]);
    const count = git(common, "for-each-ref", "refs/helmwright/").split("\n");
    expect(count).toHaveLength(MAX_PROVISIONAL);
  });

  it("makes nothing for architecture and refuses a tree that is not held", () => {
    const arch = [{ id: "decision-u-0", class: "architecture" }];
    expect(
      planProvisional(common, baseCommit, candidateTree, arch, held).entries
        .size,
    ).toBe(0);
    expect(() =>
      planProvisional(common, baseCommit, "f".repeat(40), decisions(1), held),
    ).toThrow(/not the candidate tree/);
  });
});
