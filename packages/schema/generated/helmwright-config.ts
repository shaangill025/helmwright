// Generated from schemas/helmwright-config.schema.json by scripts/generate.ts. Do not edit.

/**
 * The project's helmwright.config.json (08, Q51). Every key is optional and a missing key takes its default. Each setting lists its default and the alternatives of design 08; the loader admits only the default until an alternative has its own fixture (07 rule 1). Changing a Ring 0 setting is always-ask (08, Q51).
 */
export interface HelmwrightConfig {
  intake?: {
    /**
     * Who classifies a task at intake: the deterministic rubric with owner override, logged (default); the owner by hand; or the model.
     */
    classification?: "rubric" | "owner" | "model";
  };
  friction?: {
    /**
     * Default friction: moderate (a brief at each architectural decision, sparring opt-in); minimal (stop only for permissions); low (one brief before work); high (sparring on for non-trivial work).
     */
    defaultIntensity?: "moderate" | "minimal" | "low" | "high";
    /**
     * Whether chores drop to minimal friction automatically.
     */
    choreDowngrade?: "on" | "off";
  };
  decisions?: {
    /**
     * Decision detection: the structural floor plus model self-flagging, plan-time pass first (default); the floor only; self-flagging only; or at execution time only.
     */
    detection?:
      "floorAndSelfFlag" | "floorOnly" | "selfFlagOnly" | "executionTimeOnly";
    /**
     * Dependent work while an owned decision is pending: a provisional branch for technology and scope, a hard stop for architecture (default); a hard stop for all; or provisional for all.
     */
    pendingWork?:
      "provisionalExceptArchitecture" | "hardStopAll" | "provisionalAll";
    /**
     * Brief format: terse and expandable (default); a full memo; or the recommendation only.
     */
    briefFormat?: "terse" | "fullMemo" | "recommendationOnly";
    /**
     * Who decides done: a fresh-context evaluator that only reads and runs, whose verdict flips criteria (default); or generator self-reports (not recommended).
     */
    evaluator?: "freshContext" | "generatorSelfReports";
  };
  permissions?: {
    /**
     * A permission policy override. It may only make the harness's default policy stricter; resolvePolicy validates it against permission-policy.schema.json and the floor. Absent means the default policy.
     */
    policy?: {
      [k: string]: unknown;
    };
    untrustedContent?: {
      /**
       * How third-party content is read: an explore-role session returns a bounded, screened hint to the acting engine (default); or a single engine reads everything (not recommended).
       */
      mode?: "exploreSplit" | "singleEngine";
      /**
       * The cap, in bytes, on the explore session's hint. A config may lower it, never raise it above Q58's 1024.
       */
      hintBytes?: number;
    };
  };
  ownerLoop?: {
    /**
     * Pre-commitment: on for every owned decision, revision allowed after the reveal (default); on in sparring mode only; or off.
     */
    preCommitment?: "everyOwnedDecision" | "sparringOnly" | "off";
    /**
     * Consequence loop: automatic signals and scheduled reviews, null outcomes recorded (default); signals only; or reviews only.
     */
    consequences?: "signalsAndReviews" | "signalsOnly" | "reviewsOnly";
    /**
     * Tutor: just-in-time explanations and a concept map (default); just-in-time only; or both with spaced follow-ups (M2).
     */
    tutor?:
      "justInTimeAndConceptMap" | "justInTimeOnly" | "withSpacedFollowUps";
  };
  /**
   * Process topology: session and harness in one process, the sandbox out of process (default); all in one process; or all separate. Moves to a deployment file in M5.
   */
  topology?: "sessionHarnessOneProcess" | "allInOneProcess" | "allSeparate";
}
