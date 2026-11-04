import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateProvisionalEvent,
  type Event,
  type ProvisionalOpened,
  type ProvisionalRefused,
} from "@helmwright/schema";
import { runGit } from "../config/config.ts";
import { persistHeld, type HeldObjects } from "./tree.ts";

// Ring 0 (PB-1, X3 revised): the fork of a provisional branch is a pure function of
// logged facts (Q68a). The commit is built from the floor's own candidate tree, with a
// fixed identity and date, so replay recomputes its ID from the log alone. The log holds
// no recommendation (Q48).

/** The most open provisional branches in one repository; past it a fork is refused. */
export const MAX_PROVISIONAL = 10;
/** Where the refs live in the host repo's common dir: never under refs/heads, never pushed. */
export const PROVISIONAL_PREFIX = "refs/helmwright/provisional/";

const IDENTITY = "helmwright <helmwright@localhost> 0 +0000";
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const DECISION = /^decision-[A-Za-z0-9][A-Za-z0-9_-]{0,118}$/;
const PROVISIONAL_CLASSES = new Set(["technology", "scope"]);
const PROVISIONAL_TYPES = new Set([
  "provisional.opened",
  "provisional.refused",
]);

/** The provisional ref of `decisionId`. @throws Error for a bad ID */
export function provisionalRef(decisionId: string): string {
  if (!DECISION.test(decisionId)) throw new Error("not a decision ID");
  return PROVISIONAL_PREFIX + decisionId;
}

/** The commit's raw body: tree, parent, fixed identity and date, message with the ID. */
function commitBody(tree: string, baseCommit: string, id: string): string {
  return [
    "tree " + tree,
    "parent " + baseCommit,
    "author " + IDENTITY,
    "committer " + IDENTITY,
    "",
    "helmwright provisional branch for " + id,
    "",
  ].join("\n");
}

/**
 * The ID git gives the provisional commit of `tree` on `baseCommit` for `decisionId`:
 * the hash of "commit <length>\0<body>", SHA-256 if the IDs are 64 digits, else SHA-1.
 * Same inputs, same ID, with no git call.
 * @throws Error for a malformed input
 */
export function provisionalCommitId(
  tree: string,
  baseCommit: string,
  decisionId: string,
): string {
  if (
    !OID.test(tree) ||
    !OID.test(baseCommit) ||
    tree.length !== baseCommit.length
  ) {
    throw new Error("tree and base commit must be object IDs of one format");
  }
  provisionalRef(decisionId);
  const body = Buffer.from(commitBody(tree, baseCommit, decisionId), "utf8");
  const head = Buffer.from("commit " + String(body.length) + "\0", "utf8");
  const algorithm = tree.length === 64 ? "sha256" : "sha1";
  return createHash(algorithm).update(head).update(body).digest("hex");
}

/** The number of open provisional refs in the repo whose common git dir is `commonDir`. */
export function openProvisional(commonDir: string): number {
  const out = runGit(commonDir, [
    ...["--git-dir=" + commonDir, "for-each-ref", "--format=%(refname)"],
    PROVISIONAL_PREFIX,
  ]);
  return out
    .toString("utf8")
    .split("\n")
    .filter((l) => l !== "").length;
}

/** An owner decision as the floor opened it: the fields the fork reads. */
export interface PendingDecision {
  readonly id: string;
  readonly class: string;
}

/** What the floor logs for one decision: a fork or its refusal. */
export type ProvisionalEntry =
  | { readonly type: "provisional.opened"; readonly payload: ProvisionalOpened }
  | {
      readonly type: "provisional.refused";
      readonly payload: ProvisionalRefused;
    };

/** A planned fork: the events to log, and what to do once the log has committed. */
export interface ProvisionalPlan {
  /** By decision ID, for each decision of a provisional class. */
  readonly entries: ReadonlyMap<string, ProvisionalEntry>;
  /** Makes the refs, create-only; call only after the log transaction commits. */
  readonly apply: () => void;
}

/**
 * Plans the forks of `decisions` (the owner decisions the floor opened, of any class;
 * architecture is never provisional). Each gets `provisional.opened` while the repo has
 * room under the cap, else `provisional.refused`. The objects of the floor's own pass
 * (`held`) are copied into the host and one commit object is written per fork: the
 * worktree is not read again. No ref is made until `apply`.
 * @throws Error (fail closed) if the held tree is not `candidateTree`, git fails or a
 * payload is not a valid provisional event
 */
