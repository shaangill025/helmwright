// Generated from schemas/owner-event.schema.json by scripts/generate.ts. Do not edit.
import type { ErrorObject } from "ajv";
import type { OwnerEvent } from "./owner-event.ts";
export declare const validate: ((data: unknown) => data is OwnerEvent) & {
  errors?: ErrorObject[] | null;
};
export default validate;
