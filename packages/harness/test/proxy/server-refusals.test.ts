import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { preflightCostMicroUsd } from "../../src/proxy/ledger.ts";
import { FAKE_KEY, MODEL, TOKEN, useHarness } from "./support/fake-upstream.ts";

const h = useHarness();

const ask = (extra: Record<string, unknown>) =>
  JSON.stringify({
    model: MODEL,
    max_tokens: 1000,
    messages: [{ role: "user", content: "hi" }],
    ...extra,
  });

const withContent = (block: unknown) =>
  ask({ messages: [{ role: "user", content: [block] }] });

/** Each body has a cost the pre-flight bound cannot cover. */
const REFUSED: Record<string, string> = {
  "server tool": ask({ tools: [{ type: "web_search_20260209", name: "ws" }] }),
  "bash tool": ask({ tools: [{ type: "bash_20250124", name: "bash" }] }),
  "tool with a null type": ask({ tools: [{ type: null, name: "t" }] }),
  "url image": withContent({
    type: "image",
    source: { type: "url", url: "https://example.com/a.png" },
  }),
  "file document": withContent({
    type: "document",
    source: { type: "file", file_id: "file_1" },
  }),
  "url source in tool_result": withContent({
    type: "tool_result",
    tool_use_id: "t1",
    content: [
      { type: "image", source: { type: "url", url: "https://example.com/a" } },
    ],
  }),
  mcp_servers: ask({ mcp_servers: [] }),
  container: ask({ container: "c1" }),
  service_tier: ask({ service_tier: "auto" }),
};

describe("bodies the pre-flight bound cannot cover", () => {
  for (const [name, body] of Object.entries(REFUSED)) {
    it(`refuses ${name} with 400 and no upstream call`, async () => {
      const proxy = await h.start();
      const reply = await h.call(proxy, { body });
      expect(reply.status).toBe(400);
      expect(h.seen).toHaveLength(0);
      expect(h.reopen().totalMicroUsd()).toBe(0);
    });
  }

  it("still forwards custom tools and base64 or text sources", async () => {
    const proxy = await h.start();
    const body = ask({
      tools: [
        { name: "a", input_schema: { type: "object" } },
        { type: "custom", name: "b", input_schema: { type: "object" } },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: "AA" },
            },
            {
              type: "document",
              source: { type: "text", media_type: "text/plain", data: "x" },
            },
          ],
        },
      ],
    });
    expect((await h.call(proxy, { body })).status).toBe(200);
  });

  it("settles a reply with server_tool_use at the hold and logs it", async () => {
    const proxy = await h.start();
    h.reply = {
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          server_tool_use: { web_search_requests: 1 },
        },
      }),
    };
    expect((await h.call(proxy)).status).toBe(200);
    const sent = h.seen[0]?.body ?? "";
    const worst = preflightCostMicroUsd(MODEL, 1000, Buffer.byteLength(sent));
    expect(worst).toBeGreaterThan(0);
    expect(h.reopen().totalMicroUsd()).toBe(worst);
    expect(h.logs[0]?.cost).toBe(worst);
    expect(h.logs[0]?.event).toBe("server_tool_use");
  });
});

describe("handler errors", () => {
  it("logs one allowlisted line before the 500, with no secret", async () => {
    const proxy = await h.start();
    // A corrupt ledger makes reserve() throw inside the handler.
    mkdirSync(dirname(h.ledgerPath()), { recursive: true });
    writeFileSync(h.ledgerPath(), "{ not json SECRET-BODY-TEXT");
    const reply = await h.call(proxy, { body: ask({ system: "SECRET-BODY" }) });
    expect(reply.status).toBe(500);
    expect(h.seen).toHaveLength(0);
    expect(h.logs).toHaveLength(1);
    expect(h.logs[0]).toMatchObject({ status: 500, event: "handler_error" });
    expect(Object.keys(h.logs[0] ?? {}).sort()).toEqual([
      "cost",
      "event",
      "latencyMs",
      "model",
      "requestSha256",
      "runId",
      "status",
      "tokens",
    ]);
    const all = JSON.stringify(h.logs);
    for (const secret of [FAKE_KEY, TOKEN, "SECRET"]) {
      expect(all).not.toContain(secret);
    }
  });
});

describe("cache_control ttl", () => {
  const ephemeral = (ttl?: string) => ({
    type: "ephemeral",
    ...(ttl === undefined ? {} : { ttl }),
  });
  const LOCATIONS: Record<string, (cc: unknown) => string> = {
    "system block": (cc) =>
      ask({ system: [{ type: "text", text: "s", cache_control: cc }] }),
    "message block": (cc) =>
      withContent({ type: "text", text: "m", cache_control: cc }),
    "tool definition": (cc) =>
      ask({ tools: [{ name: "t", input_schema: {}, cache_control: cc }] }),
  };

  for (const [where, build] of Object.entries(LOCATIONS)) {
    it(`refuses a 1h ttl in a ${where}`, async () => {
      const proxy = await h.start();
      for (const ttl of ["1h", "5M", "", "3600"]) {
        const body = build(ephemeral(ttl));
        expect((await h.call(proxy, { body })).status, ttl).toBe(400);
      }
      expect(h.seen).toHaveLength(0);
    });

    it(`allows no ttl and a 5m ttl in a ${where}`, async () => {
      const proxy = await h.start();
      for (const cc of [ephemeral(), ephemeral("5m")]) {
        expect((await h.call(proxy, { body: build(cc) })).status).toBe(200);
      }
    });
  }
});
