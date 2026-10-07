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
  permissionFaults,
  runRing0,
  type AppendInput,
  type Engine,
  type EngineTurn,
  type Presence,
  type PresenceAnswer,
  type PresenceRequest,
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

/** MAX_PROMPT_TARGET: a target's most code points as shown, quotes included. */
const TARGET_CAP = 320;

const call = (name: string, input: Record<string, unknown>): ToolCall => ({
  id: "call-1",
  name,
  input,
});

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
    "rejects a tool call ID already used in the run before any ruling (S2)",
    { timeout: T },
    async () => {
      const calls = [write("call-1", "a.txt"), write("call-1", "b.txt")];
      const outcome = await run(engineOf(calls));
      expect(outcome.terminal).toEqual({ kind: "completed" });
      expect(existsSync(join(workspace, "a.txt"))).toBe(true);
      expect(existsSync(join(workspace, "b.txt"))).toBe(false);
      const events = log.events({ runId: "run-1" });
      const ruled = events.filter((e) => e.type.startsWith("permission."));
      expect(ruled.map((e) => [e.type, e.payload["toolCallId"]])).toEqual([
        ["permission.evaluated", "call-1"],
        ["permission.rejected", "call-1"],
      ]);
      expect(ruled[1]?.payload).toMatchObject({
        guard: "schema",
        ruleId: "schema.duplicate-call-id",
      });
      const tools = deriveMessages(events, "run-1").flatMap((m) =>
        m.role === "tool" ? [[m.status, m.text]] : [],
      );
      expect(tools[1]).toEqual([
        "denied",
        "denied: tool call ID already used in this run",
      ]);
      expect(permissionFaults(events)).toEqual([]);
    },
  );

  it(
    "rejects an ID reused after an approved ask with a view (N-e)",
    { timeout: T },
    async () => {
      const presence: Presence = {
        ask: () =>
          Promise.resolve({ answer: "approved", by: "tty", viewed: true }),
      };
      const { argv } = install("call-1", "a.txt").input as { argv: string[] };
      const long = call("execute", {
        argv: [...argv.slice(0, 2), (argv[2] ?? "") + "\t".repeat(200)],
      });
      const calls = [long, write("call-1", "b.txt")];
      const outcome = await run(engineOf(calls), log, undefined, presence);
      expect(outcome.terminal).toEqual({ kind: "completed" });
      expect(existsSync(join(workspace, "a.txt"))).toBe(true);
      expect(existsSync(join(workspace, "b.txt"))).toBe(false);
      const events = log.events({ runId: "run-1" });
      const ruled = events.filter((e) => e.type.startsWith("permission."));
      expect(ruled.map((e) => e.type)).toEqual([
        "permission.evaluated",
        "permission.asked",
        "permission.answered",
        "permission.rejected",
      ]);
      expect(ruled[1]?.payload["viewSha256"]).toMatch(/^[0-9a-f]{64}$/);
      expect(permissionFaults(events)).toEqual([]);
    },
  );

  it(
    "rejects an ID reused after an unloggable first call (N-e)",
    { timeout: T },
    async () => {
      // A first call whose ID cannot be logged is denied with no ruling (LOG_DENIED).
      const calls = [write("call 1", "a.txt"), write("call 1", "b.txt")];
      const outcome = await run(engineOf(calls));
      expect(outcome.terminal).toEqual({ kind: "completed" });
      expect(existsSync(join(workspace, "a.txt"))).toBe(false);
      expect(existsSync(join(workspace, "b.txt"))).toBe(false);
      const events = log.events({ runId: "run-1" });
      expect(events.filter((e) => e.type.startsWith("permission."))).toEqual(
        [],
      );
      const tools = deriveMessages(events, "run-1").flatMap((m) =>
        m.role === "tool" ? [m.text] : [],
      );
      expect(tools).toEqual([
        "denied: the permission ruling cannot be logged",
        "denied: the permission ruling cannot be logged",
      ]);
      expect(permissionFaults(events)).toEqual([]);
    },
  );

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
      // The header can scroll off; the last line keeps what was requested.
      expect(prompts[0]?.split("\n").at(-1)).toMatch(
        /^Approve deps\.add \(requested as execute\) \(/,
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

  // B9b-3c: a target or detail over its shown cap (SF-A) or cut by the policy (512
  // raw code points) is asked with a full-value view; the prompt shows a summary.
  const cases: [string, ToolCall, string][] = [
    [
      "an argv cut by the policy",
      call("execute", { argv: ["npm", "install", "x", "a".repeat(600)] }),
      "asks (deps.add)",
    ],
    [
      "an argv with 200 tabs",
      call("execute", { argv: ["npm", "install", "x" + "\t".repeat(200)] }),
      "asks (deps.add)",
    ],
    [
      "a body with 300 newlines",
      call("comment", { destination: "github.com", body: "\n".repeat(300) }),
      "always asks (always-ask.comment)",
    ],
    [
      "a target one over its cap",
      call("deploy", { destination: "a".repeat(TARGET_CAP - 1) }),
      "always asks (always-ask.deploy)",
    ],
  ];
  it.each(cases)(
    "asks with a view for %s; an approval without it denies",
    { timeout: T },
    async (_, toolCall, rule) => {
      const { presence, prompts } = owner({ answer: "approved", by: "tty" });
      await run(engineOf([toolCall]), log, undefined, presence);
      expect(prompts).toHaveLength(1);
      expect(prompts[0]).toMatch(/\? \[v=view, y\/N\] $/);
      expect(types().filter((t) => t.startsWith("permission."))).toEqual([
        ...["permission.evaluated", "permission.asked", "permission.answered"],
      ]);
      const answered = log
        .events({ runId: "run-1" })
        .find((e) => e.type === "permission.answered");
      expect(answered?.payload).toMatchObject({
        answer: "denied",
        viewed: false,
      });
      const tools = deriveMessages(log.events(), "run-1").flatMap((m) =>
        m.role === "tool" ? [m.text] : [],
      );
      expect(tools).toEqual(["denied: " + rule + "; the ask was cancelled"]);
    },
  );

  it(
    "runs the handler once the owner viewed the full value and approved",
    { timeout: T },
    async () => {
      const requests: PresenceRequest[] = [];
      const presence: Presence = {
        ask(request) {
          requests.push(request);
          return Promise.resolve({
            answer: "approved",
            by: "tty",
            viewed: true,
          });
        },
      };
      const command =
        "echo hi > a.txt; npm install left-pad" + "\t".repeat(200);
      const longArgv = ["sh", "-c", command];
      const outcome = await run(
        engineOf([call("execute", { argv: longArgv })]),
        log,
        undefined,
        presence,
      );
      expect(outcome.terminal).toEqual({ kind: "completed" });
      expect(readFileSync(join(workspace, "a.txt"), "utf8")).toBe("hi\n");
      const { prompt, view } = requests[0] ?? { prompt: "" };
      // Canonical JSON writes each tab as \t; the policy shows each \ as \\.
      const escaped = Array.from(
        JSON.stringify(longArgv).split("\\").join("\\\\"),
      );
      expect(view).toBe(
        "full target (argv):\n" + JSON.stringify(escaped.join("")),
      );
      const sha = (text: string) =>
        createHash("sha256").update(text, "utf8").digest("hex");
      const viewSha = sha(view ?? "");
      const lines = prompt.split("\n");
      const summary =
        JSON.stringify(escaped.slice(0, 120).join("")) +
        " … [" +
        String(escaped.length) +
        " code points, sha256 " +
        viewSha.slice(0, 16) +
        "]";
      expect(lines.slice(-2)).toEqual([
        "  target (argv): " + summary,
        "Approve deps.add (requested as execute) (deps.add, ask)? [v=view, y/N] ",
      ]);
      const events = log.events({ runId: "run-1" });
      const payload = (type: string) =>
        events.find((e) => e.type === type)?.payload;
      expect(payload("permission.asked")).toMatchObject({
        promptSha256: sha(prompt),
        viewSha256: viewSha,
      });
      expect(payload("permission.answered")).toMatchObject({
        answer: "approved",
        by: "tty",
        viewed: true,
      });
    },
  );

  // SF2: a run of spaces cannot pad the view; N6: the summary splits no escape.
  it(
    "marks space runs in the view and keeps escapes whole in the summary",
    { timeout: T },
    async () => {
      const requests: PresenceRequest[] = [];
      const presence: Presence = {
        ask(request) {
          requests.push(request);
          return Promise.resolve({ answer: "denied", by: "tty" });
        },
      };
      // S1: a digit right after a run must not join its count.
      const body = "x".repeat(118) + "\n␠a" + " ".repeat(10_000) + "5b";
      const input = { destination: "github.com", body };
      await run(engineOf([call("comment", input)]), log, undefined, presence);
      const { prompt, view } = requests[0] ?? { prompt: "" };
      const shown = "x".repeat(118) + "\\u{a}\\u{2420}a␠×10000×5b";
      expect(view).toBe("full detail:\n" + JSON.stringify(shown));
      expect(prompt).toContain(
        "  detail: " + JSON.stringify("x".repeat(118)) + " … [10127 code",
      );
    },
  );

  // R2: U+2800 looks blank: it is escaped, and its runs are counted in the view.
  it("never shows a braille blank raw", { timeout: T }, async () => {
    const requests: PresenceRequest[] = [];
    const presence: Presence = {
      ask(request) {
        requests.push(request);
        return Promise.resolve({ answer: "denied", by: "tty" });
      },
    };
    const body = "a" + "⠀".repeat(5000) + "×b";
    const input = { destination: "github.com", body };
    await run(engineOf([call("comment", input)]), log, undefined, presence);
    const { prompt, view } = requests[0] ?? { prompt: "" };
    expect(view).toBe(
      "full detail:\n" + JSON.stringify("a\\u{2800}×5000×\\u{d7}b"),
    );
    expect(prompt + (view ?? "")).not.toContain("⠀");
  });

  // S-3: past 64 KiB of code points there is no full form to view: no ask.
  it(
    "denies a target over 64 KiB without asking (S-3)",
    { timeout: T },
    async () => {
      const { presence, prompts } = owner({ answer: "approved", by: "tty" });
      const argv = ["npm", "install", "a".repeat(65_536)];
      await run(
        engineOf([call("execute", { argv })]),
        log,
        undefined,
        presence,
      );
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
    "asks for a target at its cap, shown on the second-last line (SF-A)",
    { timeout: T },
    async () => {
      const { presence, prompts } = owner({ answer: "denied", by: "tty" });
      const destination = "a".repeat(TARGET_CAP - 2); // quoted: at the cap
      await run(
        engineOf([call("deploy", { destination })]),
        log,
        undefined,
        presence,
      );
      const lines = (prompts[0] ?? "").split("\n");
      expect(lines.slice(-2)).toEqual([
        '  target (remote): "' + destination + '"',
        "Approve deploy (always-ask.deploy, alwaysAsk)? [y/N] ",
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
