// Generated from schemas/tool-event.schema.json by scripts/generate.ts. Do not edit.
import type { ErrorObject } from "ajv";
import type { ToolEvent } from "./tool-event.ts";
export declare const validate: ((data: unknown) => data is ToolEvent) & {
  errors?: ErrorObject[] | null;
};
export default validate;
