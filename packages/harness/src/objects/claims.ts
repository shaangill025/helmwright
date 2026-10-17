import type { BriefClaim } from "@helmwright/schema";
import { deepFreeze } from "../permission/policy.ts";

// Ring 0 (Q70-1): this module must not import the session log, which imports it.

/** The evidence tiers of a Brief claim, strongest first (Q70-1). */
export type ClaimTier = BriefClaim["tier"];

/**
 * What each tier means, as the owner approved it (Q70-1). Ring 0 and fixed: the wording
 * is not a setting, and the card and docs show these exact strings.
 */
export const TIER_MEANING: Readonly<Record<ClaimTier, string>> = deepFreeze({
  Direct:
    "The harness saw this itself in this run's recorded evidence, such as a diff, a file, a command result or a log event, and the claim cites it.",
  Supported:
    "A cited source outside this run's own observation backs this, such as documentation, a registry entry or an earlier run's record, but the harness did not see it happen here.",
  Inferred:
    "The harness reasoned this from other claims in this brief and has not checked it.",
  Speculative:
    "This is a guess with no evidence behind it; read it as a question, not a fact.",
  Unknown:
    "The harness did not check this or could not find out, and the claim says what is missing.",
});

/** An Inferred claim's reference to an earlier claim of the same Brief, by its index. */
const CLAIM_REF = /^claim:(0|[1-9][0-9]{0,2})$/;

/**
 * Whether an evidence ID is in the log, for a claim of the given scope (owner ruling,
 * 2026-10-17): `"run"` (a Direct claim) accepts an event or signal ID of the Brief's own
 * run, `"otherRun"` (a Supported claim) one of another run; an artifact ID is accepted
 * for both. The log builds it from its events table; it is pure.
 */
export type EvidenceResolver = (
  id: string,
  scope: "run" | "otherRun",
) => boolean;

/**
 * The resolver of the builder path only: a builder (`decisionOpened`) has no log in hand,
 * so it accepts any ID and the log applies the real resolver on write and on every read.
 */
export const RESOLVES_ANY: EvidenceResolver = () => true;

/**
 * Why `claims` break the tier rules (Q70-1), as fixed text, or undefined. Direct needs at
 * least one evidence ID that `resolves` for the Brief's own run; Supported one that
 * resolves for another run (an artifact ID does for both); Inferred needs at least one
 * reference `claim:<n>` and only such references, each to an earlier claim of the same
 * Brief; Speculative and Unknown have no evidence. No claim repeats a reference.
 */
export function claimsReason(
  claims: readonly BriefClaim[],
  resolves: EvidenceResolver,
): string | undefined {
  for (const [i, claim] of claims.entries()) {
    const at = "decision.opened claim " + String(i) + " (" + claim.tier + ") ";
    const { evidence } = claim;
    if (new Set(evidence).size !== evidence.length) {
      return at + "repeats an evidence reference";
    }
    switch (claim.tier) {
      case "Direct":
      case "Supported": {
        if (evidence.length === 0) return at + "needs evidence";
        const scope = claim.tier === "Direct" ? "run" : "otherRun";
        if (evidence.some((id) => CLAIM_REF.test(id) || !resolves(id, scope))) {
          return (
            at +
            (scope === "run"
              ? "needs evidence from this run in the log"
              : "needs evidence from another run in the log")
          );
        }
        break;
      }
      case "Inferred": {
        const refs = evidence.map((id) => CLAIM_REF.exec(id)?.[1]);
        if (
          refs.length === 0 ||
          refs.some((n) => n === undefined || Number(n) >= i)
        ) {
          return at + "needs references to earlier claims";
        }
        break;
      }
      case "Speculative":
      case "Unknown":
        if (evidence.length > 0) return at + "has no evidence";
        break;
    }
  }
  return undefined;
}
