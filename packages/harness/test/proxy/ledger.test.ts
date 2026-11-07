import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MODEL_PRICES,
  PRICES_VERIFIED,
  SpendLedger,
  preflightCostMicroUsd,
  usageCostMicroUsd,
} from "../../src/proxy/ledger.ts";

const MODEL = "claude-opus-5-5";
const USD = 1_000_000;
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "hw-ledger-"));
});
afterEach(() => {
  if (existsSync(join(dir, "ledger"))) chmodSync(join(dir, "ledger"), 0o700);
  rmSync(dir, { recursive: true, force: true });
});

const path = () => join(dir, "ledger", "spend.json");
const open = (totalCapUsd = 25, runCapUsd = 2, extra = {}) =>
  new SpendLedger({ path: path(), totalCapUsd, runCapUsd, ...extra });

describe("price table", () => {
  it("prices the pinned model and no other", () => {
    expect(MODEL_PRICES[MODEL]).toBeDefined();
    expect(preflightCostMicroUsd("other-model", 10, 10)).toBeUndefined();
    expect(usageCostMicroUsd("other-model", {})).toBeUndefined();
  });

  it("does not price prototype keys", () => {
    for (const name of [
      "constructor",
      "__proto__",
      "toString",
      "hasOwnProperty",
    ]) {
      expect(preflightCostMicroUsd(name, 10, 10), name).toBeUndefined();
      expect(
        usageCostMicroUsd(name, { input_tokens: 1 }),
        name,
      ).toBeUndefined();
    }
  });

  it("returns a cost only when it is a safe non-negative integer", () => {
    for (const bad of [NaN, Infinity, -1, 1.5, 1e300]) {
      expect(
        preflightCostMicroUsd(MODEL, bad, 10),
        String(bad),
      ).toBeUndefined();
      expect(
        preflightCostMicroUsd(MODEL, 10, bad),
        String(bad),
      ).toBeUndefined();
    }
    expect(usageCostMicroUsd(MODEL, { output_tokens: -5 })).toBeUndefined();
    expect(usageCostMicroUsd(MODEL, { input_tokens: 1e300 })).toBeUndefined();
    expect(usageCostMicroUsd(MODEL, { output_tokens: NaN })).toBeUndefined();
  });

  it("bounds a call above its actual cost", () => {
    const price = MODEL_PRICES[MODEL];
    const actual =
      100 * (price?.inputMicroUsdPerToken ?? 0) +
      50 * (price?.outputMicroUsdPerToken ?? 0);
    expect(
      usageCostMicroUsd(MODEL, { input_tokens: 100, output_tokens: 50 }),
    ).toBe(actual);
    expect(preflightCostMicroUsd(MODEL, 50, 100)).toBeGreaterThan(actual);
  });

  it("ties PRICES_VERIFIED to the UNVERIFIED rot text", () => {
    const root = join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "..",
      "..",
    );
    const register = JSON.parse(
      readFileSync(join(root, "rot-register.json"), "utf8"),
    ) as { component: string; facet?: string; assumption: string }[];
    const entry = register.find(
      (e) =>
        e.component === "packages/harness/src/proxy/ledger.ts" &&
        e.facet === "price-table",
    );
    expect(entry).toBeDefined();
    expect(entry?.assumption.includes("UNVERIFIED")).toBe(!PRICES_VERIFIED);
  });
});

