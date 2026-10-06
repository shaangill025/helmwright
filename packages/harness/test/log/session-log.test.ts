import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EventValidationError,
  openSessionLog,
  type AppendInput,
  type SessionLog,
} from "../../src/index.ts";

// Real node:sqlite database files in a fresh temp dir; no mocks.
const MODULE = fileURLToPath(
  new URL("../../src/log/session-log.ts", import.meta.url),
);
let dir: string;
let file: string;
let open: SessionLog[];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "hw-log-"));
  file = join(dir, "state", "session.db");
  open = [];
});
afterEach(() => {
  for (const log of open) log.close();
  rmSync(dir, { recursive: true, force: true });
});

function openLog(): SessionLog {
  const log = openSessionLog(file);
  open.push(log);
  return log;
}
function closeLog(log: SessionLog): void {
  log.close();
  open = open.filter((l) => l !== log);
}
let nextId = 0;
function input(overrides: Partial<AppendInput> = {}): AppendInput {
  nextId += 1;
  return {
    eventId: `evt-${String(nextId)}`,
    graphId: "graph-1",
    runId: "run-1",
    nodeId: "node-1",
    type: "test.happened",
    at: new Date().toISOString(),
    payload: { n: nextId },
    ...overrides,
  };
}
const seqs = (log: SessionLog): number[] => log.events().map((e) => e.seq);

describe("openSessionLog", () => {
  it("creates the file 0600 in WAL mode, empty", () => {
    const log = openLog();
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(log.lastSeq()).toBeUndefined();
    expect(log.events()).toEqual([]);
    log.append(input());
    expect(statSync(`${file}-wal`).mode & 0o777).toBe(0o600);
    const raw = new DatabaseSync(file);
    expect(raw.prepare("PRAGMA journal_mode").get()).toEqual({
      journal_mode: "wal",
    });
    raw.close();
  });

  it("refuses an unknown schema version and a foreign database", () => {
    openLog();
    closeLog(open[0] as SessionLog);
    const raw = new DatabaseSync(file);
    raw.exec("PRAGMA user_version = 99");
    raw.close();
    expect(() => openSessionLog(file)).toThrow(/schema version 99/);

    const foreign = join(dir, "foreign.db");
    const other = new DatabaseSync(foreign);
    other.exec("CREATE TABLE t (x)");
    other.close();
    expect(() => openSessionLog(foreign)).toThrow(/not a session log/);
  });
});

describe("append and read", () => {
  it("survives reopen and continues seq gap-free", () => {
    const first = openLog();
    const stored = first.append(input({ runId: "run-a" }));
    expect(stored).toMatchObject({ schemaVersion: 1, seq: 0, runId: "run-a" });
    first.append(input({ runId: "run-b" }));
    closeLog(first);

    const second = openLog();
    expect(second.events()[0]).toEqual(stored);
    expect(second.append(input({ runId: "run-a" })).seq).toBe(2);
    expect(seqs(second)).toEqual([0, 1, 2]);
    expect(second.lastSeq()).toBe(2);
    expect(second.events({ runId: "run-a" }).map((e) => e.seq)).toEqual([0, 2]);
    expect(second.events({ fromSeq: 1 }).map((e) => e.seq)).toEqual([1, 2]);
    expect(() => second.events({ fromSeq: -1 })).toThrow(RangeError);
  });

  it.each([
    ["missing nodeId", { nodeId: undefined }, /nodeId/],
    ["bad type", { type: "Run.Started" }, /type/],
    ["array payload", { payload: [] }, /payload/],
    ["string payload", { payload: "x" }, /payload/],
    ["unknown key", { extra: 1 }, /additional/],
  ])("rejects %s and writes nothing", (_name, bad, message) => {
    const log = openLog();
    log.append(input());
    const event = { ...input(), ...bad } as unknown as AppendInput;
    expect(() => log.append(event)).toThrow(EventValidationError);
    expect(() => log.append(event)).toThrow(message);
    expect(seqs(log)).toEqual([0]);
    expect(log.append(input()).seq).toBe(1);
  });

  it("rejects a duplicate eventId without consuming seq", () => {
    const log = openLog();
    log.append(input({ eventId: "same" }));
    expect(() => log.append(input({ eventId: "same" }))).toThrow(/event_id/);
    expect(log.append(input()).seq).toBe(1);
  });
});

