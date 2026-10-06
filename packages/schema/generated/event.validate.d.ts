// Generated from schemas/event.schema.json by scripts/generate.ts. Do not edit.
import type { Event } from "./event.ts";
export declare const validate: ((data: unknown) => data is Event) & {
  errors?: unknown[] | null;
};
export default validate;
