import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  BROKER_TOOLS,
  DEFAULT_PERMISSION_POLICY,
  SANDBOX_BASE_IMAGE,
  buildSandboxImage,
  canonicalJson,
  createBroker,
  executeRun,
  openSessionLog,
  runRing0,
  type AppendInput,
  type Engine,
  type EngineTurn,
  type RunSetup,
  type SessionLog,
  type ToolCall,
} from "../../src/index.ts";

// The real broker, policy, SQLite log and Docker sandbox; only the log's append can be made to fail.
const T = 120_000;
const LIMITS = {
  maxIterations: 3,
  maxToolCallsPerIteration: 4,
  timeoutMs: 60_000,
  noProgressIterations: 3,
};
let image: string;
let dir: string;
let workspace: string;
let log: SessionLog;

beforeAll(async () => {
  const pull = spawnSync("docker", ["pull", SANDBOX_BASE_IMAGE], {
    encoding: "utf8",
    timeout: 300_000,
  });
  if (pull.status !== 0) {
    throw new Error(
      `docker pull failed: ${pull.error?.message ?? pull.stderr}`,
    );
  }
  image = await buildSandboxImage();
}, 600_000);

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "hw-broker-")));
  workspace = join(dir, "workspaces", "run-1");
  mkdirSync(workspace, { recursive: true, mode: 0o700 });
  log = openSessionLog(join(dir, "session.sqlite"));
});
afterEach(() => {
  log.close();
  rmSync(dir, { recursive: true, force: true });
});

const write = (id: string, file: string): ToolCall => ({
  id,
  name: "execute",
  input: { argv: ["sh", "-c", "echo hi > " + file] },
});

/** One turn of `calls`, then done. */
function engineOf(calls: ToolCall[]): Engine {
  const turns: EngineTurn[] = [
    { text: "acting", toolCalls: calls, claimsDone: false },
    { text: "done", toolCalls: [], claimsDone: true },
  ];
  let next = 0;
  return {
    step() {
      const turn = turns[next++];
      if (turn === undefined) return Promise.reject(new Error("exhausted"));
      return Promise.resolve(turn);
    },
  };
}

/** The run's log, whose append throws for the `n`th event of type `type`. */
function failing(type: string, n = 1): SessionLog {
  let seen = 0;
  return {
    append(input: AppendInput) {
      if (input.type === type && ++seen === n) {
        throw new Error("database or disk is full (SQLITE_FULL)");
      }
      return log.append(input);
    },
    transaction: (fn) => log.transaction(fn),
    events: (query) => log.events(query),
    lastSeq: () => log.lastSeq(),
    close: () => {
      log.close();
    },
  };
}

/** `onRuled` runs once a ruling is logged, between the ruling and its handler. */
function run(engine: Engine, runLog = log, onRuled = () => undefined) {
  const policy = DEFAULT_PERMISSION_POLICY;
  const connect: RunSetup["connect"] = ({ emitAll, halt }) =>
    createBroker({
      ...{ image, workspace, workspaceRoot: join(dir, "workspaces"), halt },
      permission: {
        ...{ policy, worktree: workspace, runId: "run-1", agentId: "node-1" },
        ring0: runRing0(workspace, policy),
        emitAll(entries) {
          emitAll(entries);
          onRuled();
        },
      },
    }).executeTool;
  return executeRun({
    ...{ log: runLog, graphId: "graph-1", runId: "run-1", nodeId: "node-1" },
    ...{ title: "task", limits: LIMITS, started: {}, engine },
    ...{ tools: BROKER_TOOLS, connect },
  });
}

const types = () => log.events({ runId: "run-1" }).map((e) => e.type);

describe("broker with the run's log", () => {
  it(
    "runs no later call once a ruling cannot be logged (SF-1)",
    { timeout: T },
    async () => {
      const calls = [write("call-1", "a.txt"), write("call-2", "b.txt")];
      const outcome = await run(
        engineOf(calls),
        failing("permission.evaluated"),
      );
      expect(existsSync(join(workspace, "a.txt"))).toBe(false);
      expect(existsSync(join(workspace, "b.txt"))).toBe(false);
      expect(outcome.terminal).toMatchObject({ kind: "failed" });
      expect(types().filter((t) => t.startsWith("permission."))).toEqual([]);
      expect(types().at(-1)).toBe("run.terminated");
    },
  );

  it(
    "commits none of a ruling's entries when one append fails (SF-2)",
    { timeout: T },
    async () => {
      const deploy = {
        id: "call-1",
        name: "deploy",
        input: { destination: "prod" },
      };
      const outcome = await run(
        engineOf([deploy]),
        failing("permission.asked"),
      );
      expect(types().filter((t) => t.startsWith("permission."))).toEqual([]);
      expect(outcome.terminal).toMatchObject({ kind: "failed" });
    },
  );

  it(
    "runs the ruled snapshot when the engine mutates the input after its step (AC8)",
    { timeout: T },
    async () => {
      const call = write("call-1", "out.txt");
      const argv = (call.input as { argv: string[] }).argv;
      const original = { argv: [...argv] };
      // The engine's copy changes after its step, between the ruling and the handler.
      const outcome = await run(engineOf([call]), log, () => {
        argv[0] = "false";
      });
      // The loop's copy shares the engine's object: the desync check ends the run.
      expect(outcome.summary).toMatch(/^FAILED: context desync /);
      expect(argv[0]).toBe("false");
      expect(readFileSync(join(workspace, "out.txt"), "utf8")).toBe("hi\n");
      const evaluated = log
        .events({ runId: "run-1" })
        .find((e) => e.type === "permission.evaluated");
      const sha = createHash("sha256").update(canonicalJson(original));
      expect(evaluated?.payload["inputSha256"]).toBe(sha.digest("hex"));
    },
  );
});
