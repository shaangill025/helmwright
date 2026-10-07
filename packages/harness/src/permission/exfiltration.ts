import { CREDENTIAL_KEY } from "../sandbox/docker.ts";

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
  { prefixes: ["sk-"], tail: isKeyChar, min: 20, pattern: "a secret API key" },
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

/** True if `prefix` starts a word at `at` in `token` and is followed by a matching tail. */
function tailMatches(
  token: string,
  at: number,
  length: number,
  p: Prefixed,
): boolean {
  if (at > 0 && isWord(code(token, at - 1))) return false;
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

const PEM_END = "PRIVATE KEY-----";
const PEM_BEGIN = "-----BEGIN";
/** How far before `PRIVATE KEY-----` its `-----BEGIN` may start (e.g. `-----BEGIN OPENSSH `). */
const PEM_WINDOW = 48;

/** A PEM private key header (spans tokens, so checked on the whole text). */
function hasPrivateKey(text: string): boolean {
  for (let at = text.indexOf(PEM_END); at !== -1;) {
    const begin = text.lastIndexOf(PEM_BEGIN, at);
    if (begin !== -1 && at - begin <= PEM_WINDOW) return true;
    at = text.indexOf(PEM_END, at + 1);
  }
  return false;
}

/** The fewest characters a credential-named value must have to count. */
const MIN_VALUE = 8;
const QUOTES = new Set(["'", '"', "`"]);
const TRAILING = new Set(["'", '"', "`", ",", ";", ")", "}", "]"]);

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

/** `NAME=value` or `NAME: value` (value in the next token) with a credential-shaped NAME. */
function pairAt(tokens: readonly string[], i: number): boolean {
  const token = tokens[i] ?? "";
  const eq = token.indexOf("=");
  const colon = token.indexOf(":");
  const at = eq === -1 ? colon : colon === -1 ? eq : Math.min(eq, colon);
  if (at <= 0) return false;
  const name = keyName(token.slice(0, at));
  if (name === "" || !CREDENTIAL_KEY.test(name)) return false;
  const rest = token.slice(at + 1);
  const value = rest === "" && at === colon ? (tokens[i + 1] ?? "") : rest;
  return isSecretValue(unquoted(value));
}

/** The pattern class of the first credential-shaped content in `text`, if any. */
function credentialPattern(text: string): string | undefined {
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
 * value has at least MIN_VALUE characters. Pure and total for JSON snapshots.
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