export function planProvisional(
  commonDir: string,
  baseCommit: string,
  candidateTree: string,
  decisions: readonly PendingDecision[],
  held: HeldObjects | undefined,
): ProvisionalPlan {
  const forks = decisions.filter((d) => PROVISIONAL_CLASSES.has(d.class));
  const entries = new Map<string, ProvisionalEntry>();
  if (forks.length === 0) return { entries, apply: () => undefined };
  if (held?.tree !== candidateTree) {
    throw new Error("the floor's objects are not the candidate tree's");
  }
  const room = Math.max(0, MAX_PROVISIONAL - openProvisional(commonDir));
  const opened: ProvisionalOpened[] = [];
  for (const { id, class: cls } of forks) {
    if (opened.length >= room) {
      const payload: ProvisionalRefused = {
        kind: "provisional.refused",
        decisionId: id,
        reason: "cap",
      };
      entries.set(id, { type: "provisional.refused", payload });
      continue;
    }
    const payload: ProvisionalOpened = {
      kind: "provisional.opened",
      decisionId: id,
      class: cls as ProvisionalOpened["class"],
      commit: provisionalCommitId(candidateTree, baseCommit, id),
      tree: candidateTree,
      baseCommit,
      ref: provisionalRef(id),
    };
    opened.push(payload);
    entries.set(id, { type: "provisional.opened", payload });
  }
  for (const { payload } of entries.values()) {
    if (!validateProvisionalEvent({ ...payload })) {
      throw new Error("provisional event is not valid");
    }
  }
  if (opened.length > 0) {
    persistHeld(held, commonDir);
    const temp = mkdtempSync(join(tmpdir(), "helmwright-prov-"));
    try {
      for (const p of opened) {
        const file = join(temp, p.decisionId);
        const body = commitBody(p.tree, p.baseCommit, p.decisionId);
        writeFileSync(file, body, { mode: 0o600 });
        const made = runGit(commonDir, [
          ...["--git-dir=" + commonDir, "hash-object", "-w"],
          ...["-t", "commit", "--no-filters", "--", file],
        ])
          .toString("utf8")
          .trim();
        if (made !== p.commit) {
          throw new Error("the commit ID is not recomputable");
        }
      }
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  }
  const zero = "0".repeat(baseCommit.length);
  const apply = () => {
    for (const p of opened) {
      // The zero old value: create only, never move an existing ref.
      runGit(commonDir, [
        ...["--git-dir=" + commonDir, "update-ref", "--no-deref"],
        ...["--", p.ref, p.commit, zero],
      ]);
    }
  };
  return { entries, apply };
}

/**
 * Replay faults of one run's provisional events (Q68a), each fixed text with the event's
 * `seq`: an invalid payload, a commit not recomputed from its tree, base commit and
 * decision ID, a tree or base commit that is not `floor.checked`'s, a ref or class that is
 * not the decision's, an event not directly after its owner `decision.opened`, a second
 * one for a decision, or a floor that did not pass. A passing floor whose owner decision
 * of class technology or scope has neither `provisional.opened` nor `provisional.refused`
 * is a fault, unless the log is from before PB-1: `history` (all provisional events of
 * the whole log; default this run's) has none before that `floor.checked`.
 */
export function provisionalFaults(
  events: readonly Event[],
  history: readonly Event[] = events,
): string[] {
  const faults: string[] = [];
  const checked = events.find((e) => e.type === "floor.checked");
  const seen = new Set<string>();
  for (const [index, e] of events.entries()) {
    if (!PROVISIONAL_TYPES.has(e.type)) continue;
    const fault = (text: string) =>
      faults.push(`seq ${String(e.seq)}: ${text}`);
    const p = e.payload;
    const opened = e.type === "provisional.opened";
    if (!validateProvisionalEvent({ ...p }) || p["kind"] !== e.type) {
      fault(e.type + " that is not a valid provisional event");
      continue;
    }
    const decisionId = String(p["decisionId"]);
    if (seen.has(decisionId)) fault("second provisional event for a decision");
    seen.add(decisionId);
    if (checked?.payload["verdict"] !== "pass") {
      fault(e.type + " without a passing floor.checked");
    }
    const prior = events[index - 1];
    const owned =
      prior?.type === "decision.opened" &&
      prior.payload["authority"] === "owner" &&
      prior.payload["id"] === decisionId;
    if (!owned) {
      fault(e.type + " is not directly after its owner decision");
    } else if (!PROVISIONAL_CLASSES.has(String(prior.payload["class"]))) {
      fault("provisional event for a class that is never provisional");
    } else if (opened && prior.payload["class"] !== p["class"]) {
      fault("provisional class is not the decision's");
    }
    if (!opened) continue;
    const { commit, tree, baseCommit } = p as Record<string, string>;
    let recomputed: string | undefined;
    try {
      recomputed = provisionalCommitId(
        tree ?? "",
        baseCommit ?? "",
        decisionId,
      );
    } catch {
      recomputed = undefined;
    }
    if (recomputed !== commit) {
      fault(
        "provisional commit is not recomputed from its tree and base commit",
      );
    }
    if (tree !== checked?.payload["candidateTree"]) {
      fault("provisional tree is not floor.checked's candidateTree");
    }
    if (baseCommit !== checked?.payload["baseCommit"]) {
      fault("provisional base commit is not floor.checked's");
    }
    if (p["ref"] !== PROVISIONAL_PREFIX + decisionId) {
      fault("provisional ref is not the decision's");
    }
  }
  if (checked?.payload["verdict"] === "pass") {
    const legacy = !history.some(
      (h) => PROVISIONAL_TYPES.has(h.type) && h.seq < checked.seq,
    );
    if (!legacy) {
      for (const e of events) {
        const forkable =
          e.type === "decision.opened" &&
          e.payload["authority"] === "owner" &&
          PROVISIONAL_CLASSES.has(String(e.payload["class"]));
        if (forkable && !seen.has(String(e.payload["id"]))) {
          faults.push(
            `seq ${String(e.seq)}: owner decision without provisional.opened or provisional.refused`,
          );
        }
      }
    }
  }
  return faults;
}
