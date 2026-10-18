import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";
import {
  MODEL_PRICES,
  SpendLedger,
  preflightCostMicroUsd,
} from "../../src/proxy/ledger.ts";
import { chargeForUpstreamError, startProxy } from "../../src/proxy/server.ts";
import {
  FAKE_KEY,
  MODEL,
  TOKEN,
  closedPortUrl,
  message,
  usageReply,
  useHarness,
} from "./support/fake-upstream.ts";

const h = useHarness();

describe("startProxy refusals", () => {
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

  it("allows only loopback upstreams while prices are unverified", async () => {
    await expect(startProxy(base())).rejects.toThrow(/verified/);
    for (const url of [
      "https://api.anthropic.com/",
      "https://api.anthropic.com.",
      "https://API.anthropic.com:443/v1",
      "https://user:pw@api.anthropic.com",
      "https://relay.example",
    ]) {
      await expect(
        startProxy({ ...base(), upstreamBaseUrl: url }),
        url,
      ).rejects.toThrow(/verified/);
    }
  });

  it("refuses to start with TLS verification switched off", async () => {
    vi.stubEnv("NODE_TLS_REJECT_UNAUTHORIZED", "0");
    await expect(
      startProxy({ ...base(), upstreamBaseUrl: h.upstreamUrl() }),
    ).rejects.toThrow(/TLS/);
    vi.unstubAllEnvs();
  });

  it("refuses plain http to a non-loopback host", async () => {
    await expect(
      startProxy({ ...base(), upstreamBaseUrl: "http://example.com" }),
    ).rejects.toThrow(/loopback/);
    for (const url of [
      "http://127.0.0.1:9",
      "http://localhost:9",
      "http://[::1]:9",
    ]) {
      const proxy = await startProxy({ ...base(), upstreamBaseUrl: url });
      h.proxies.push(proxy);
    }
  });

  it("refuses a token shorter than 32 characters", async () => {
    await expect(
      startProxy({
        ...base(),
        token: "a".repeat(31),
        upstreamBaseUrl: h.upstreamUrl(),
      }),
    ).rejects.toThrow(/token/);
  });
});

describe("request hardening", () => {
  it("answers 403 to a Host header that is not the loopback address", async () => {
    const proxy = await h.start();
    const port = String(proxy.port);
    for (const host of ["evil.example", `evil.example:${port}`, "127.0.0.1"]) {
      expect((await h.call(proxy, { headers: { host } })).status, host).toBe(
        403,
      );
    }
    for (const host of [`127.0.0.1:${port}`, `localhost:${port}`]) {
      expect((await h.call(proxy, { headers: { host } })).status, host).toBe(
        200,
      );
    }
  });

  it("forwards the canonical body, so priced fields equal sent fields", async () => {
    const proxy = await h.start({ runCapUsd: 0.5 });
    const raw = `{"model":"${MODEL}","max_tokens":1,"max_tokens":100000,"messages":[]}`;
    const reply = await h.call(proxy, { body: raw });
    // The last duplicate wins: 100000 tokens could pass the run cap.
    expect(reply.status).toBe(402);
    const small = `{"model":"${MODEL}","max_tokens":100000,"max_tokens":5,"messages":[]}`;
    expect((await h.call(proxy, { body: small })).status).toBe(200);
    expect(h.seen).toHaveLength(1);
    expect(h.seen[0]?.body).toBe(JSON.stringify(JSON.parse(small)));
  });

  it("drops anthropic-beta from the forwarded headers", async () => {
    const proxy = await h.start();
    await h.call(proxy, { headers: { "anthropic-beta": "some-beta" } });
    expect(h.seen[0]?.headers["anthropic-beta"]).toBeUndefined();
  });

  it("logs an unpriced model as unpriced", async () => {
    const proxy = await h.start();
    for (const model of ["other-model", "constructor"]) {
      await h.call(proxy, {
        body: JSON.stringify({ model, max_tokens: 5, messages: [] }),
      });
    }
    expect(h.logs.map((l) => l.model)).toEqual(["unpriced", "unpriced"]);
  });

  it("names a bad max_tokens plainly", async () => {
    const proxy = await h.start();
    const bad = await h.call(proxy, {
      body: JSON.stringify({ model: MODEL, max_tokens: 1.5, messages: [] }),
    });
    expect(bad.status).toBe(400);
    expect(bad.body).toMatch(/positive integer/);
  });
});

