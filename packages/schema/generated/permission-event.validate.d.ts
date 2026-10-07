// Generated from schemas/permission-event.schema.json by scripts/generate.ts. Do not edit.
import type { ErrorObject } from "ajv";
import type { PermissionEvent } from "./permission-event.ts";
export declare const validate: ((data: unknown) => data is PermissionEvent) & {
  errors?: ErrorObject[] | null;
};
export default validate;
