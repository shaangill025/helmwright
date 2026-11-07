import { rmSync, writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { SpendLedger } from "../../src/proxy/ledger.ts";
import { startProxy } from "../../src/proxy/server.ts";
import {
  FAKE_KEY,
  MODEL,
  TOKEN,
  closedPortUrl,
  message,
  useHarness,
  type Reply,
} from "./support/fake-upstream.ts";

const h = useHarness();

describe("proxy forwarding", () => {
  it("adds the key and version and strips client credentials", async () => {
    const proxy = await h.start();
    const reply = await h.call(proxy, {
      headers: {
        cookie: "session=1",
        "x-api-key": "client-supplied-key",
        "anthropic-version": "1999-01-01",
        "x-forwarded-for": "9.9.9.9",
      },
    });
    expect(reply.status).toBe(200);
    expect(h.seen).toHaveLength(1);
    const headers = h.seen[0]?.headers ?? {};
    expect(headers["x-api-key"]).toBe(FAKE_KEY);
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers.authorization).toBeUndefined();
    expect(headers.cookie).toBeUndefined();
    expect(headers["x-forwarded-for"]).toBeUndefined();
    expect(headers.host).toBe(h.upstreamUrl().slice("http://".length));
    expect(JSON.stringify(headers)).not.toContain(TOKEN);
    expect(JSON.stringify(headers)).not.toContain("client-supplied-key");
    expect(reply.headers["set-cookie"]).toBeUndefined();
    expect(h.seen[0]?.url).toBe("/v1/messages");
  });

  it("forwards count_tokens without charging", async () => {
    const proxy = await h.start();
    const reply = await h.call(proxy, { path: "/v1/messages/count_tokens" });
    expect(reply.status).toBe(200);
    expect(h.seen[0]?.url).toBe("/v1/messages/count_tokens");
    expect(h.reopen().totalMicroUsd()).toBe(0);
  });

  it("refuses other paths and methods without contacting upstream", async () => {
    const proxy = await h.start();
    for (const [method, path] of [
      ["GET", "/v1/messages"],
      ["POST", "/v1/models"],
      ["POST", "/v1/messages/batches"],
      ["POST", "/v1/messages/../models"],
      ["POST", "/v1/messages?x=1"],
      ["DELETE", "/v1/messages"],
      ["POST", "/"],
    ] as const) {
      const reply = await h.call(proxy, { method, path });
      expect([404, 405], `${method} ${path}`).toContain(reply.status);
    }
    expect(h.seen).toHaveLength(0);
  });

  it("requires the per-run bearer token", async () => {
    const proxy = await h.start();
    for (const auth of [
      null,
      "Bearer wrong",
      `Bearer ${TOKEN}x`,
      TOKEN,
      "Basic abc",
    ]) {
      const reply = await h.call(proxy, { auth });
      expect(reply.status).toBe(401);
    }
    expect(h.seen).toHaveLength(0);
  });

  it("listens on 127.0.0.1 only", async () => {
    const proxy = await h.start();
    expect(proxy.host).toBe("127.0.0.1");
    expect(proxy.address).toBe("127.0.0.1");
    expect(proxy.port).toBeGreaterThan(0);
    expect(proxy.url).toBe(`http://127.0.0.1:${String(proxy.port)}`);
  });

  it("refuses an oversize body and a streaming request", async () => {
    const proxy = await h.start({ maxBodyBytes: 200 });
    const big = await h.call(proxy, { body: message().padEnd(400, " ") });
    expect(big.status).toBe(413);
    const stream = await h.start();
    const s = await h.call(stream, {
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 5,
        stream: true,
        messages: [],
      }),
    });
    expect(s.status).toBe(400);
    expect(h.seen).toHaveLength(0);
  });

  it("does not follow an upstream redirect", async () => {
    h.reply = {
      status: 302,
      headers: { location: "http://127.0.0.1:1/" },
      body: "",
    };
    const proxy = await h.start();
    const reply = await h.call(proxy);
    expect(reply.status).toBe(502);
    expect(reply.headers.location).toBeUndefined();
    expect(h.seen).toHaveLength(1);
  });

  it("rejects an unpriced model locally", async () => {
    const proxy = await h.start();
    const reply = await h.call(proxy, {
      body: JSON.stringify({
        model: "other-model",
        max_tokens: 5,
        messages: [],
      }),
    });
    expect(reply.status).toBe(400);
    expect(h.seen).toHaveLength(0);
  });
});

describe("secrecy", () => {
  it("never writes the key, the token or an auth value anywhere", async () => {
    const written: string[] = [];
    const capture = (chunk: unknown) => {
      written.push(String(chunk));
      return true;
    };
    vi.spyOn(process.stdout, "write").mockImplementation(capture);
    vi.spyOn(process.stderr, "write").mockImplementation(capture);
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        written.push(args.map(String).join(" "));
      });
    }
    const replies: Reply[] = [];
    const proxy = await h.start();
    replies.push(
      await h.call(proxy, {
        headers: { "x-api-key": "client-supplied-key" },
      }),
      await h.call(proxy, { auth: "Bearer wrong" }),
      await h.call(proxy, { path: "/nope" }),
      await h.call(proxy, { body: "not json" }),
    );
    // The 500 path: a corrupt ledger file makes the handler throw.
    writeFileSync(h.ledgerPath(), "{corrupt");
    replies.push(await h.call(proxy));
    expect(replies.at(-1)?.status).toBe(500);
    rmSync(h.ledgerPath());
    // The unreachable path: nothing listens on the upstream port.
    const dead = await h.start({ upstreamBaseUrl: await closedPortUrl() });
    replies.push(await h.call(dead));
    expect(replies.at(-1)?.status).toBe(502);
    vi.restoreAllMocks();
    const all =
      h.everything() +
      written.join("\n") +
      replies.map((r) => r.body + JSON.stringify(r.headers)).join("\n");
    expect(written.join("")).not.toMatch(/sk-ant|Bearer/u);
    expect(all).not.toContain(FAKE_KEY);
    expect(all).not.toContain(TOKEN);
    expect(all).not.toContain("client-supplied-key");
    expect(all.toLowerCase()).not.toContain("x-api-key");
    expect(all.toLowerCase()).not.toContain("authorization");
    expect(JSON.stringify(h.logs)).not.toContain("wrong");
  });
});

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

  it("allows only 127.0.0.1 and ::1 upstreams while prices are unverified", async () => {
    await expect(startProxy(base())).rejects.toThrow(/verified/);
    for (const url of [
      "https://api.anthropic.com/",
      "https://api.anthropic.com.",
      "https://API.anthropic.com:443/v1",
      "https://user:pw@api.anthropic.com",
      "https://relay.example",
      "https://localhost",
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

  it("refuses plain http except to 127.0.0.1 and ::1", async () => {
    for (const url of ["http://example.com", "http://localhost:9"]) {
      await expect(
        startProxy({ ...base(), upstreamBaseUrl: url }),
        url,
      ).rejects.toThrow(/plain http/);
    }
    for (const url of ["http://127.0.0.1:9", "http://[::1]:9"]) {
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

describe("https upstream", () => {
  it("charges 0 when a loopback https connection is refused", async () => {
    const url = (await closedPortUrl()).replace("http:", "https:");
    const proxy = await h.start({ upstreamBaseUrl: url });
    expect((await h.call(proxy)).status).toBe(502);
    expect(h.reopen().totalMicroUsd()).toBe(0);
  });
});
