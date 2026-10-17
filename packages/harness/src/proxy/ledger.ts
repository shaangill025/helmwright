import { randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export interface ModelPrice {
  /** Micro-USD per token (numerically equal to USD per million tokens). */
  inputMicroUsdPerToken: number;
  outputMicroUsdPerToken: number;
}

/**
 * False while MODEL_PRICES holds placeholders. The server refuses the default
 * upstream (the real API) until this is true, and a test ties it to the
 * UNVERIFIED text of the rot-register price-table entry. Set it to true only
 * after the prices are checked against Anthropic's pricing page.
 */
export const PRICES_VERIFIED: boolean = false;

/**
 * UNVERIFIED: these prices are placeholders, not read from an Anthropic price
 * list. They must be checked against the published price of `claude-opus-5-5`
 * before any live paid call (rot-register entry for this module, trigger "model").
 * A wrong price makes the local cap wrong; the Console spend limit on the
 * dedicated key is the independent backstop. Look a model up with `Object.hasOwn`
 * only: `MODEL_PRICES["constructor"]` is not a price.
 */
export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  "claude-opus-5-5": { inputMicroUsdPerToken: 5, outputMicroUsdPerToken: 25 },
};

/** The price of `model`, or undefined (also for a prototype key). */
export function priceOf(model: string): ModelPrice | undefined {
  return Object.hasOwn(MODEL_PRICES, model) ? MODEL_PRICES[model] : undefined;
}

/** Cache writes and reads are priced as multiples of input. UNVERIFIED, as above. */
const CACHE_WRITE_FACTOR = 1.25;
const CACHE_READ_FACTOR = 0.1;

const isAmount = (n: unknown): n is number =>
  typeof n === "number" && Number.isSafeInteger(n) && n >= 0;

export const toMicroUsd = (usd: number): number => Math.round(usd * 1_000_000);

export interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/**
 * Upper bound of one call before it is sent: every output token up to max_tokens,
 * and every request byte as one input token (a token is at least one byte), with
 * the dearest input rate (cache write). Undefined for an unpriced model or when
 * an input or the result is not a safe non-negative integer.
 */
export function preflightCostMicroUsd(
  model: string,
  maxTokens: number,
  requestBytes: number,
): number | undefined {
  const price = priceOf(model);
  if (price === undefined || !isAmount(maxTokens) || !isAmount(requestBytes)) {
    return undefined;
  }
  const cost = Math.ceil(
    maxTokens * price.outputMicroUsdPerToken +
      requestBytes * price.inputMicroUsdPerToken * CACHE_WRITE_FACTOR,
  );
  return isAmount(cost) ? cost : undefined;
}

/**
 * Actual cost of a response's usage, rounded up. Undefined for an unpriced
 * model or when a usage field or the result is not a safe non-negative integer.
 */
export function usageCostMicroUsd(
  model: string,
  usage: Usage,
): number | undefined {
  const price = priceOf(model);
  if (price === undefined) return undefined;
  const fields = [
    usage.input_tokens,
    usage.cache_creation_input_tokens,
    usage.cache_read_input_tokens,
    usage.output_tokens,
  ];
  if (fields.some((f) => f !== undefined && !isAmount(f))) return undefined;
  const input = price.inputMicroUsdPerToken;
  const cost = Math.ceil(
    (usage.input_tokens ?? 0) * input +
      (usage.cache_creation_input_tokens ?? 0) * input * CACHE_WRITE_FACTOR +
      (usage.cache_read_input_tokens ?? 0) * input * CACHE_READ_FACTOR +
      (usage.output_tokens ?? 0) * price.outputMicroUsdPerToken,
  );
  return isAmount(cost) ? cost : undefined;
}

export interface LedgerOptions {
  /** Ledger file; it must lie outside any workspace. */
  path: string;
  /** Cumulative cap across runs (M1: $25; raising it is always-ask). */
  totalCapUsd: number;
  /** Cap of one run (M1: $2; raising it is always-ask). */
  runCapUsd: number;
  /** When set, a ledger path inside this directory is refused. */
  workspaceRoot?: string;
  /** How long to wait for the file lock before throwing (default 5000 ms). */
  lockTimeoutMs?: number;
  /** A lock file older than this is stale and is broken (default 30000 ms). */
  lockStaleMs?: number;
}

interface Hold {
  runId: string;
  micro: number;
}

