// Generated from schemas/provisional-event.schema.json by scripts/generate.ts. Do not edit.
import type { ErrorObject } from "ajv";
import type { ProvisionalEvent } from "./provisional-event.ts";
export declare const validate: ((data: unknown) => data is ProvisionalEvent) & {
  errors?: ErrorObject[] | null;
};
export default validate;
