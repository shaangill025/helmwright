// Generated from schemas/owner-event.schema.json by scripts/generate.ts. Do not edit.

/**
 * Payload of an owner event (`decision.owner.*`) in the session log (SIG, T-EXT-04). Every owner event carries a presence signature over the canonical message that packages/harness/src/permission/owner-message.ts builds from it. `kind` equals the event's `type`. SIG-1 adds only this schema and the message builder: the log still refuses every `decision.owner.*` event until the signing and verifying code lands (SIG-2 and later).
 */
export type OwnerEvent = OwnerAnswered | OwnerKeyRegistered | OwnerKeyRotated;
/**
 * A run, card, decision or key ID.
 */
export type Id = string;
/**
 * Base64 of the 91-byte SubjectPublicKeyInfo DER of a P-256 public key: the fixed 26-byte header, then the 0x04 uncompressed-point marker and 64 bytes. The first 36 characters are fixed.
 */
export type Spki = string;
/**
 * `enclave`: a Secure Enclave key. `software`: a key in memory, allowed only in test builds.
 */
export type Mode = "enclave" | "software";
/**
 * Lowercase hex SHA-256.
 */
export type Sha256 = string;

/**
 * The owner answered a decision card: chose an option, or overrode with own text. The presence signature binds the card, the decision, the action, the option hash, the text hash, the brief hash (the question as shown), the run, the graph and the nonce.
 */
export interface OwnerAnswered {
  kind: "decision.owner.answered";
  cardId: Id;
  decisionId: Id;
  action: "choose" | "override";
  optionId: "a" | "b" | "c" | "d";
  /**
   * SHA-256 of the option named by `optionId`, as `optionHash` in owner-message.ts computes it. The verifier recomputes it from the stored option with that ID; for `override` it is the option the owner started from.
   */
  optionHash: string;
  /**
   * The owner's own text, one line of 1 to 500 code points, not only spaces, without a control character, line break, bidi control or lone surrogate (the `line` rules of objects.schema.json). `override` requires it; `choose` may carry it as a note. With `text`, `textHash` is required, and the reverse.
   */
  text?: string;
  /**
   * SHA-256 of the UTF-8 bytes of `text`.
   */
  textHash?: string;
  presence: OwnerPresence;
}
/**
 * One presence signature: ECDSA P-256 over the owner message, made after a user-presence check. `keyId` is the signing key; `nonce` is single use; `issuedAt` is the signing time. It has no mode: the mode belongs to the registered key and is bound in the registration message, and the pinned helper digest is what makes that claim credible.
 */
export interface OwnerPresence {
  keyId: Id;
  /**
   * 128 random bits as 32 lowercase hex digits.
   */
  nonce: string;
  /**
   * UTC timestamp in the form of the envelope `at`.
   */
  issuedAt: string;
  /**
   * Base64 of the DER-encoded ECDSA signature: 8 to 72 bytes for P-256, so 12 to 96 characters before padding. Strict DER parsing belongs to the verifier.
   */
  signature: string;
}
/**
 * The owner public key was pinned at setup. The log records the key fingerprint and the helper digest that the tamper checks compare. The first registration is signed by the key it registers.
 */
export interface OwnerKeyRegistered {
  kind: "decision.owner.key.registered";
  keyId: Id;
  publicKeySpki: Spki;
  /**
   * SHA-256 of the SPKI DER bytes.
   */
  fingerprint: string;
  /**
   * SHA-256 of the signing helper's binary.
   */
  helperDigest: string;
  mode: Mode;
  presence: OwnerPresence;
}
/**
 * The pinned owner key changed. `presence` is a signature by the current key (`fromKeyId`); `newKeyPresence` is a signature by the new key (`toKeyId`) over the same message bytes except keyId, which proves that the owner holds it. Both bind the new fingerprint, the helper digest, the mode and fromKeyId.
 */
export interface OwnerKeyRotated {
  kind: "decision.owner.key.rotated";
  fromKeyId: Id;
  toKeyId: Id;
  publicKeySpki: Spki;
  fingerprint: Sha256;
  helperDigest: Sha256;
  mode: Mode;
  presence: OwnerPresence;
  newKeyPresence: OwnerPresence;
}
