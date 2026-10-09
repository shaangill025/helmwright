import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { FloorChecked } from "@helmwright/schema";
import { inspectEvents, openSessionLog } from "./log/session-log.ts";
import { errorMessage } from "./loop/terminal.ts";
import { displayText } from "./permission/policy.ts";
import { createTtyPresence } from "./permission/presence.ts";
import {
  CancelledError,
  UsageError,
  reapRuns,
  replayRun,
  runTask,
} from "./run/run.ts";

const USAGE =
  "usage: cli.ts run <task.json> --state-dir <dir> [--class <class> --reason <text>]\n" +
  "       cli.ts replay <runId> --state-dir <dir>\n" +
  "       cli.ts reap --state-dir <dir>\n" +
  "       cli.ts inspect --state-dir <dir> [--from-seq <n>] [--limit <1-1000>]\n" +
  "       cli.ts rebuild --state-dir <dir>";

/**
 * run: 0 completed, 2 incomplete, 1 failed (also on a floor finding, OQ-B3-2);
 * replay, first match wins (B5-4b): 64 bad run ID; 1 no log, no events of the run, or a
 * bad event anywhere in the log; 3 the objects projection does not match the events
 * (also for a run that never terminated); 4 never terminated; 3 the context digest
 * differs, or `permissionFaults` (which includes the floor faults) or `objectFaults` is
 * not empty; 0 otherwise;
 * reap: 0, 1 if anything could not be reaped; inspect, rebuild: 0, 1 failed; 64 usage.
 */
const EXIT = {
  ok: 0,
  failed: 1,
  incomplete: 2,
  mismatch: 3,
  unterminated: 4,
  usage: 64,
};
/** Each command and how many operands it takes. */
const COMMANDS = new Map([
  ["run", 1],
  ["replay", 1],
  ["reap", 0],
  ["inspect", 0],
  ["rebuild", 0],
]);
const INSPECT_LIMIT = 100;
const MAX_INSPECT_LIMIT = 1000;

/**
 * S-4: control, format, surrogate, private-use, unassigned, line/paragraph
 * separator and default-ignorable code points. Outside ASCII they occur only
 * inside JSON strings, so escaping them keeps the line valid JSON.
 */
const UNSAFE =
  /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/gu;

/** `value` as one JSON line that sends no control or invisible character to a terminal. */
function jsonLine(value: unknown): string {
  return JSON.stringify(value).replace(UNSAFE, (c) => {
    let escaped = "";
    // A code point beyond the BMP becomes its two UTF-16 escapes.
    for (let i = 0; i < c.length; i += 1) {
      escaped += "\\u" + c.charCodeAt(i).toString(16).padStart(4, "0");
    }
    return escaped;
  });
}

/** B3-2: one escaped, bounded stderr line for the run's floor check. */
function floorLine(checked: FloorChecked | null): string {
  if (checked === null) return "floor not checked";
  if (checked.verdict === "pass") return "floor pass";
  const { findings, truncated } = checked;
  const count = String(findings.length) + (truncated ? "+" : "");
  const named = findings.map(({ rule, path }) =>
    path === undefined ? rule : rule + " " + path,
  );
  return "floor reject: " + count + " findings (" + named.join(", ") + ")";
}

function command(args: readonly string[]) {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...args],
      allowPositionals: true,
      strict: true,
      options: {
        "state-dir": { type: "string" },
        class: { type: "string" },
        reason: { type: "string" },
        "from-seq": { type: "string" },
        limit: { type: "string" },
      },
    });
  } catch (error) {
    throw new UsageError(errorMessage(error));
  }
  const [name = "", ...operands] = parsed.positionals;
  const stateDir = parsed.values["state-dir"];
  const arity = COMMANDS.get(name);
  if (arity === undefined) throw new UsageError(`unknown command: ${name}`);
  if (operands.length !== arity || stateDir === undefined) {
    throw new UsageError("expected the command's arguments and --state-dir");
  }
  // OQ-B10-1: an override always has its reason, and only `run` takes one.
  const { class: to, reason } = parsed.values;
  if ((to === undefined) !== (reason === undefined)) {
    throw new UsageError("--class and --reason go together");
  }
  if (to !== undefined && name !== "run") {
    throw new UsageError("--class is for run only");
  }
  const override =
    to === undefined || reason === undefined
      ? {}
      : { intakeOverride: { to, reason } };
  const { "from-seq": from, limit } = parsed.values;
  if ((from ?? limit) !== undefined && name !== "inspect") {
    throw new UsageError("--from-seq and --limit are for inspect only");
  }
  const page = {
    fromSeq: count(from, 0),
    limit: count(limit, INSPECT_LIMIT),
  };
  if (page.limit < 1 || page.limit > MAX_INSPECT_LIMIT) {
    throw new UsageError("--limit must be 1 to 1000");
  }
  return { name, target: operands[0] ?? "", stateDir, override, page };
}

