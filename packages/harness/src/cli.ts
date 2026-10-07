import { parseArgs } from "node:util";
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
  "usage: cli.ts run <task.json> --state-dir <dir>\n" +
  "       cli.ts replay <runId> --state-dir <dir>\n" +
  "       cli.ts reap --state-dir <dir>";

/**
 * run: 0 completed, 2 incomplete, 1 failed; replay: 0 match, 3 mismatch,
 * 4 never terminated; reap: 0, 1 if anything could not be reaped; 64 usage.
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
]);

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

function command(args: readonly string[]) {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...args],
      allowPositionals: true,
      strict: true,
      options: { "state-dir": { type: "string" } },
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
  return { name, target: operands[0] ?? "", stateDir };
}

async function main(args: readonly string[]): Promise<number> {
  try {
    const { name, target, stateDir } = command(args);
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
      const result = replayRun(target, stateDir);
      console.log(jsonLine(result));
      if (!result.terminated) return EXIT.unterminated;
      return result.match ? EXIT.ok : EXIT.mismatch;
    }
    const controller = new AbortController();
    const cancel = () => {
      controller.abort();
    };
    process.once("SIGINT", cancel).once("SIGTERM", cancel);
    // The owner is present only at an interactive terminal: asks go to stderr, so
    // stdout stays one JSON line. Otherwise every ask is denied (nobody present).
    const present = process.stdin.isTTY && process.stderr.isTTY;
    const { runId, terminal, summary } = await runTask({
      taskFile: target,
      stateDir,
      signal: controller.signal,
      ...(present
        ? { presence: createTtyPresence(process.stdin, process.stderr) }
        : {}),
    });
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