describe("spend ledger", () => {
  it("adds settled cost to the run and the total", () => {
    const ledger = open();
    const held = ledger.reserve("run-1", 1000);
    expect(held.ok).toBe(true);
    if (held.ok) ledger.settle(held.id, 400);
    expect(ledger.totalMicroUsd()).toBe(400);
    expect(ledger.runMicroUsd("run-1")).toBe(400);
    expect(ledger.runMicroUsd("run-2")).toBe(0);
    expect(ledger.runMicroUsd("constructor")).toBe(0);
  });

  it("settles the actual cost even when it is above the hold", () => {
    const ledger = open();
    const held = ledger.reserve("run-1", 100);
    if (held.ok) ledger.settle(held.id, 900);
    expect(ledger.totalMicroUsd()).toBe(900);
  });

  it("rejects pre-flight over the run cap, counting in-flight holds", () => {
    const ledger = open(25, 0.5);
    expect(ledger.reserve("run-1", 0.3 * USD).ok).toBe(true);
    const second = ledger.reserve("run-1", 0.3 * USD);
    expect(second).toMatchObject({ ok: false, scope: "run" });
  });

  it("keeps the run cap separate from the total cap", () => {
    const small = open(25, 0.01);
    expect(small.reserve("a", 0.02 * USD)).toMatchObject({ scope: "run" });
    expect(small.reserve("b", 0.005 * USD).ok).toBe(true);
    const tiny = open(0.001, 2);
    expect(tiny.reserve("c", 0.002 * USD)).toMatchObject({ scope: "total" });
  });

  it("persists across instances and blocks once the total is spent", () => {
    const first = open(0.02, 2);
    const held = first.reserve("run-1", 0.015 * USD);
    if (held.ok) first.settle(held.id, 0.015 * USD);
    const second = open(0.02, 2);
    expect(second.totalMicroUsd()).toBe(0.015 * USD);
    expect(second.reserve("run-2", 0.01 * USD)).toMatchObject({
      ok: false,
      scope: "total",
    });
  });

  it("writes 0600, drops a zero-cost hold, leaves no temp or lock file", () => {
    const ledger = open();
    const zero = ledger.reserve("run-1", 100);
    if (zero.ok) ledger.settle(zero.id, 0);
    expect(ledger.totalMicroUsd()).toBe(0);
    const held = ledger.reserve("run-1", 100);
    if (held.ok) ledger.settle(held.id, 50);
    expect(statSync(path()).mode & 0o777).toBe(0o600);
    expect(readdirSync(join(dir, "ledger"))).toEqual(["spend.json"]);
  });

  it("refuses a ledger path inside the workspace", () => {
    expect(
      () =>
        new SpendLedger({
          path: join(dir, "ws", "spend.json"),
          workspaceRoot: join(dir, "ws"),
          totalCapUsd: 25,
          runCapUsd: 2,
        }),
    ).toThrow(/workspace/);
  });
});

describe("hold validation", () => {
  it("throws on a bad amount and leaves no hold", () => {
    const ledger = open(25, 0.5);
    for (const bad of [NaN, Infinity, -1, 1.5, 2 ** 60]) {
      expect(() => ledger.reserve("run-1", bad), String(bad)).toThrow(
        RangeError,
      );
    }
    expect(ledger.totalMicroUsd()).toBe(0);
    expect(ledger.reserve("run-1", 0.5 * USD).ok).toBe(true);
  });

  it("throws on a bad settle amount and keeps the hold", () => {
    const ledger = open(25, 0.5);
    const held = ledger.reserve("run-1", 0.4 * USD);
    if (!held.ok) throw new Error("expected a hold");
    for (const bad of [NaN, Infinity, -1, 1.5]) {
      expect(() => {
        ledger.settle(held.id, bad);
      }, String(bad)).toThrow(RangeError);
    }
    expect(ledger.totalMicroUsd()).toBe(0.4 * USD);
    expect(open(25, 0.5).reserve("run-1", 0.2 * USD).ok).toBe(false);
  });
});

describe("write-ahead holds", () => {
  it("writes the hold to the file before the call and shares it", () => {
    const a = open(25, 2);
    const b = open(25, 2);
    expect(a.reserve("run-1", 1.5 * USD).ok).toBe(true);
    expect(readFileSync(path(), "utf8")).toContain("run-1");
    expect(b.reserve("run-1", 1 * USD)).toMatchObject({
      ok: false,
      scope: "run",
    });
    expect(b.totalMicroUsd()).toBe(1.5 * USD);
  });

  it("interleaved instances lose no spend", () => {
    const a = open();
    const b = open();
    const ha = a.reserve("run-a", 1000);
    const hb = b.reserve("run-b", 2000);
    if (!ha.ok || !hb.ok) throw new Error("expected holds");
    a.settle(ha.id, 700);
    b.settle(hb.id, 1500);
    expect(open().totalMicroUsd()).toBe(2200);
    expect(open().runMicroUsd("run-a")).toBe(700);
    expect(open().runMicroUsd("run-b")).toBe(1500);
  });

  it("a leftover hold from a crash counts as spent", () => {
    const crashed = open(25, 2);
    expect(crashed.reserve("run-1", 1.9 * USD).ok).toBe(true);
    // The process died before settle: a new instance still sees the hold.
    expect(open(25, 2).reserve("run-1", 0.2 * USD).ok).toBe(false);
  });

  it("a failed settle write throws and the hold still counts", () => {
    if (process.getuid?.() === 0) return;
    const ledger = open(25, 2);
    const held = ledger.reserve("run-1", 1.9 * USD);
    if (!held.ok) throw new Error("expected a hold");
    chmodSync(join(dir, "ledger"), 0o500);
    expect(() => {
      ledger.settle(held.id, 100);
    }).toThrow();
    chmodSync(join(dir, "ledger"), 0o700);
    expect(open(25, 2).totalMicroUsd()).toBe(1.9 * USD);
    expect(open(25, 2).reserve("run-1", 0.2 * USD).ok).toBe(false);
  });
});

