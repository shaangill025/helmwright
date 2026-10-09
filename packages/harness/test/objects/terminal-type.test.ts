import type { RunTerminal } from "@helmwright/schema";
import { describe, expectTypeOf, it } from "vitest";
import type { Terminal } from "../../src/loop/terminal.ts";

// B5-4: a Run's terminal is set from run.terminated's, so the schema's RunTerminal and
// the loop's Terminal must stay the same type (they differ only by `readonly`).
// tsc checks these assertions; a drift fails the typecheck gate.
describe("RunTerminal and Terminal (B5-4)", () => {
  it("each extends the other", () => {
    expectTypeOf<RunTerminal>().toExtend<Terminal>();
    expectTypeOf<Terminal>().toExtend<RunTerminal>();
  });
});
