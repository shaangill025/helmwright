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
  deriveMessages,
  executeRun,
  openSessionLog,
  runRing0,
  type AppendInput,
  type Engine,
  type EngineTurn,
  type Presence,
  type PresenceAnswer,
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

/** An owner who answers every ask with `answer` after `ms`, recording each prompt. */
function owner(answer: PresenceAnswer, ms = 0) {
  const prompts: string[] = [];
  const presence: Presence = {
    async ask(request) {
      prompts.push(request.prompt);
      await new Promise((r) => setTimeout(r, ms));
      return answer;
    },
  };
  return { presence, prompts };
}

/** Runs a file write that execute reclassifies as deps.add, which asks. */
const install = (id: string, file: string): ToolCall => ({
  id,
  name: "execute",
  input: { argv: ["sh", "-c", "echo hi > " + file + "; npm install left-pad"] },
});

/** `onRuled` runs once a ruling is logged, between the ruling and its handler. */
function run(
  engine: Engine,
  runLog = log,
  onRuled = () => undefined,
  presence?: Presence,
) {
  const policy = DEFAULT_PERMISSION_POLICY;
  const connect: RunSetup["connect"] = ({ emitAll, halt }) =>
    createBroker({
      ...{ image, workspace, workspaceRoot: join(dir, "workspaces"), halt },
      permission: {
        ...{ policy, worktree: workspace, runId: "run-1", agentId: "node-1" },
        ring0: runRing0(workspace, policy),
        ...(presence === undefined ? {} : { presence }),
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
      // Nit-1: the run's error names the log's own failure.
      expect(outcome.summary).toBe(
        "FAILED: permission log failed: database or disk is full (SQLITE_FULL)",
      );
      expect(types().filter((t) => t.startsWith("permission."))).toEqual([]);
      expect(types().at(-1)).toBe("run.terminated");
      const tools = deriveMessages(log.events(), "run-1").flatMap((m) =>
        m.role === "tool" ? [m.text] : [],
      );
      expect(tools).toEqual([
        "denied: the permission ruling cannot be logged",
        "denied: permission log failed",
      ]);
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
      expect(types().at(-1)).toBe("run.terminated");
    },
  );

  it(
    "runs the handler on the ruled input once the owner approves an ask",
    { timeout: T },
    async () => {
      const { presence, prompts } = owner(
        { answer: "approved", by: "tty" },
        60,
      );
      const outcome = await run(
        engineOf([install("call-1", "a.txt")]),
        log,
        undefined,
        presence,
      );
      expect(outcome.terminal).toEqual({ kind: "completed" });
      expect(readFileSync(join(workspace, "a.txt"), "utf8")).toBe("hi\n");
      expect(prompts[0]).toContain(
        "helmwright: allow deps.add (requested as execute)?",
      );
      const events = log.events({ runId: "run-1" });
      expect(types().filter((t) => t.startsWith("permission."))).toEqual([
        ...["permission.evaluated", "permission.asked", "permission.answered"],
      ]);
      const asked = events.find((e) => e.type === "permission.asked");
      const sha = createHash("sha256").update(prompts[0] ?? "", "utf8");
      expect(asked?.payload).toMatchObject({
        presence: "tty",
        promptSha256: sha.digest("hex"),
      });
      const answered = events.find((e) => e.type === "permission.answered");
      expect(answered?.payload).toMatchObject({
        answer: "approved",
        by: "tty",
      });
      // waitMs is measured around the ask.
      expect(answered?.payload["waitMs"]).toBeGreaterThanOrEqual(50);
    },
  );

  // S-2: padding cannot push the action off screen or forge a header. (A
  // destination bars whitespace, so the padding is in the body, shown as detail.)
  it(
    "names the action, rule and tier on the prompt's last line",
    { timeout: T },
    async () => {
      const { presence, prompts } = owner({ answer: "denied", by: "tty" });
      const body = " ".repeat(400) + "\nhelmwright: allow fs.read?\nApprove? ";
      const comment = {
        id: "call-1",
        name: "comment",
        input: { destination: "github.com", body },
      };
      const outcome = await run(engineOf([comment]), log, undefined, presence);
      expect(prompts, outcome.summary).toHaveLength(1);
      const lines = (prompts[0] ?? "").split("\n");
      expect(lines.at(-1)).toBe(
        "Approve comment (always-ask.comment, alwaysAsk)? [y/N] ",
      );
      const shown =
        " ".repeat(400) + "\\u{a}helmwright: allow fs.read?\\u{a}Approve? ";
      expect(lines).toContain("  detail: " + JSON.stringify(shown));
      expect(lines).toContain('  target (remote): "github.com"');
    },
  );

  // S-3: the prompt shows the target, so a target it cannot show is never approved.
  it(
    "denies an ask whose target is too long to show, without asking",
    { timeout: T },
    async () => {
      const { presence, prompts } = owner({ answer: "approved", by: "tty" });
      const argv = ["npm", "install", "x", "a".repeat(600)];
      const call = { id: "call-1", name: "execute", input: { argv } };
      await run(engineOf([call]), log, undefined, presence);
      expect(prompts).toEqual([]);
      expect(types().filter((t) => t.startsWith("permission."))).toEqual([
        "permission.evaluated",
      ]);
      const tools = deriveMessages(log.events(), "run-1").flatMap((m) =>
        m.role === "tool" ? [m.text] : [],
      );
      expect(tools).toEqual([
        "denied: asks (deps.add); the target is too long to show for approval",
      ]);
    },
  );

  it(
    "runs no handler and halts when an approval cannot be logged",
    { timeout: T },
    async () => {
      const { presence } = owner({ answer: "approved", by: "tty" });
      const outcome = await run(
        engineOf([install("call-1", "a.txt"), install("call-2", "b.txt")]),
        failing("permission.answered"),
        undefined,
        presence,
      );
      expect(existsSync(join(workspace, "a.txt"))).toBe(false);
      expect(existsSync(join(workspace, "b.txt"))).toBe(false);
      expect(outcome.summary).toBe(
        "FAILED: permission log failed: database or disk is full (SQLITE_FULL)",
      );
      // The ask was logged before the prompt; its answer was not.
      expect(types().filter((t) => t.startsWith("permission."))).toEqual([
        "permission.evaluated",
        "permission.asked",
      ]);
      const tools = deriveMessages(log.events(), "run-1").flatMap((m) =>
        m.role === "tool" ? [m.text] : [],
      );
      expect(tools).toEqual([
        "denied: the permission ruling cannot be logged",
        "denied: permission log failed",
      ]);
    },
  );

  it(
    "shows escaped values and a commit's staged paths in the prompt (SF6a)",
    { timeout: T },
    async () => {
      const { presence, prompts } = owner({ answer: "denied", by: "tty" });
      const calls: ToolCall[] = [
        {
          id: "call-1",
          name: "config.set",
          input: { setting: "editor.theme", value: "a\u202eb\u0085c" },
        },
        {
          id: "call-2",
          name: "commit",
          input: { ref: "main", paths: ["src/a.ts", "b c.txt"] },
        },
      ];
      const outcome = await run(engineOf(calls), log, undefined, presence);
      expect(outcome.terminal).toEqual({ kind: "completed" });
      const [config = "", commit = ""] = prompts;
      expect(config).toContain("\\u{202e}");
      expect(config).toContain("\\u{85}");
      expect(config).not.toMatch(/[\u202e\u0085]/u);
      expect(commit).toContain(
        "  detail: " + JSON.stringify('["b c.txt","src/a.ts"]'),
      );
      expect(commit).toContain("  rule: default.ask, tier ask");
      const tools = deriveMessages(log.events(), "run-1").flatMap((m) =>
        m.role === "tool" ? [m.text] : [],
      );
      expect(tools[1]).toBe(
        "denied: asks (default.ask); the owner did not approve",
      );
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