describe("file lock", () => {
  const lock = () => `${path()}.lock`;

  it("fails after a bounded wait on a fresh lock", () => {
    open().reserve("seed", 1);
    writeFileSync(lock(), "");
    const ledger = open(25, 2, { lockTimeoutMs: 100 });
    const started = Date.now();
    expect(() => ledger.reserve("run-1", 10)).toThrow(/lock/);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("breaks a stale lock and releases its own lock", () => {
    open().reserve("seed", 1);
    writeFileSync(lock(), "");
    const old = new Date(Date.now() - 120_000);
    utimesSync(lock(), old, old);
    const ledger = open(25, 2, { lockTimeoutMs: 1000, lockStaleMs: 30_000 });
    expect(ledger.reserve("run-1", 10).ok).toBe(true);
    expect(readdirSync(join(dir, "ledger"))).toEqual(["spend.json"]);
  });

  it("leaves no .stale residue after breaking a stale lock", () => {
    open().reserve("seed", 1);
    writeFileSync(lock(), "");
    const old = new Date(Date.now() - 120_000);
    utimesSync(lock(), old, old);
    open(25, 2, { lockStaleMs: 30_000 }).reserve("run-1", 10);
    expect(readdirSync(join(dir, "ledger")).sort()).toEqual(["spend.json"]);
  });

  it("rejects a bad lock timeout", () => {
    for (const bad of [NaN, -1, Infinity]) {
      expect(() => open(25, 2, { lockTimeoutMs: bad }), String(bad)).toThrow(
        RangeError,
      );
    }
    expect(() => open(25, 2, { lockTimeoutMs: 0 })).not.toThrow();
  });

  it("rejects a bad stale age", () => {
    for (const bad of [NaN, 0, -1, Infinity]) {
      expect(() => open(25, 2, { lockStaleMs: bad }), String(bad)).toThrow(
        RangeError,
      );
    }
    // A stale age below the wait would let a waiter break a live lock.
    expect(() =>
      open(25, 2, { lockTimeoutMs: 5000, lockStaleMs: 1000 }),
    ).toThrow(RangeError);
    expect(() =>
      open(25, 2, { lockTimeoutMs: 1000, lockStaleMs: 1000 }),
    ).not.toThrow();
  });

  it("does not break a fresh lock, only waits and throws", () => {
    open().reserve("seed", 1);
    writeFileSync(lock(), "");
    const ledger = open(25, 2, { lockTimeoutMs: 100, lockStaleMs: 60_000 });
    expect(() => ledger.reserve("run-1", 10)).toThrow(/lock/);
    expect(existsSync(lock())).toBe(true);
  });
});

describe("settle when the hold is gone", () => {
  it("adds the actual cost to the run and total (file removed mid-call)", () => {
    const ledger = open();
    const held = ledger.reserve("run-1", 1000);
    if (!held.ok) throw new Error("expected a hold");
    rmSync(path());
    ledger.settle(held.id, 700);
    expect(ledger.totalMicroUsd()).toBe(700);
    expect(ledger.runMicroUsd("run-1")).toBe(700);
  });

  it("throws when another instance never knew the hold", () => {
    const held = open().reserve("run-1", 1000);
    if (!held.ok) throw new Error("expected a hold");
    rmSync(path());
    expect(() => {
      open().settle(held.id, 700);
    }).toThrow(/hold/);
  });
});

describe("file validation", () => {
  const write = (data: unknown) => {
    mkdirSync(join(dir, "ledger"), { recursive: true });
    writeFileSync(path(), JSON.stringify(data));
  };
  const good = { version: 2, totalMicroUsd: 5, runs: { r: 5 }, holds: {} };

  it("treats a missing file as a fresh ledger", () => {
    expect(open().totalMicroUsd()).toBe(0);
  });

  it("accepts a valid file", () => {
    write(good);
    expect(open().totalMicroUsd()).toBe(5);
  });

  it("throws on anything else", () => {
    const cases: unknown[] = [
      null,
      [],
      { ...good, version: 1 },
      { ...good, totalMicroUsd: -1 },
      { ...good, totalMicroUsd: 1.5 },
      { ...good, totalMicroUsd: "5" },
      { ...good, runs: null },
      { ...good, runs: [] },
      { ...good, runs: { r: -1 } },
      { ...good, runs: { r: "x" } },
      { ...good, runs: { r: 0.5 } },
      { ...good, holds: null },
      { ...good, holds: { h: { runId: "r", micro: -1 } } },
      { ...good, holds: { h: { runId: 5, micro: 1 } } },
      { ...good, holds: { h: null } },
    ];
    for (const data of cases) {
      write(data);
      expect(() => open().totalMicroUsd(), JSON.stringify(data)).toThrow();
    }
    writeFileSync(path(), "{not json");
    expect(() => open().totalMicroUsd()).toThrow();
  });
});
