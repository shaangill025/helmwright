import { isCredentialKey } from "../sandbox/docker.ts";

/**
 * Guard 1 (B9 guard chain), the exfiltration check: credential-shaped content in
 * an egress action's input. Every check is a bounded linear scan, per
 * whitespace-separated token, with no backtracking regex. B11 (credential proxy,
 * M1) adds the other half of the guard: a destination outside the proxy's
 * allowlist denies. Until then no allowlist is checked.
 */

/** Where credential-shaped content was found: the input field and the pattern class. */
export interface CredentialFound {
  readonly field: string;
  /** Fixed text naming the pattern class, never the content. */
  readonly pattern: string;
}

const code = (text: string, i: number): number => text.charCodeAt(i);
const isDigit = (c: number) => c >= 48 && c <= 57;
const isUpper = (c: number) => c >= 65 && c <= 90;
const isLower = (c: number) => c >= 97 && c <= 122;
const isUpperAlnum = (c: number) => isDigit(c) || isUpper(c);
const isAlnum = (c: number) => isUpperAlnum(c) || isLower(c);
/** Letters, digits and `_`. */
const isWord = (c: number) => isAlnum(c) || c === 95;
/** Letters, digits, `_` and `-`. */
const isKeyChar = (c: number) => isWord(c) || c === 45;

/** A token prefix and the run of characters that must follow it. */
interface Prefixed {
  readonly prefixes: readonly string[];
  readonly tail: (c: number) => boolean;
  /** The fewest tail characters that make a match. */
  readonly min: number;
  /** If set, the tail must be exactly `min` characters long. */
  readonly exact?: true;
  /** S2: if set (only the generic `sk-`), the prefix must start a word. */
  readonly boundary?: true;
  readonly pattern: string;
}

/** Known token formats; a more specific prefix comes before a shorter one it starts with. */
const PREFIXED: readonly Prefixed[] = [
  {
    prefixes: ["ghp_", "gho_", "ghu_", "ghs_", "ghr_"],
    tail: isAlnum,
    min: 30,
    pattern: "a GitHub token",
  },
  {
    prefixes: ["github_pat_"],
    tail: isWord,
    min: 22,
    pattern: "a GitHub token",
  },
  {
    prefixes: ["sk-ant-"],
    tail: isKeyChar,
    min: 20,
    pattern: "an Anthropic API key",
  },
  {
    prefixes: ["sk-"],
    tail: isKeyChar,
    min: 20,
    boundary: true,
    pattern: "a secret API key",
  },
  {
    prefixes: ["xoxb-", "xoxp-"],
    tail: isKeyChar,
    min: 10,
    pattern: "a Slack token",
  },
  {
    prefixes: ["AKIA", "ASIA"],
    tail: isUpperAlnum,
    min: 16,
    exact: true,
    pattern: "an AWS access key ID",
  },
  { prefixes: ["npm_"], tail: isAlnum, min: 36, pattern: "an npm token" },
  { prefixes: ["glpat-"], tail: isKeyChar, min: 20, pattern: "a GitLab token" },
];

/** True if `prefix` at `at` in `token` is followed by a matching tail (and starts a word if it must). */
function tailMatches(
  token: string,
  at: number,
  length: number,
  p: Prefixed,
): boolean {
  if (p.boundary === true && at > 0 && isWord(code(token, at - 1))) {
    return false;
  }
  let n = 0;
  // Bounded: counts at most one past `min`.
  for (let i = at + length; i < token.length && n <= p.min; i += 1) {
    if (!p.tail(code(token, i))) break;
    n += 1;
  }
  return p.exact === true ? n === p.min : n >= p.min;
}

function prefixedIn(token: string): string | undefined {
  for (const p of PREFIXED) {
    for (const prefix of p.prefixes) {
      for (let at = token.indexOf(prefix); at !== -1;) {
        if (tailMatches(token, at, prefix.length, p)) return p.pattern;
        at = token.indexOf(prefix, at + 1);
      }
    }
  }
  return undefined;
}

/** S4: the end markers of a PEM and a PGP private key header. */
const KEY_ENDS = ["PRIVATE KEY-----", "PRIVATE KEY BLOCK-----"];
const KEY_BEGIN = "-----BEGIN";
/** How far before an end marker its `-----BEGIN` may start (e.g. `-----BEGIN OPENSSH `). */
const KEY_WINDOW = 48;

/** A private key header (spans tokens, so checked on the whole text); linear. */
function hasPrivateKey(text: string): boolean {
  for (const end of KEY_ENDS) {
    for (let at = text.indexOf(end); at !== -1;) {
      const before = text.slice(Math.max(0, at - KEY_WINDOW), at);
      if (before.includes(KEY_BEGIN)) return true;
      at = text.indexOf(end, at + 1);
    }
  }
  return false;
}

