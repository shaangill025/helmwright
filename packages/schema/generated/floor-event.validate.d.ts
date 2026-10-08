// Generated from schemas/floor-event.schema.json by scripts/generate.ts. Do not edit.
import type { ErrorObject } from "ajv";
import type { FloorEvent } from "./floor-event.ts";
export declare const validate: ((data: unknown) => data is FloorEvent) & {
  errors?: ErrorObject[] | null;
};
export default validate;