/** `text` as a whole number, or `fallback` if it is undefined. */
function count(text: string | undefined, fallback: number): number {
  if (text === undefined) return fallback;
  if (!/^\d{1,15}$/.test(text)) {
    throw new UsageError("--from-seq and --limit take a whole number");
  }
  return Number(text);
}

/** `<stateDir>/session.sqlite`, which must exist (no command here creates a log). */
function logFile(stateDir: string): string {
  const path = join(resolve(stateDir), "session.sqlite");
  if (!existsSync(path)) throw new Error("no session log at " + path);
  return path;
}

/**
 * B5-3b decision 2 (D): rebuilds the objects projection from the events. A log whose
 * checked read fails (a forged event) is refused; until SIG adds a signed quarantine,
 * its recovery is a new state dir.
 */
function rebuild(stateDir: string): string {
  return refusing("rebuild", () => {
    const log = openSessionLog(logFile(stateDir));
    try {
      return log.rebuildProjections();
    } finally {
      log.close();
    }
  });
}

/** inspectEvents, with SQLite's text for a state dir it cannot write explained (B5-4b). */
function inspect(path: string, page: { fromSeq: number; limit: number }) {
  try {
    return inspectEvents(path, page.fromSeq, page.limit);
  } catch (error) {
    const message = errorMessage(error);
    if (!message.includes("attempt to write a readonly database")) throw error;
    throw new Error(
      "inspect needs write access to the state dir, where SQLite creates the log's -shm file (WAL): " +
        message,
      { cause: error },
    );
  }
}

const BAD_EVENT = /(?:corrupt|cannot apply) event at seq /;

/** `fn()`; if the log fails closed (a forged event), its error with the hint for `name`. */
function refusing<T>(name: string, fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    // Only a log that fails closed gets the hint; a lock or a missing file keeps its text.
    const message = errorMessage(error);
    if (!BAD_EVENT.test(message)) throw error;
    throw new Error(
      name +
        " refused (see inspect; until SIG a bad event needs a new state dir): " +
        message,
      { cause: error },
    );
  }
}

async function main(args: readonly string[]): Promise<number> {
  try {
    const { name, target, stateDir, override, page } = command(args);
    if (name === "inspect") {
      // B5-3b decision 2 (A): raw rows, read-only, never migrated or projected.
      const { events, next } = inspect(logFile(stateDir), page);
      for (const event of events) console.log(jsonLine(event));
      if (next !== null) {
        console.error(
          "helmwright: inspect: more rows from seq " + String(next),
        );
      }
      return EXIT.ok;
    }
    if (name === "rebuild") {
      console.log(jsonLine({ rebuilt: true, digest: rebuild(stateDir) }));
      return EXIT.ok;
    }
    if (name === "reap") {
      const result = await reapRuns(stateDir);
      console.log(jsonLine(result));
      for (const { target, error } of result.failures) {
        console.error(
          "helmwright: reap " + displayText(target) + ": " + displayText(error),
        );
      }
      return result.failures.length === 0 ? EXIT.ok : EXIT.failed;
    }
    if (name === "replay") {
      const result = refusing("replay", () => replayRun(target, stateDir));
      console.log(jsonLine(result));
      if (!result.projections.match) return EXIT.mismatch;
      if (!result.terminated) return EXIT.unterminated;
      const faults = [...result.permissionFaults, ...result.objectFaults];
      return result.match && faults.length === 0 ? EXIT.ok : EXIT.mismatch;
    }
    const controller = new AbortController();
    const cancel = () => {
      controller.abort();
    };
    process.once("SIGINT", cancel).once("SIGTERM", cancel);
    // The owner is present only at an interactive terminal: asks go to stderr, so
    // stdout stays one JSON line. Otherwise every ask is denied (nobody present).
    const present = process.stdin.isTTY && process.stderr.isTTY;
    const { runId, terminal, summary, floor } = await runTask({
      taskFile: target,
      stateDir,
      signal: controller.signal,
      ...override,
      onIntake: (shown) => {
        let line = "override: " + shown.class;
        if (shown.kind === "classified") {
          const why = shown.reasons.map(({ rule, entries }) =>
            entries.length === 0 ? rule : rule + ": " + entries.join(", "),
          );
          line = shown.class + " (" + why.join("; ") + ")";
        }
        line += " friction " + shown.friction.intensity;
        console.error("helmwright: intake " + displayText(line));
      },
      ...(present
        ? { presence: createTtyPresence(process.stdin, process.stderr) }
        : {}),
    });
    console.error("helmwright: " + displayText(floorLine(floor)));
    console.log(jsonLine({ runId, terminal, summary }));
    return EXIT[terminal.kind === "completed" ? "ok" : terminal.kind];
  } catch (error) {
    // Nit-6: an error may echo input; escaped, it cannot drive the terminal.
    console.error("helmwright: " + displayText(errorMessage(error)));
    if (error instanceof CancelledError) return EXIT.incomplete;
    if (!(error instanceof UsageError)) return EXIT.failed;
    console.error(USAGE);
    return EXIT.usage;
  }
}

process.exitCode = await main(process.argv.slice(2));
