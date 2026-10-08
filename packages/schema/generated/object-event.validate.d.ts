// Generated from schemas/object-event.schema.json by scripts/generate.ts. Do not edit.
import type { ErrorObject } from "ajv";
import type { ObjectEvent } from "./object-event.ts";
export declare const validate: ((data: unknown) => data is ObjectEvent) & {
  errors?: ErrorObject[] | null;
};
export default validate;