interface State {
  total: number;
  runs: Map<string, number>;
  holds: Map<string, Hold>;
}

export type Reservation =
  | { ok: true; id: string }
  | {
      ok: false;
      scope: "run" | "total";
      capMicroUsd: number;
      remainingMicroUsd: number;
    };

const corrupt = () =>
  new Error("the spend ledger is corrupt; refusing to continue");

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Strict parse: anything unexpected throws. A missing file is handled by the caller. */
function parse(text: string): State {
  const data: unknown = JSON.parse(text);
  if (
    !isRecord(data) ||
    data["version"] !== 2 ||
    !isAmount(data["totalMicroUsd"]) ||
    !isRecord(data["runs"]) ||
    !isRecord(data["holds"])
  ) {
    throw corrupt();
  }
  const runs = new Map<string, number>();
  for (const [name, value] of Object.entries(data["runs"])) {
    if (!isAmount(value)) throw corrupt();
    runs.set(name, value);
  }
  const holds = new Map<string, Hold>();
  for (const [id, value] of Object.entries(data["holds"])) {
    if (
      !isRecord(value) ||
      typeof value["runId"] !== "string" ||
      !isAmount(value["micro"])
    ) {
      throw corrupt();
    }
    holds.set(id, { runId: value["runId"], micro: value["micro"] });
  }
  return { total: data["totalMicroUsd"], runs, holds };
}

const sleep = (ms: number) => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

/**
 * The cumulative spend ledger: a 0600 JSON file (version 2) holding the settled
 * total, the settled spend per run and the in-flight holds.
 *
 * - Every read-modify-write runs under an exclusive lock file `<path>.lock`
 *   (`openSync(..., "wx")`) with a bounded wait; a lock older than `lockStaleMs`
 *   is stale and is broken by renaming it aside (one breaker wins) and deleting
 *   the copy; a holder releases only a lock whose inode is still its own.
 *   Known limit: a holder paused longer than the stale age may still be writing
 *   when a breaker enters, so two writers can overlap once; the stale age is far
 *   above one operation, so this needs a stalled process.
 * - A hold is written to the file before the call (write-ahead) and replaced by
 *   the actual cost on settle. After a crash a leftover hold stays and counts as
 *   spent: conservative by design, cleared only by the owner editing the file.
 * - A failed settle write throws and leaves the hold in place.
 * - A missing file is a fresh ledger (known limit: deleting the file resets the
 *   spend; the Console spend limit on the dedicated key is the backstop). Any
 *   other unexpected content throws.
 */
export class SpendLedger {
  readonly #path: string;
  readonly #totalCap: number;
  readonly #runCap: number;
  readonly #lockTimeout: number;
  readonly #lockStale: number;
  /** Run of each hold this instance wrote, for a settle after the hold is gone. */
  readonly #runOf = new Map<string, string>();

  constructor(options: LedgerOptions) {
    const path = resolve(options.path);
    if (options.workspaceRoot !== undefined) {
      const rel = relative(resolve(options.workspaceRoot), path);
      if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
        throw new Error("the spend ledger must lie outside the workspace");
      }
    }
    this.#path = path;
    this.#totalCap = toMicroUsd(options.totalCapUsd);
    this.#runCap = toMicroUsd(options.runCapUsd);
    if (!isAmount(this.#totalCap) || !isAmount(this.#runCap)) {
      throw new RangeError("spend caps must be finite non-negative amounts");
    }
    const timeout = options.lockTimeoutMs ?? 5000;
    if (!Number.isFinite(timeout) || timeout < 0) {
      throw new RangeError("lockTimeoutMs must be a finite number >= 0");
    }
    this.#lockTimeout = timeout;
    this.#lockStale = options.lockStaleMs ?? 30_000;
  }

