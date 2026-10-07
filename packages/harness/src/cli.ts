import { parseArgs } from "node:util";
import { errorMessage } from "./loop/terminal.ts";
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
 * 4 never terminated; reap: 0; 64 usage.
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
      console.log(JSON.stringify(await reapRuns(stateDir)));
      return EXIT.ok;
    }
    if (name === "replay") {
      const result = replayRun(target, stateDir);
      console.log(JSON.stringify(result));
      if (!result.terminated) return EXIT.unterminated;
      return result.match ? EXIT.ok : EXIT.mismatch;
    }
    const controller = new AbortController();
    const cancel = () => {
      controller.abort();
    };
    process.once("SIGINT", cancel).once("SIGTERM", cancel);
    const { runId, terminal, summary } = await runTask({
      taskFile: target,
      stateDir,
      signal: controller.signal,
    });
    console.log(JSON.stringify({ runId, terminal, summary }));
    return EXIT[terminal.kind === "completed" ? "ok" : terminal.kind];
  } catch (error) {
    console.error("helmwright: " + errorMessage(error));
    if (error instanceof CancelledError) return EXIT.incomplete;
    if (!(error instanceof UsageError)) return EXIT.failed;
    console.error(USAGE);
    return EXIT.usage;
  }
}

process.exitCode = await main(process.argv.slice(2));
