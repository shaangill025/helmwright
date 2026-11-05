import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

// Test-only: pretend the price verification is done, to check the allowlist that
// must hold after the flip. The production constant stays false.
vi.mock("../../src/proxy/ledger.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/proxy/ledger.ts")>()),
  PRICES_VERIFIED: true,
}));

// Capture the options of the https upstream request; no socket is opened.
const sent = vi.hoisted(() => ({ options: [] as Record<string, unknown>[] }));
vi.mock("node:https", () => ({
  request: (options: Record<string, unknown>) => {
    sent.options.push(options);
    const req = new EventEmitter() as EventEmitter & { end: () => void };
    req.end = () => {
      const refused = Object.assign(new Error("refused"), {
        code: "ECONNREFUSED",
      });
      queueMicrotask(() => req.emit("error", refused));
    };
    return req;
  },
}));

const { SpendLedger } = await import("../../src/proxy/ledger.ts");
const { startProxy } = await import("../../src/proxy/server.ts");
const { FAKE_KEY, TOKEN, useHarness } =
  await import("./support/fake-upstream.ts");

const h = useHarness();

const base = () => ({
  token: TOKEN,
  apiKey: FAKE_KEY,
  runId: "run-1",
  ledger: new SpendLedger({
    path: h.ledgerPath(),
    totalCapUsd: 25,
    runCapUsd: 2,
  }),
});

describe("upstream allowlist after PRICES_VERIFIED flips", () => {
  it("refuses every host but api.anthropic.com", async () => {
    for (const url of [
      "https://relay.example",
      "https://api.anthropic.com.",
      "https://api.anthropic.com:8443",
      "https://user:pw@api.anthropic.com",
      "https://user@api.anthropic.com",
      "https://:pw@api.anthropic.com",
      "https://api.anthropic.com/v1",
      "https://api.anthropic.com/?x=1",
      "https://api.anthropic.com.evil.example",
      "https://localhost",
      "http://api.anthropic.com",
    ]) {
      await expect(
        startProxy({ ...base(), upstreamBaseUrl: url }),
        url,
      ).rejects.toThrow(/upstream/);
    }
  });

  it("starts for the exact Anthropic host and for loopback test upstreams", async () => {
    for (const url of [
      "https://api.anthropic.com",
      "https://api.anthropic.com/",
      "https://api.anthropic.com:443",
      "https://API.Anthropic.com",
      h.upstreamUrl(),
    ]) {
      h.proxies.push(await startProxy({ ...base(), upstreamBaseUrl: url }));
    }
    h.proxies.push(await startProxy(base()));
  });
});

describe("https upstream request options", () => {
  it("keeps rejectUnauthorized true and uses a one-off agent", async () => {
    const proxy = await h.start({ upstreamBaseUrl: "https://127.0.0.1:9" });
    expect((await h.call(proxy)).status).toBe(502);
    expect(sent.options).toHaveLength(1);
    expect(sent.options[0]).toMatchObject({
      protocol: "https:",
      rejectUnauthorized: true,
      agent: false,
    });
  });
});
