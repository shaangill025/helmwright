// Generated from schemas/rot-register.schema.json by scripts/generate.ts. Do not edit.
import type { ErrorObject } from "ajv";
import type { RotRegister } from "./rot-register.ts";
export declare const validate: ((data: unknown) => data is RotRegister) & {
  errors?: ErrorObject[] | null;
};
export default validate;