  #read(): State {
    if (!existsSync(this.#path)) {
      return { total: 0, runs: new Map(), holds: new Map() };
    }
    return parse(readFileSync(this.#path, "utf8"));
  }

  #write(state: State): void {
    const tmp = `${this.#path}.${String(process.pid)}.tmp`;
    const text = JSON.stringify({
      version: 2,
      totalMicroUsd: state.total,
      runs: Object.fromEntries(state.runs),
      holds: Object.fromEntries(state.holds),
    });
    try {
      writeFileSync(tmp, text, { mode: 0o600 });
      chmodSync(tmp, 0o600);
      renameSync(tmp, this.#path);
    } catch (error) {
      if (existsSync(tmp)) unlinkSync(tmp);
      throw error;
    }
  }

  #locked<T>(fn: () => T): T {
    mkdirSync(dirname(this.#path), { recursive: true, mode: 0o700 });
    const lock = `${this.#path}.lock`;
    const deadline = Date.now() + this.#lockTimeout;
    let inode: number;
    for (;;) {
      try {
        const fd = openSync(lock, "wx", 0o600);
        inode = fstatSync(fd).ino;
        closeSync(fd);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      try {
        if (Date.now() - statSync(lock).mtimeMs > this.#lockStale) {
          // Rename first: only one breaker can win the rename, then it deletes
          // its private copy, so a loser never removes a fresh lock.
          const stale = `${lock}.${String(process.pid)}.stale`;
          renameSync(lock, stale);
          unlinkSync(stale);
          continue;
        }
      } catch {
        continue; // The holder released it, or another breaker won.
      }
      if (Date.now() >= deadline) {
        throw new Error("the spend ledger lock is held; try again later");
      }
      sleep(10);
    }
    try {
      return fn();
    } finally {
      // Release only our own lock: if a breaker replaced it (we paused past the
      // stale age), the new lock belongs to someone else.
      try {
        if (statSync(lock).ino === inode) unlinkSync(lock);
      } catch {
        // Already gone.
      }
    }
  }

  #spent(state: State, runId?: string): number {
    let sum = runId === undefined ? state.total : (state.runs.get(runId) ?? 0);
    for (const hold of state.holds.values()) {
      if (runId === undefined || hold.runId === runId) sum += hold.micro;
    }
    return sum;
  }

  /** Spent so far across runs: settled cost plus holds. */
  totalMicroUsd(): number {
    return this.#spent(this.#read());
  }

  /** Spent so far by one run: settled cost plus holds. */
  runMicroUsd(runId: string): number {
    return this.#spent(this.#read(), runId);
  }

  /**
   * Pre-flight: write a hold of `worstCaseMicroUsd` if both caps allow it. Throws
   * RangeError for an amount that is not a safe non-negative integer; no hold is
   * written then.
   */
  reserve(runId: string, worstCaseMicroUsd: number): Reservation {
    if (!isAmount(worstCaseMicroUsd)) {
      throw new RangeError("a hold must be a safe non-negative integer");
    }
    return this.#locked((): Reservation => {
      const state = this.#read();
      const runRemaining = this.#runCap - this.#spent(state, runId);
      if (worstCaseMicroUsd > runRemaining) {
        return {
          ok: false,
          scope: "run",
          capMicroUsd: this.#runCap,
          remainingMicroUsd: Math.max(0, runRemaining),
        };
      }
      const totalRemaining = this.#totalCap - this.#spent(state);
      if (worstCaseMicroUsd > totalRemaining) {
        return {
          ok: false,
          scope: "total",
          capMicroUsd: this.#totalCap,
          remainingMicroUsd: Math.max(0, totalRemaining),
        };
      }
      const id = randomUUID();
      state.holds.set(id, { runId, micro: worstCaseMicroUsd });
      this.#write(state);
      this.#runOf.set(id, runId);
      return { ok: true, id };
    });
  }

  /**
   * Post-flight: replace the hold with the actual cost (which may exceed the
   * hold). Throws RangeError for a bad amount, or on a failed write; the hold
   * stays in both cases.
   */
  settle(id: string, actualMicroUsd: number): void {
    if (!isAmount(actualMicroUsd)) {
      throw new RangeError("a cost must be a safe non-negative integer");
    }
    this.#locked(() => {
      const state = this.#read();
      // The hold can be gone (the file was removed or edited mid-call). The paid
      // cost is then still added, to the run this instance reserved it for; an
      // instance that never saw the hold cannot name the run, so it throws.
      const runId = state.holds.get(id)?.runId ?? this.#runOf.get(id);
      if (runId === undefined) {
        throw new Error("the spend hold is unknown; the cost was not recorded");
      }
      state.holds.delete(id);
      const total = state.total + actualMicroUsd;
      const run = (state.runs.get(runId) ?? 0) + actualMicroUsd;
      if (!isAmount(total) || !isAmount(run)) {
        throw new RangeError("the spend total overflowed");
      }
      state.total = total;
      state.runs.set(runId, run);
      this.#write(state);
      this.#runOf.delete(id);
    });
  }
}
