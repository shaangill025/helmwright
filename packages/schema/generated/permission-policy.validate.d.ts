// Generated from schemas/permission-policy.schema.json by scripts/generate.ts. Do not edit.
import type { ErrorObject } from "ajv";
import type { PermissionPolicy } from "./permission-policy.ts";
export declare const validate: ((data: unknown) => data is PermissionPolicy) & {
  errors?: ErrorObject[] | null;
};
export default validate;