describe("chargeForUpstreamError", () => {
  it("charges 0 only for errors before the socket connected", () => {
    expect(chargeForUpstreamError("ECONNREFUSED", 99)).toBe(0);
    expect(chargeForUpstreamError("ENOTFOUND", 99)).toBe(0);
    for (const code of ["ECONNRESET", "ETIMEDOUT", "EPIPE", undefined]) {
      expect(chargeForUpstreamError(code, 99), String(code)).toBe(99);
    }
  });
});

describe("settle failures and edge hosts", () => {
  it("records a paid call and answers 500 when settle cannot lock", async () => {
    h.delayMs = 300;
    const proxy = await h.start({ lockTimeoutMs: 100 });
    const pending = h.call(proxy);
    while (h.seen.length === 0) await new Promise((r) => setTimeout(r, 10));
    writeFileSync(`${h.ledgerPath()}.lock`, "");
    const reply = await pending;
    rmSync(`${h.ledgerPath()}.lock`);
    expect(reply.status).toBe(500);
    expect(h.logs).toHaveLength(1);
    expect(h.logs[0]?.cost).toBeGreaterThan(0);
    const file = JSON.parse(readFileSync(h.ledgerPath(), "utf8")) as {
      holds: Record<string, unknown>;
    };
    expect(Object.keys(file.holds)).toHaveLength(1);
  });

  it("keeps the paid cost when the ledger file is removed mid-call", async () => {
    h.delayMs = 300;
    const proxy = await h.start();
    const pending = h.call(proxy);
    while (h.seen.length === 0) await new Promise((r) => setTimeout(r, 10));
    rmSync(h.ledgerPath());
    expect((await pending).status).toBe(200);
    const price = MODEL_PRICES[MODEL];
    expect(h.reopen().totalMicroUsd()).toBe(
      100 * (price?.inputMicroUsdPerToken ?? 0) +
        50 * (price?.outputMicroUsdPerToken ?? 0),
    );
  });

  it("connects to an upstream on ::1", async (ctx) => {
    const v6 = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(h.reply.body);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        v6.once("error", reject);
        v6.listen(0, "::1", resolve);
      });
    } catch {
      ctx.skip(); // ::1 is not available on this host.
      return;
    }
    const port = (v6.address() as AddressInfo).port;
    const proxy = await h.start({
      upstreamBaseUrl: `http://[::1]:${String(port)}`,
    });
    expect((await h.call(proxy)).status).toBe(200);
    await new Promise((r) => v6.close(r));
  });
});

describe("billing edge cases", () => {
  const worstCase = () =>
    preflightCostMicroUsd(MODEL, 1000, Buffer.byteLength(message()));

  it("settles actual usage above the hold", async () => {
    h.reply = usageReply(0, 5000);
    const proxy = await h.start();
    await h.call(proxy, { body: message(1) });
    expect(h.reopen().totalMicroUsd()).toBe(5000 * 25);
  });

  it("bills a 200 without usage at the worst case", async () => {
    h.reply = {
      status: 200,
      headers: { "content-type": "application/json" },
      body: "{}",
    };
    const proxy = await h.start();
    await h.call(proxy);
    expect(h.reopen().totalMicroUsd()).toBe(worstCase());
  });

  it("charges nothing when the connection is refused", async () => {
    const proxy = await h.start({ upstreamBaseUrl: await closedPortUrl() });
    expect((await h.call(proxy)).status).toBe(502);
    expect(h.reopen().totalMicroUsd()).toBe(0);
  });

  it("charges the worst case for any other upstream error", async () => {
    h.reset = true;
    const proxy = await h.start();
    expect((await h.call(proxy)).status).toBe(502);
    expect(h.reopen().totalMicroUsd()).toBe(worstCase());
  });

  it("refuses a response above the size cap and charges the worst case", async () => {
    h.reply = {
      ...usageReply(1, 1),
      body: JSON.stringify({ pad: "x".repeat(5000) }),
    };
    const proxy = await h.start({ maxResponseBytes: 100 });
    expect((await h.call(proxy)).status).toBe(502);
    expect(h.reopen().totalMicroUsd()).toBe(worstCase());
  });

  it("holds the worst case while a call is in flight", async () => {
    h.delayMs = 400;
    const proxy = await h.start({ runCapUsd: 0.5 });
    const first = h.call(proxy, { body: message(10_000) });
    while (h.seen.length === 0) await new Promise((r) => setTimeout(r, 10));
    const second = await h.call(proxy, { body: message(10_000) });
    expect(second.status).toBe(402);
    expect((await first).status).toBe(200);
  });
});
