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
    } else if (mode === "signal") {
      process.kill(process.pid, "SIGKILL");
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
    if (args[0] === "rm" && (mode === "rm-race" || mode === "rm-fail")) {
      // A concurrent reaper got there first (race), or a real failure.
      process.stderr.write(
        mode === "rm-race"
          ? "Error response from daemon: removal of container aaa111 is already in progress\n"
          : "Error response from daemon: cannot remove container aaa111: permission denied\n",
      );
      process.exitCode = 1;
    }
    break;
  case "ps":
    if (args.includes("label=helmwright.sandbox")) {
      // ID, name, instance label, owner-pid label: dead owner, live owner (pid 1), foreign name.
      process.stdout.write(
        "aaa111\thelmwright-sandbox-a\tother\t2147483646\n" +
          "bbb222\thelmwright-sandbox-b\tother\t1\n" +
          "ccc333\tsomeone-else\tother\t2147483646\n",
      );
      // Mode "own-<instance>": also a live container of the caller's own instance.
      if (mode.startsWith("own-")) {
        process.stdout.write(
          "ddd444\thelmwright-sandbox-d\t" + mode.slice(4) + "\t1\n",
        );
      }
    } else if (mode === "hang" || mode === "signal") {
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
