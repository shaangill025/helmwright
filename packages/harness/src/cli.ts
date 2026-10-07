import { parseArgs } from "node:util";
import { errorMessage } from "./loop/terminal.ts";
import { UsageError, replayRun, runTask } from "./run/run.ts";

const USAGE =
  "usage: cli.ts run <task.json> --state-dir <dir>\n" +
  "       cli.ts replay <runId> --state-dir <dir>";

/** run: 0 completed, 2 incomplete, 1 failed; replay: 0 match, 3 mismatch; 64 usage. */
const EXIT = { ok: 0, failed: 1, incomplete: 2, mismatch: 3, usage: 64 };

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
  const [name, target, ...extra] = parsed.positionals;
  const stateDir = parsed.values["state-dir"];
  if (target === undefined || extra.length > 0 || stateDir === undefined) {
    throw new UsageError("expected a command, its argument and --state-dir");
  }
  if (name !== "run" && name !== "replay") {
    throw new UsageError(`unknown command: ${String(name)}`);
  }
  return { name, target, stateDir };
}

async function main(args: readonly string[]): Promise<number> {
  try {
    const { name, target, stateDir } = command(args);
    if (name === "replay") {
      const result = replayRun(target, stateDir);
      console.log(JSON.stringify(result));
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
    if (!(error instanceof UsageError)) return EXIT.failed;
    console.error(USAGE);
    return EXIT.usage;
  }
}

process.exitCode = await main(process.argv.slice(2));
