import { describe, expect, it } from "vitest";
import { MODEL_PRICES, preflightCostMicroUsd } from "../../src/proxy/ledger.ts";
import {
  MODEL,
  USD,
  message,
  usageReply,
  useHarness,
} from "./support/fake-upstream.ts";

const h = useHarness();

describe("spend caps through the proxy", () => {
  it("charges actual usage after the call", async () => {
    const proxy = await h.start();
    await h.call(proxy);
    const price = MODEL_PRICES[MODEL];
    const expected =
      100 * (price?.inputMicroUsdPerToken ?? 0) +
      50 * (price?.outputMicroUsdPerToken ?? 0);
    expect(h.reopen().totalMicroUsd()).toBe(expected);
    expect(h.reopen().runMicroUsd("run-1")).toBe(expected);
    expect(h.logs).toHaveLength(1);
    expect(h.logs[0]).toMatchObject({
      runId: "run-1",
      model: MODEL,
      status: 200,
      cost: expected,
    });
  });

  it("rejects pre-flight when max_tokens could pass the run cap", async () => {
    const proxy = await h.start({ runCapUsd: 0.5 });
    expect(preflightCostMicroUsd(MODEL, 100_000, 100)).toBeGreaterThan(
      0.5 * USD,
    );
    const reply = await h.call(proxy, { body: message(100_000) });
    expect(reply.status).toBe(402);
    expect(JSON.parse(reply.body)).toMatchObject({
      type: "error",
      error: { type: "helmwright_spend_cap" },
    });
    expect(h.seen).toHaveLength(0);
  });

  it("keeps the run cap separate from the total cap", async () => {
    const a = await h.start({
      runId: "run-a",
      runCapUsd: 0.01,
      totalCapUsd: 25,
    });
    expect((await h.call(a, { body: message(5000) })).status).toBe(402);
    const b = await h.start({ runId: "run-b", runCapUsd: 2, totalCapUsd: 25 });
    expect((await h.call(b)).status).toBe(200);
    const c = await h.start({
      runId: "run-c",
      runCapUsd: 2,
      totalCapUsd: 0.001,
    });
    expect((await h.call(c, { body: message(5000) })).status).toBe(402);
  });

  it("persists across two proxy instances and a spent total blocks the next run", async () => {
    const first = await h.start({ runId: "run-1", totalCapUsd: 0.02 });
    expect((await h.call(first, { body: message(100) })).status).toBe(200);
    h.reply = usageReply(0, 400);
    expect((await h.call(first, { body: message(400) })).status).toBe(200);
    await first.close();
    const second = await h.start({ runId: "run-2", totalCapUsd: 0.02 });
    const before = h.seen.length;
    expect((await h.call(second, { body: message(400) })).status).toBe(402);
    expect(h.seen).toHaveLength(before);
  });

  it("charges nothing for an upstream error", async () => {
    h.reply = { status: 500, headers: {}, body: "{}" };
    const proxy = await h.start();
    expect((await h.call(proxy)).status).toBe(500);
    expect(h.reopen().totalMicroUsd()).toBe(0);
  });
});
