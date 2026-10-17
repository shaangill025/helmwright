// Generated from schemas/provisional-event.schema.json by scripts/generate.ts. Do not edit.

/**
 * Payload of a provisional-branch event in the session log (PB, X3 revised), validated before it is appended. `kind` equals the event's `type`; the writer checks that relation. A run that ends with a pending owner decision of class technology or scope forks one provisional commit per decision from the floor's own candidate tree. Fork and discard are Ring 0 and pure functions of logged facts: the commit ID is recomputed on replay. The log holds no recommendation (Q48). PB-1 writes `provisional.opened` or `provisional.refused`; the other two are reserved for the work that builds on a provisional branch (PB-2) and for the owner's answer (PB-3).
 */
export type ProvisionalEvent =
  | ProvisionalOpened
  | ProvisionalRefused
  | ProvisionalAttached
  | ProvisionalResolved;
export type DecisionId = string;
/**
 * A full lowercase hex git object ID (SHA-1 or SHA-256).
 */
export type Oid = string;
export type RunId = string;
/**
 * A Brief option ID.
 */
export type OptionId = string;

/**
 * A provisional commit was made for the owner decision `decisionId`, logged after that `decision.opened` and before `floor.checked`, in the floor's transaction. `ref` is `refs/helmwright/provisional/<decisionId>` in the host repository's common git dir; it is created only after the transaction commits, is never under `refs/heads` and is never pushed. `commit` is the deterministic commit of `tree` (the floor's `candidateTree`) on `baseCommit`.
 */
export interface ProvisionalOpened {
  kind: "provisional.opened";
  decisionId: DecisionId;
  /**
   * The decision's class: architecture is never provisional.
   */
  class: "scope" | "technology";
  commit: Oid;
  /**
   * A full lowercase hex git object ID (SHA-1 or SHA-256).
   */
  tree: string;
  /**
   * A full lowercase hex git object ID (SHA-1 or SHA-256).
   */
  baseCommit: string;
  ref: string;
}
/**
 * The fork for the owner decision `decisionId` was refused, logged in place of `provisional.opened`: `cap` means the repository already has the most open provisional branches. The floor is logged as usual; only the run fails.
 */
export interface ProvisionalRefused {
  kind: "provisional.refused";
  decisionId: DecisionId;
  reason: "cap";
}
/**
 * Reserved (PB-2): a run's work was built on the provisional commit `commit` of the pending decision `decisionId`. Not written by PB-1.
 */
export interface ProvisionalAttached {
  kind: "provisional.attached";
  decisionId: DecisionId;
  runId: RunId;
  commit: Oid;
}
/**
 * Reserved (PB-3): the owner answered `decisionId`, so its provisional branch was confirmed or discarded. Not written by PB-1.
 */
export interface ProvisionalResolved {
  kind: "provisional.resolved";
  decisionId: DecisionId;
  outcome: "confirmed" | "discarded";
  chosenOption: OptionId;
  /**
   * Who resolved it: the ID of the event or the owner answer that did, as shown text.
   */
  resolvedBy: string;
}
