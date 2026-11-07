import { describe, expect, it } from "vitest";
import { logEntry } from "../../src/proxy/redact.ts";

describe("log redaction", () => {
  it("logs only the allowlisted fields", () => {
    const entry = logEntry({
      runId: "r",
      model: "m",
      tokens: { input: 1, output: 2, secret: "secret" },
      cost: 3,
      status: 200,
      latencyMs: 4,
      requestSha256: "ab",
      event: "x-api-key secret",
      authorization: "Bearer secret",
      "x-api-key": "secret",
      body: "secret",
    });
    expect(Object.keys(entry).sort()).toEqual([
      "cost",
      "latencyMs",
      "model",
      "requestSha256",
      "runId",
      "status",
      "tokens",
    ]);
    expect(JSON.stringify(entry)).not.toContain("secret");
  });

  it("zeroes missing token counts", () => {
    expect(logEntry({ runId: "r" }).tokens).toEqual({ input: 0, output: 0 });
  });
});