/** The fewest characters a credential-named value must have to count. */
const MIN_VALUE = 8;
const QUOTES = new Set(["'", '"', "`"]);
const TRAILING = new Set(["'", '"', "`", ",", ";", ")", "}", "]"]);
/** Pair separators; a value also ends at `&` (a URL query). */
const SEPARATORS = new Set(["=", ":"]);

/** `text` without leading quotes and trailing quotes or punctuation. */
function unquoted(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && QUOTES.has(text.charAt(start))) start += 1;
  while (end > start && TRAILING.has(text.charAt(end - 1))) end -= 1;
  return text.slice(start, end);
}

/** The name that ends `left` (letters, digits, `_`, `-`, `.`), as an env-style key. */
function keyName(left: string): string {
  const text = unquoted(left);
  let start = text.length;
  while (start > 0) {
    const c = code(text, start - 1);
    if (!isKeyChar(c) && c !== 46) break;
    start -= 1;
  }
  return text
    .slice(start)
    .toUpperCase()
    .split("-")
    .join("_")
    .split(".")
    .join("_");
}

/** A value long enough to be a credential, and not a `$VARIABLE` reference. */
const isSecretValue = (value: string): boolean =>
  value.length >= MIN_VALUE && !value.startsWith("$");

const isPair = (name: string, value: string): boolean =>
  isCredentialKey(keyName(name)) && isSecretValue(unquoted(value));

/** The part of `token` after its last separator. */
function lastSegment(token: string): string {
  let at = token.length;
  while (at > 0 && !SEPARATORS.has(token.charAt(at - 1))) at -= 1;
  return token.slice(at);
}

/** The part of `token` from `from` up to `&`, at most 64 code units (later separators stay in it). */
function valueFrom(token: string, from: number): string {
  let end = from;
  while (end < token.length) {
    const c = token.charAt(end);
    if (c === "&" || end - from >= 64) break;
    end += 1;
  }
  return token.slice(from, end);
}

/**
 * S1: a `NAME=value` or `NAME: value` pair with a credential-shaped NAME at token `i`,
 * at any of its separators (each name runs back only to the previous separator, so
 * the walk is linear). A separator that ends the token takes its value from the next
 * token, one that starts it its name from the previous token: so `NAME = v`,
 * `NAME= v`, `NAME := v`, `{"token" : "v"}` and `?access_token=v&password=v` match.
 */
function pairAt(tokens: readonly string[], i: number): boolean {
  const token = tokens[i] ?? "";
  const previous = lastSegment(tokens[i - 1] ?? "");
  const next = valueFrom(tokens[i + 1] ?? "", 0);
  let segment = 0;
  for (let at = 0; at < token.length; at += 1) {
    if (!SEPARATORS.has(token.charAt(at))) continue;
    // A run of separators (`:=`) is one separator.
    let after = at + 1;
    while (after < token.length && SEPARATORS.has(token.charAt(after))) {
      after += 1;
    }
    const left = at === 0 ? previous : token.slice(segment, at);
    const value = after === token.length ? next : valueFrom(token, after);
    if (isPair(left, value)) return true;
    segment = after;
    at = after - 1;
  }
  return false;
}

/** S3: what is scanned: no invisible or format characters, then NFKC. */
const IGNORED = /[\p{Default_Ignorable_Code_Point}\p{Cf}]/u;
const scanned = (text: string): string =>
  text.split(IGNORED).join("").normalize("NFKC");

/** The pattern class of the first credential-shaped content in `text`, if any. */
function credentialPattern(raw: string): string | undefined {
  const text = scanned(raw);
  if (hasPrivateKey(text)) return "a private key";
  const tokens = text.split(/\s+/u);
  for (const [i, token] of tokens.entries()) {
    const found = prefixedIn(token);
    if (found !== undefined) return found;
    if (pairAt(tokens, i)) return "a credential-named value";
  }
  return undefined;
}

/** Every string in a JSON value (the input snapshot is shallow and bounded). */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value !== "object" || value === null) return [];
  return Object.values(value).flatMap(strings);
}

/**
 * The first input field (in key order) with credential-shaped content, and its
 * pattern class: a known token prefix, a PEM private key, or a `NAME=value` /
 * `NAME: value` pair whose NAME matches the sandbox's CREDENTIAL_KEY and whose
 * value has at least MIN_VALUE characters. Scans a normalized copy (S3); pure and total for JSON snapshots.
 */
export function credentialIn(
  fields: Readonly<Record<string, unknown>>,
): CredentialFound | undefined {
  for (const [field, value] of Object.entries(fields)) {
    for (const text of strings(value)) {
      const pattern = credentialPattern(text);
      if (pattern !== undefined) return { field, pattern };
    }
  }
  return undefined;
}
