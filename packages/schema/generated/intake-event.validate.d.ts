// Generated from schemas/intake-event.schema.json by scripts/generate.ts. Do not edit.
import type { ErrorObject } from "ajv";
import type { IntakeEvent } from "./intake-event.ts";
export declare const validate: ((data: unknown) => data is IntakeEvent) & {
  errors?: ErrorObject[] | null;
};
export default validate;
