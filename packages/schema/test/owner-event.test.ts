import { describe, expect, it } from "vitest";
import {
  validateOwnerEvent as validate,
  type OwnerAnswered,
  type OwnerKeyRegistered,
  type OwnerKeyRotated,
  type OwnerPresence,
} from "../src/index.ts";

const presence: OwnerPresence = {
  keyId: "key-1",
  nonce: "0123456789abcdef0123456789abcdef",
  issuedAt: "2026-10-17T12:00:00.000Z",
  signature: "MEUCIQDx" + "A".repeat(80) + "Zg==",
};
// P-256 SPKI DER (91 bytes) as base64: the 36-character fixed prefix, 85 free characters, one
// of A, Q, g, w, then "==".
const SPKI_PREFIX = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE";
const spki = SPKI_PREFIX + "M".repeat(85) + "A==";
const answered: OwnerAnswered = {
  kind: "decision.owner.answered",
  cardId: "card-1",
  decisionId: "decision-1",
  action: "choose",
  optionId: "b",
  optionHash: "a".repeat(64),
  presence,
};
const registered: OwnerKeyRegistered = {
  kind: "decision.owner.key.registered",
  keyId: "key-1",
  publicKeySpki: spki,
  fingerprint: "b".repeat(64),
  helperDigest: "c".repeat(64),
  mode: "enclave",
  presence,
};
const rotated: OwnerKeyRotated = {
  kind: "decision.owner.key.rotated",
  fromKeyId: "key-1",
  toKeyId: "key-2",
  publicKeySpki: spki,
  fingerprint: "b".repeat(64),
  helperDigest: "c".repeat(64),
  mode: "enclave",
  presence,
  newKeyPresence: { ...presence, keyId: "key-2" },
};
const override = {
  ...answered,
  action: "override",
  text: "Use B, but keep A's name.",
  textHash: "d".repeat(64),
};
const omit = (value: object, key: string) =>
  Object.fromEntries(Object.entries(value).filter(([k]) => k !== key));
const withSignature = (signature: string) => ({
  ...answered,
  presence: { ...presence, signature },
});
// Built from code units, so no editor can drop them.
const ch = (code: number) => String.fromCodePoint(code);

describe("owner-event.schema.json", () => {
  it("accepts a valid sample of each kind", () => {
    for (const sample of [
      answered,
      registered,
      rotated,
      override,
      { ...answered, text: "A note.", textHash: "d".repeat(64) },
      { ...registered, mode: "software" },
    ]) {
      expect(validate(sample), JSON.stringify(validate.errors)).toBe(true);
    }
  });

  it("rejects a missing presence, and a missing newKeyPresence", () => {
    expect(validate(omit(answered, "presence"))).toBe(false);
    expect(validate(omit(rotated, "newKeyPresence"))).toBe(false);
    expect(validate({ ...registered, presence: undefined })).toBe(false);
  });

  it("rejects a bad nonce", () => {
    for (const nonce of [
      "a".repeat(31),
      "a".repeat(33),
      "A".repeat(32),
      "g".repeat(32),
    ]) {
      expect(
        validate({ ...answered, presence: { ...presence, nonce } }),
        nonce,
      ).toBe(false);
    }
  });

  it("rejects extra fields, at the top and in presence, and a mode in presence", () => {
    expect(validate({ ...answered, extra: 1 })).toBe(false);
    expect(validate({ ...answered, presence: { ...presence, extra: 1 } })).toBe(
      false,
    );
    expect(
      validate({ ...answered, presence: { ...presence, mode: "enclave" } }),
    ).toBe(false);
  });

  it("bounds the signature at 12 to 96 base64 characters", () => {
    expect(validate(withSignature("A".repeat(11))), "11").toBe(false);
    expect(validate(withSignature("A".repeat(12))), "12").toBe(true);
    expect(validate(withSignature("A".repeat(96))), "96").toBe(true);
    expect(validate(withSignature("A".repeat(97))), "97").toBe(false);
    expect(validate(withSignature("A".repeat(94) + "==")), "padded").toBe(true);
    expect(validate(withSignature("A".repeat(10) + "===")), "3 pads").toBe(
      false,
    );
    expect(validate(withSignature("A".repeat(95) + "!")), "not base64").toBe(
      false,
    );
  });

  it("pins the P-256 SPKI prefix and length", () => {
    const bad = [
      "M".repeat(121) + "A==",
      "N" + spki.slice(1),
      spki.slice(0, -4) + "B==",
      spki.slice(0, -3) + "A=",
      spki + "A",
      SPKI_PREFIX + "M".repeat(84) + "A==",
    ];
    for (const publicKeySpki of bad) {
      expect(validate({ ...registered, publicKeySpki }), publicKeySpki).toBe(
        false,
      );
      expect(validate({ ...rotated, publicKeySpki }), publicKeySpki).toBe(
        false,
      );
    }
  });

  it("requires text for an override, and text with textHash", () => {
    expect(validate(omit(override, "text"))).toBe(false);
    expect(validate(omit(override, "textHash"))).toBe(false);
    expect(validate({ ...answered, action: "override" })).toBe(false);
    expect(validate({ ...answered, text: "no hash" })).toBe(false);
    expect(validate({ ...answered, textHash: "d".repeat(64) })).toBe(false);
  });

  it("limits owner text to one line as the objects schema does", () => {
    const withText = (text: string) => ({ ...override, text });
    for (const code of [
      0x0a, 0x00, 0x7f, 0x85, 0x2028, 0x2029, 0x200e, 0x202e,
    ]) {
      expect(validate(withText("a" + ch(code) + "b")), String(code)).toBe(
        false,
      );
    }
    expect(validate(withText(ch(0xd800))), "lone surrogate").toBe(false);
    expect(validate(withText("")), "empty").toBe(false);
    expect(validate(withText("   ")), "only spaces").toBe(false);
    expect(validate(withText("x".repeat(500))), "500").toBe(true);
    expect(validate(withText("x".repeat(501))), "501").toBe(false);
    const plain = "a/b <c> " + ch(0x1f5c4) + " caf" + ch(0xe9);
    expect(validate(withText(plain)), "plain").toBe(true);
  });

  it("rejects a bad kind, action, hash, mode and time", () => {
    const bad: unknown[] = [
      { ...answered, kind: "decision.owner.review" },
      { ...answered, action: "approve" },
      { ...answered, optionId: "e" },
      { ...answered, optionHash: "A".repeat(64) },
      { ...registered, mode: "keychain" },
      { ...registered, publicKeySpki: "short" },
      { ...registered, fingerprint: "b".repeat(63) },
      { ...answered, presence: { ...presence, issuedAt: "2026-10-17" } },
      withSignature(""),
      withSignature("not base64!".repeat(8)),
    ];
    for (const sample of bad) {
      expect(validate(sample), JSON.stringify(sample)).toBe(false);
    }
  });
});
