// Generated from schemas/helmwright-config.schema.json by scripts/generate.ts. Do not edit.
import type { ErrorObject } from "ajv";
import type { HelmwrightConfig } from "./helmwright-config.ts";
export declare const validate: ((data: unknown) => data is HelmwrightConfig) & {
  errors?: ErrorObject[] | null;
};
export default validate;
