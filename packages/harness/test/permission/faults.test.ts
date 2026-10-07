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
  requested: "execute",
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
const NO_EVAL = "permission.asked not directly after its ask-tier ruling";
const WRONG_BY = "answer not given by the presence its ask had";
const UNRULED = "tool call ran without an allow ruling or an approval";

const SECOND_EVAL = "more than one permission.evaluated for one tool call";
const NO_RULING = "tool call ended without denial and without any ruling";
const OTHER_ACTION =
  "tool call ran as another action than its ruling requested";

const called = (status = "ok", toolCallId = "call-1"): Payload => ({
  kind: "loop.tool.called",
  toolCallId,
  name: "execute",
  status,
});
const other = (kind: string, toolCallId = "call-1"): Payload => ({
  kind,
  toolCallId,
});

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
      [`seq 1: ${NO_ASK}`, `seq 2: ${NO_EVAL}`],
    ],
    [
      "1: an answer with no tool call ID",
      [evaluated(), asked(), answered({ toolCallId: 7 })],
      [`seq 2: ${NO_ASK}`],
    ],
    [
      "2: an approval of an ask with nobody present",
      [evaluated(), asked("none"), answered()],
      [`seq 2: ${NOT_TTY}`, `seq 2: ${WRONG_BY}`],
    ],
    [
      "2: an approval not by the TTY",
      [evaluated(), asked(), answered({ by: "noPresence" })],
      [`seq 2: ${NOT_TTY}`, `seq 2: ${WRONG_BY}`],
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
      [`seq 2: ${NOT_TTY}`, `seq 2: ${NOT_VIEWED}`, `seq 2: ${WRONG_BY}`],
    ],
    [
      "S1: an ask after a later allow ruling of its call",
      [evaluated(), evaluated("allow"), asked(), answered()],
      [`seq 1: ${SECOND_EVAL}`, `seq 2: ${NO_EVAL}`],
    ],
    [
      "S1: an ask after a rejection of its call",
      [evaluated("ask"), other("permission.rejected"), asked(), answered()],
      [`seq 2: ${NO_EVAL}`],
    ],
    [
      "S1: an ask not directly after its ruling",
      [evaluated("ask"), other("loop.tool.started"), asked(), answered()],
      [`seq 2: ${NO_EVAL}`],
    ],
    [
      "S3: a run after an allow ruling",
      [evaluated("allow"), called(), called("denied")],
      [],
    ],
    [
      "S3: a run after a bound approval",
      [evaluated(), asked(), answered(), called("error")],
      [],
    ],
    ["N-d: a run with no ruling", [called()], [`seq 0: ${NO_RULING}`]],
    [
      "N4: a second evaluation of one call",
      [evaluated("allow"), evaluated("allow"), called()],
      [`seq 1: ${SECOND_EVAL}`],
    ],
    [
      "N4: an exfiltration ruling that does not deny",
      [{ ...evaluated("allow"), guard: "exfiltration" }, called()],
      ["seq 0: exfiltration ruling that does not deny"],
    ],
    [
      "N4: no fault for an exfiltration denial",
      [{ ...evaluated("deny"), guard: "exfiltration" }, called("denied")],
      [],
    ],
    [
      "N-d: an error with no ruling",
      [called("error")],
      [`seq 0: ${NO_RULING}`],
    ],
    [
      "N-a: an approval after a later ruling of its call",
      [
        evaluated(),
        asked(),
        other("permission.rejected"),
        answered(),
        called(),
      ],
      [`seq 4: ${UNRULED}`],
    ],
    [
      "N-a: no fault for a rejection after the approved run",
      [
        evaluated(),
        asked(),
        answered(),
        called(),
        other("permission.rejected"),
      ],
      [],
    ],
    [
      "N-b: a run after a denied call used up the allow",
      [evaluated("allow"), called("denied"), called()],
      [`seq 2: ${UNRULED}`],
    ],
    [
      "N-b: a run after a denied call used up the approval",
      [evaluated(), asked(), answered(), called("denied"), called()],
      [`seq 4: ${UNRULED}`],
    ],
    [
      "N-c: a run as another action than its ruling",
      [evaluated("allow"), { ...called(), name: "deploy" }],
      [`seq 1: ${OTHER_ACTION}`],
    ],
    [
      "N-c: a run with no action name",
      [evaluated("allow"), { ...called(), name: undefined }],
      [`seq 1: ${OTHER_ACTION}`],
    ],
    [
      "N-c: a ruling with no requested action",
      [{ ...evaluated("allow"), requested: undefined }, called()],
      [`seq 1: ${OTHER_ACTION}`],
    ],
    [
      "S3: a run after a deny ruling",
      [evaluated("deny"), called("error")],
      [`seq 1: ${UNRULED}`],
    ],
    [
      "S3: a run after a rejection",
      [other("permission.rejected"), called()],
      [`seq 1: ${UNRULED}`],
    ],
    [
      "S3: a run after an allow ruling, then a rejection",
      [evaluated("allow"), other("permission.rejected"), called()],
      [`seq 2: ${UNRULED}`],
    ],
    [
      "S3: a run of another call's allow ruling",
      [evaluated("allow", "call-2"), called()],
      [`seq 1: ${NO_RULING}`],
    ],
    [
      "S3: a run after a denied answer",
      [evaluated(), asked(), answered({ answer: "denied" }), called()],
      [`seq 3: ${UNRULED}`],
    ],
    [
      "S3: a run after an ask with no answer",
      [evaluated(), asked(), called()],
      [`seq 2: ${UNRULED}`],
    ],
    [
      "S3: a run after an approval that is not bound",
      [evaluated(), asked("tty", true), answered(), called()],
      [`seq 2: ${NOT_VIEWED}`, `seq 3: ${UNRULED}`],
    ],
    [
      "S3: a run after an approval of an unbound ask",
      [evaluated("allow"), asked(), answered(), called()],
      [`seq 1: ${NO_EVAL}`, `seq 3: ${UNRULED}`],
    ],
    [
      "S3: a second run of one ruling",
      [evaluated("allow"), called(), called()],
      [`seq 2: ${UNRULED}`],
    ],
    [
      "N1: a denial by noPresence of an ask at the TTY",
      [evaluated(), asked(), answered({ answer: "denied", by: "noPresence" })],
      [`seq 2: ${WRONG_BY}`],
    ],
    [
      "N1: a denial at the TTY of an ask with nobody present",
      [evaluated(), asked("none"), answered({ answer: "denied" })],
      [`seq 2: ${WRONG_BY}`],
    ],
    [
      "N1: a cancelled ask with nobody present",
      [
        evaluated(),
        asked("none"),
        answered({ answer: "denied", by: "cancelled" }),
      ],
      [`seq 2: ${WRONG_BY}`],
    ],
    [
      "N1: no fault for a cancelled ask at the TTY",
      [evaluated(), asked(), answered({ answer: "denied", by: "cancelled" })],
      [],
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
    expect(faults).toEqual([
      `seq 0: ${NO_EVAL}`,
      `seq 1: ${NOT_TTY}`,
      `seq 1: ${WRONG_BY}`,
    ]);
  });

  it("reads tool call IDs and fields that name Object properties", () => {
    for (const id of ["__proto__", "constructor", "hasOwnProperty"]) {
      const bound = run(
        ...[evaluated("ask", id), { ...asked(), toolCallId: id }],
        ...[answered({ toolCallId: id }), called("ok", id)],
      );
      expect(permissionFaults(bound), id).toEqual([]);
      const unbound = run(
        ...[{ ...evaluated(), tier: {} }, asked([] as unknown as string)],
        ...[answered(), called(), { ...called(), toolCallId: id }],
      );
      expect(permissionFaults(unbound), id).toEqual([
        `seq 1: ${NO_EVAL}`,
        `seq 2: ${NOT_TTY}`,
        `seq 2: ${WRONG_BY}`,
        `seq 3: ${UNRULED}`,
        `seq 4: ${NO_RULING}`,
      ]);
    }
  });
});
