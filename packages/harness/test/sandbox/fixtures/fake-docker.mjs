// Fake docker CLI for unit tests: `node fake-docker.mjs <mode> <log> ...dockerArgs`.
// Appends one JSON line per invocation (argv and client env) to <log>, then acts per mode.
import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import process from "node:process";
import { setInterval } from "node:timers";

const [mode = "", log = "", ...args] = process.argv.slice(2);
const { env } = process;
/** @param {Record<string, unknown>} entry */
const record = (entry) => {
  appendFileSync(log, `${JSON.stringify(entry)}\n`);
};
record({
  args,
  env: {
    PATH: env["PATH"] ?? null,
    HOME: env["HOME"] ?? null,
    DOCKER_CONFIG: env["DOCKER_CONFIG"] ?? null,
    DOCKER_HOST: env["DOCKER_HOST"] ?? null,
    ANTHROPIC_API_KEY: env["ANTHROPIC_API_KEY"] ?? null,
  },
});
const hang = () => {
  setInterval(() => undefined, 1_000);
};

switch (args[0]) {
  case "context":
    process.stdout.write(
      mode === "tcp" ? "tcp://10.0.0.1:2375\n" : "unix:///fake/docker.sock\n",
    );
    break;
  case "run":
    if (mode === "start-fail") {
      process.stderr.write(
        `docker: Error response from daemon: ${"e".repeat(10_000)}\n`,
      );
      process.exitCode = 125;
    } else if (mode === "not-found") {
      process.exitCode = 127;
    } else if (mode === "stderr") {
      process.stderr.write("y".repeat(4_096));
      process.stdout.write("ok");
    } else {
      hang();
    }
    break;
  case "kill":
  case "rm":
    if (mode === "hang") hang();
    break;
  case "ps":
    if ((args.at(-1) ?? "").startsWith("label=")) {
      process.stdout.write("aaa111\nbbb222\n");
    } else if (mode === "hang") {
      process.stdout.write("aaa111\n");
    }
    break;
  case "build":
    if (mode === "hang") {
      // A grandchild that keeps the stdio pipes open after this process is killed.
      const holder = spawn(
        process.execPath,
        ["-e", "setTimeout(() => {}, 30000)"],
        {
          stdio: ["ignore", "inherit", "inherit"],
        },
      );
      record({ holder: holder.pid ?? null });
      hang();
    }
    break;
  default:
    process.exitCode = 1;
}
