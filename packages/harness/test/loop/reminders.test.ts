import { describe, expect, it } from "vitest";
import {
  callKey,
  canonicalJson,
  createCallCounters,
  errorMessage,
  reminderFor,
} from "../../src/index.ts";

describe("canonicalJson", () => {
  it("treats objects with the same keys in a different order as identical", () => {
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(
      callKey({
        name: "read",
        input: { a: 1, b: { y: 2, x: [{ d: 4, c: 3 }] } },
      }),
    ).toBe(
      callKey({
        name: "read",
        input: { b: { x: [{ c: 3, d: 4 }], y: 2 }, a: 1 },
      }),
    );
  });

  it("distinguishes different names and inputs", () => {
    expect(callKey({ name: "read", input: { a: 1 } })).not.toBe(
      callKey({ name: "write", input: { a: 1 } }),
    );
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it("is total over awkward values and never throws", () => {
    const cyclic: Record<string, unknown> = { x: 1 };
    cyclic["self"] = cyclic;
    expect(canonicalJson(cyclic)).toBe('{"self":"[Circular]","x":1}');
    const shared = { k: 1 };
    expect(canonicalJson([shared, shared])).toBe('[{"k":1},{"k":1}]');
    expect(canonicalJson(10n)).toBe('"10n"');
    expect(canonicalJson(new Date(Date.UTC(2026, 9, 6)))).toBe(
      '"2026-10-06T00:00:00.000Z"',
    );
    const map = (o: object) => new Map(Object.entries(o));
    expect(canonicalJson(map({ b: 2, a: 1 }))).toBe(
      canonicalJson(map({ a: 1, b: 2 })),
    );
    expect(canonicalJson(new Map([["a", 1]]))).toBe('{"[Map]":[["a",1]]}');
    expect(canonicalJson(new Set([2, 1]))).toBe('{"[Set]":[1,2]}');
    expect(canonicalJson(undefined)).toBe('"[undefined]"');
    expect(canonicalJson({ u: undefined })).toBe('{"u":"[undefined]"}');
    expect(canonicalJson(NaN)).toBe('"[NaN]"');
    expect(canonicalJson(-Infinity)).toBe('"[-Infinity]"');
    expect(canonicalJson(() => 1)).toBe('"[function]"');
    expect(canonicalJson(Symbol("s"))).toBe('"[symbol]"');
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("no keys");
        },
      },
    );
    expect(() => canonicalJson(hostile)).not.toThrow();
  });
});

describe("errorMessage", () => {
  it("always returns a non-empty string", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("plain")).toBe("plain");
    expect(errorMessage(new Error(""))).toBe("unknown error");
    expect(errorMessage(undefined)).not.toBe("");
    expect(errorMessage({ code: 1 })).toBe('{"code":1}');
  });
});

describe("call counters", () => {
  it("counts identical calls per agent", () => {
    const counters = createCallCounters();
    const key = callKey({ name: "read", input: { path: "a" } });
    expect(counters.record("agent-a", key)).toBe(1);
    expect(counters.record("agent-a", key)).toBe(2);
    expect(counters.record("agent-b", key)).toBe(1);
    expect(counters.record("agent-a", key)).toBe(3);
  });

  it("produces a reminder only at 3, 5 and 8", () => {
    const at = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter(
      (count) => reminderFor("read", count) !== undefined,
    );
    expect(at).toEqual([3, 5, 8]);
    expect(reminderFor("read", 5)).toMatch(/5/);
    expect(reminderFor("read", 5)).toMatch(/repeats an earlier/);
  });
});
