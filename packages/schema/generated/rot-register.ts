// Generated from schemas/rot-register.schema.json by scripts/generate.ts. Do not edit.

/**
 * The rot register (07 rule 2, Q60): the assumption each component was built on, reviewed when a trigger fires. This schema checks each entry's shape; that every module is covered, every component exists and no component repeats are checked by the register's test.
 *
 * @minItems 1
 * @maxItems 1024
 */
export type RotRegister = [RotRegisterEntry, ...RotRegisterEntry[]];
/**
 * A calendar date, YYYY-MM-DD.
 */
export type RotRegisterDate = string;
export type RotReviewTrigger = "model" | "engine" | "milestone";

export interface RotRegisterEntry {
  /**
   * Repository-relative path of a file, or of a directory that covers every module below it.
   */
  component: string;
  /**
   * The component's ring in the 05 Rings table: 0 owner only, 1 evolve agent through the gate, 2 harness code.
   */
  ring: 0 | 1 | 2;
  /**
   * The assumption the component was built on, as one line.
   */
  assumption: string;
  /**
   * Where the assumption comes from or is tested: a design section ("07 rule 2"), a decision row ("decisions Q60"), a test path or a corpus entry.
   *
   * @minItems 1
   * @maxItems 32
   */
  evidence: [string, ...string[]];
  added: RotRegisterDate;
  lastReviewed: RotRegisterDate;
  /**
   * What makes the assumption due for review: a model change, an engine change or a milestone end.
   *
   * @minItems 1
   * @maxItems 3
   */
  reviewTrigger:
    | [RotReviewTrigger]
    | [RotReviewTrigger, RotReviewTrigger]
    | [RotReviewTrigger, RotReviewTrigger, RotReviewTrigger];
}
