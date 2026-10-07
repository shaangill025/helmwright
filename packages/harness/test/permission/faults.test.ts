import type { Event } from "@helmwright/schema";
import { describe, expect, it } from "vitest";
import { permissionFaults } from "../../src/index.ts";

const SHA = "a".repeat(64);
type Payload = Record<string, unknown>;

/** One run's events, numbered from seq 0 in order. */
const run = (...payloads: Payload[]): Event[] =>
  payloads.map((payload, seq) => ({
    ...{ schemaVersion: 1, eventId: `e${String(seq)}`, seq },
    ...{ graphId: "g", runId: "r", nodeId: "n" },
    type: String(payload["kind"]),
    at: "2026-10-07T00:00:00.000Z",
    payload,
  }));

const evaluated = (tier = "alwaysAsk", toolCallId = "call-1"): Payload => ({
  kind: "permission.evaluated",
  toolCallId,
  tier,
});
const asked = (presence = "tty", view = false): Payload => ({
  kind: "permission.asked",
  toolCallId: "call-1",
  presence,
  promptSha256: SHA,
  ...(view ? { viewSha256: SHA } : {}),
});
const answered = (fields: Payload = {}): Payload => ({
  kind: "permission.answered",
  toolCallId: "call-1",
  answer: "approved",
  by: "tty",
  waitMs: 300,
  attestation: { kind: "none" },
  ...fields,
});

const NO_ASK = "permission.answered without an earlier permission.asked";
const NOT_TTY = "approval not given by the owner at the TTY";
const NOT_VIEWED = "approval without the full view shown to its end";
const STRAY_VIEWED = "viewed recorded for an ask with no full view";
const SECOND_ASK = "more than one permission.asked for one tool call";
const SECOND_ANSWER = "more than one permission.answered for one tool call";
const NO_EVAL = "permission.asked without an earlier ask-tier evaluation";

describe("permissionFaults (SF3)", () => {
  it("finds no fault in asks bound as the live broker binds them", () => {
    expect(
      permissionFaults(
        run(
          ...[evaluated("allow", "call-0"), evaluated(), asked("tty", true)],
          answered({ viewed: true }),
          ...[
            evaluated("ask", "call-2"),
            { ...asked("none"), toolCallId: "call-2" },
          ],
          answered({
            toolCallId: "call-2",
            answer: "denied",
            by: "noPresence",
          }),
        ),
      ),
    ).toEqual([]);
  });

  it.each<[string, Payload[], string[]]>([
    [
      "1: an answer with no ask",
      [evaluated(), answered()],
      [`seq 1: ${NO_ASK}`],
    ],
    [
      "1: an answer before its ask",
      [evaluated(), answered({ answer: "denied" }), asked()],
      [`seq 1: ${NO_ASK}`],
    ],
    [
      "1: an answer with no tool call ID",
      [evaluated(), asked(), answered({ toolCallId: 7 })],
      [`seq 2: ${NO_ASK}`],
    ],
    [
      "2: an approval of an ask with nobody present",
      [evaluated(), asked("none"), answered()],
      [`seq 2: ${NOT_TTY}`],
    ],
    [
      "2: an approval not by the TTY",
      [evaluated(), asked(), answered({ by: "noPresence" })],
      [`seq 2: ${NOT_TTY}`],
    ],
    [
      "3: an approval of a viewed ask without viewed",
      [evaluated(), asked("tty", true), answered()],
      [`seq 2: ${NOT_VIEWED}`],
    ],
    [
      "3: an approval with viewed other than true",
      [evaluated(), asked("tty", true), answered({ viewed: "yes" })],
      [`seq 2: ${NOT_VIEWED}`],
    ],
    [
      "4: viewed on an answer to an ask with no view",
      [evaluated(), asked(), answered({ answer: "denied", viewed: false })],
      [`seq 2: ${STRAY_VIEWED}`],
    ],
    [
      "5: a second ask for one tool call",
      [evaluated(), asked(), asked(), answered()],
      [`seq 2: ${SECOND_ASK}`],
    ],
    [
      "5: a second answer for one tool call",
      [evaluated(), asked(), answered({ answer: "denied" }), answered()],
      [`seq 3: ${SECOND_ANSWER}`],
    ],
    [
      "6: an ask with no evaluation",
      [asked(), answered()],
      [`seq 0: ${NO_EVAL}`],
    ],
    [
      "6: an ask after an allow-tier evaluation",
      [evaluated("allow"), asked(), answered()],
      [`seq 1: ${NO_EVAL}`],
    ],
    [
      "6: an ask after another call's evaluation",
      [evaluated("ask", "call-2"), asked(), answered()],
      [`seq 1: ${NO_EVAL}`],
    ],
    [
      "6: an ask before its evaluation",
      [asked(), evaluated(), answered()],
      [`seq 0: ${NO_EVAL}`],
    ],
    [
      "2 and 3 together",
      [evaluated(), asked("none", true), answered()],
      [`seq 2: ${NOT_TTY}`, `seq 2: ${NOT_VIEWED}`],
    ],
  ])("reports fault %s", (_, payloads, faults) => {
    expect(permissionFaults(run(...payloads))).toEqual(faults);
  });

  it("never copies payload text into a fault", () => {
    const evil = "\u001b]8;;x\u0007";
    const faults = permissionFaults(
      run(
        { ...asked(), toolCallId: evil },
        answered({ toolCallId: evil, by: evil }),
      ),
    );
    expect(faults).toEqual([`seq 0: ${NO_EVAL}`, `seq 1: ${NOT_TTY}`]);
  });
});
