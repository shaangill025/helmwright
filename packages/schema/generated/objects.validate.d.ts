// Generated from schemas/objects.schema.json by scripts/generate.ts. Do not edit.
import type { ErrorObject } from "ajv";
import type { ObjectRecord } from "./objects.ts";
export declare const validate: ((data: unknown) => data is ObjectRecord) & {
  errors?: ErrorObject[] | null;
};
export default validate;