describe("append-only enforcement", () => {
  it("rejects raw UPDATE and DELETE from another connection", () => {
    const log = openLog();
    const stored = log.append(input());
    const raw = new DatabaseSync(file);
    const rawExec = (sql: string) => () => {
      raw.exec(sql);
    };
    expect(rawExec("UPDATE events SET type = 'x.y'")).toThrow(/append-only/);
    expect(rawExec("DELETE FROM events")).toThrow(/append-only/);
    expect(
      rawExec(
        `INSERT INTO events VALUES (5, 'gap', 'g', 'r', 'n', 'x.y', 'a', '{}')`,
      ),
    ).toThrow(/gap-free/);
    raw.close();
    expect(log.events()).toEqual([stored]);
  });
});

describe("transaction", () => {
  it("is all-or-nothing", () => {
    const log = openLog();
    log.append(input());
    expect(() => {
      log.transaction(() => {
        log.append(input());
        log.append(input());
        throw new Error("object change failed");
      });
    }).toThrow("object change failed");
    expect(seqs(log)).toEqual([0]);
    expect(log.lastSeq()).toBe(0);

    const result = log.transaction(() => [
      log.append(input()),
      log.append(input()),
    ]);
    expect(result.map((e) => e.seq)).toEqual([1, 2]);
    expect(seqs(log)).toEqual([0, 1, 2]);
  });

  it("refuses nesting and async callbacks, storing nothing", () => {
    const log = openLog();
    expect(() => {
      log.transaction(() => {
        log.append(input());
        log.transaction(() => 1);
      });
    }).toThrow(/nested/);
    expect(() =>
      log.transaction(() => {
        log.append(input());
        return Promise.resolve();
      }),
    ).toThrow(/synchronous/);
    expect(log.lastSeq()).toBeUndefined();
  });
});

describe("cross-process", () => {
  // Both writers pause 1 ms between appends: SQLite's busy handler is not fair,
  // so an unpaced tight loop can starve the other writer past its busy timeout.
  it("interleaves appends from a second process gap-free", async () => {
    const CHILD_EVENTS = 50;
    const tick = () => new Promise((resolve) => setTimeout(resolve, 1));
    const log = openLog();
    log.append(input());
    const script = `
      const { openSessionLog } = await import(${JSON.stringify(MODULE)});
      const log = openSessionLog(${JSON.stringify(file)});
      for (let i = 0; i < ${String(CHILD_EVENTS)}; i++) {
        log.append({ eventId: "child-" + i, graphId: "graph-1", runId: "child",
          nodeId: "node-1", type: "test.child", at: new Date().toISOString(),
          payload: { i } });
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      log.close();`;
    const child = spawn(
      process.execPath,
      ["--input-type=module", "-e", script],
      {
        stdio: ["ignore", "ignore", "pipe"],
      },
    );
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const exited = new Promise<number | null>((resolve) => {
      child.on("close", resolve);
    });
    let parentEvents = 1;
    while (child.exitCode === null && child.signalCode === null) {
      log.append(input({ runId: "parent" }));
      parentEvents += 1;
      await tick();
    }
    expect({ code: await exited, stderr }).toEqual({ code: 0, stderr: "" });

    const all = log.events();
    expect(all.map((e) => e.seq)).toEqual([...all.keys()]);
    expect(all).toHaveLength(parentEvents + CHILD_EVENTS);
    const fromChild = log.events({ runId: "child" });
    expect(fromChild.map((e) => e.payload["i"])).toEqual([
      ...Array(CHILD_EVENTS).keys(),
    ]);
    // Parent events landed between the child's first and last: real interleaving.
    const span = (fromChild.at(-1)?.seq ?? 0) - (fromChild[0]?.seq ?? 0) + 1;
    expect(span).toBeGreaterThan(CHILD_EVENTS);
  }, 30_000);
});
