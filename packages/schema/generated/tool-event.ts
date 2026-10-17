// Generated from schemas/tool-event.schema.json by scripts/generate.ts. Do not edit.

/**
 * Payload of a tool-output event in the session log (Q69), validated before it is appended. `kind` equals the event's `type`; the writer checks that relation.
 */
export type ToolEvent = ToolOutputOffloaded;

/**
 * A tool result over the threshold was written whole to `<stateDir>/offload/<sha256>.txt`, outside the sandbox workspace, and the engine saw a head and tail preview plus a pointer line built from this payload alone. `truncatedAtSource` is true when the sandbox hit its capture ceiling, so the file is itself cut.
 */
export interface ToolOutputOffloaded {
  kind: "tool.output.offloaded";
  /**
   * The engine's tool call ID, as in the loop events: printable ASCII without spaces, 1 to 256 characters.
   */
  toolCallId: string;
  /**
   * Lowercase hex SHA-256 of the offloaded text (UTF-8), which names its file.
   */
  sha256: string;
  /**
   * Size of the offloaded text in UTF-8 bytes.
   */
  bytes: number;
  truncatedAtSource: boolean;
}
