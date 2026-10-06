// Generated from schemas/event.schema.json by scripts/generate.ts. Do not edit.
import type { ErrorObject } from "ajv";
import type { Event } from "./event.ts";
export declare const validate: ((data: unknown) => data is Event) & {
  errors?: ErrorObject[] | null;
};
export default validate;
