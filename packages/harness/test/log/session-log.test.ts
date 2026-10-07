import { spawn } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EventValidationError,
  SESSION_LOG_SCHEMA_VERSION,
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
function rawInsert(
  raw: DatabaseSync,
  [verb, seq, eventId, version]: [string, number | null, string, number?],
): void {
  raw
    .prepare(
      verb +
        " INTO events (seq, event_id, graph_id, run_id, node_id, type, at," +
        " payload, schema_version) VALUES (?, ?, 'g', 'r', 'n', 'x.y', ?, ?, ?)",
    )
    .run(seq, eventId, new Date().toISOString(), "{}", version ?? 1);
}
/** Runs a child ES module; values reach it through env, never by splicing them into code. */
function runNode(
  lines: readonly string[],
  env: Readonly<Record<string, string>>,
) {
  const script = lines.join("\n");
  const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
    stdio: ["ignore", "ignore", "pipe"],
    env: { ...process.env, HW_MODULE: MODULE, HW_FILE: file, ...env },
  });
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const done = new Promise<{ code: number | null; stderr: string }>((res) => {
    child.on("close", (code) => {
      res({ code, stderr });
    });
  });
  return { child, done };
}

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
    const v1 = new DatabaseSync(file);
    v1.exec("PRAGMA user_version = 1");
    v1.close();
    expect(() => openSessionLog(file)).toThrow(/schema version 1\b/);

    const foreign = join(dir, "foreign.db");
    const other = new DatabaseSync(foreign);
    other.exec("CREATE TABLE t (x)");
    other.close();
    expect(() => openSessionLog(foreign)).toThrow(/not a session log/);
  });

  it("tightens a pre-existing group/other-readable file and directory", () => {
    mkdirSync(dirname(file));
    chmodSync(dirname(file), 0o755);
    for (const path of [file, `${file}-wal`]) {
      writeFileSync(path, "");
      chmodSync(path, 0o644);
    }
    openLog().append(input());
    expect(statSync(dirname(file)).mode & 0o777).toBe(0o700);
    for (const path of [file, `${file}-wal`, `${file}-shm`]) {
      expect(statSync(path).mode & 0o077).toBe(0);
    }
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

  it("stores schema_version per row and reads it back", () => {
    const log = openLog();
    log.append(input());
    const raw = new DatabaseSync(file);
    expect(raw.prepare("PRAGMA user_version").get()).toEqual({
      user_version: SESSION_LOG_SCHEMA_VERSION,
    });
    expect(raw.prepare("SELECT schema_version FROM events").all()).toEqual([
      { schema_version: 1 },
    ]);
    rawInsert(raw, ["INSERT", 1, "future", 2]);
    raw.close();
    expect(() => log.events()).toThrow(/corrupt event at seq 1.*schemaVersion/);
  });
});

describe("append-only enforcement", () => {
  it("rejects raw UPDATE, DELETE and bad INSERTs from another connection", () => {
    const log = openLog();
    const stored = log.append(input({ eventId: "first" }));
    const raw = new DatabaseSync(file);
    const rawExec = (sql: string) => () => {
      raw.exec(sql);
    };
    expect(rawExec("UPDATE events SET type = 'x.y'")).toThrow(/append-only/);
    expect(rawExec("DELETE FROM events")).toThrow(/append-only/);
    const inserts: [[string, number | null, string], RegExp][] = [
      [["INSERT", 5, "gap"], /gap-free/],
      [["INSERT", 0, "behind"], /gap-free/],
      [["INSERT OR REPLACE", 0, "replace"], /gap-free/],
      [["INSERT", null, "null-seq"], /gap-free/],
      [["INSERT", 1, "first"], /duplicate event_id/],
      [["INSERT OR REPLACE", 1, "first"], /duplicate event_id/],
    ];
    for (const [row, error] of inserts) {
      expect(() => {
        rawInsert(raw, row);
      }).toThrow(error);
    }
    expect(raw.prepare("SELECT COUNT(*) AS n FROM events").get()).toEqual({
      n: 1,
    });
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
    const asyncFn = async () => {
      log.append(input());
      await Promise.resolve();
    };
    // Checked by tsc: a Promise-returning callback is not a valid argument.
    type Arg = Parameters<
      typeof log.transaction<ReturnType<typeof asyncFn>>
    >[0];
    const accepted: typeof asyncFn extends Arg ? true : false = false;
    expect(accepted).toBe(false);
    expect(() => log.transaction(asyncFn as () => never)).toThrow(
      /synchronous/,
    );
    expect(log.lastSeq()).toBeUndefined();
  });

  it("leaves no unhandled rejection when an async callback rejects", async () => {
    openLog();
    const { done } = runNode(
      [
        "const { openSessionLog } = await import(process.env.HW_MODULE);",
        "const log = openSessionLog(process.env.HW_FILE);",
        "try {",
        '  log.transaction(() => Promise.reject(new Error("late failure")));',
        "} catch {}",
        "await new Promise((resolve) => setTimeout(resolve, 10));",
        "log.close();",
      ],
      {},
    );
    expect(await done).toEqual({ code: 0, stderr: "" });
  });

  it("refuses every later write once a rollback fails (N-3)", () => {
    const log = openLog();
    log.append(input());
    // The only way to make SQLite's ROLLBACK fail on demand: a stub on the driver,
    // installed after BEGIN, so the next exec (the ROLLBACK) throws.
    const spy = vi.spyOn(DatabaseSync.prototype, "exec");
    try {
      expect(() =>
        log.transaction(() => {
          log.append(input());
          spy.mockImplementation(() => {
            throw new Error("disk I/O error");
          });
          throw new Error("boom");
        }),
      ).toThrow(/rollback failed/);
    } finally {
      spy.mockRestore();
    }
    // The connection may still hold the open transaction: an append would never commit.
    expect(() => log.append(input())).toThrow(/rollback failed/);
    expect(() => log.transaction(() => 1)).toThrow(/rollback failed/);
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
    const { child, done } = runNode(
      [
        "const { openSessionLog } = await import(process.env.HW_MODULE);",
        "const log = openSessionLog(process.env.HW_FILE);",
        "for (let i = 0; i < Number(process.env.HW_COUNT); i++) {",
        '  log.append({ eventId: "child-" + i, graphId: "graph-1", runId: "child",',
        '    nodeId: "node-1", type: "test.child", at: new Date().toISOString(),',
        "    payload: { i } });",
        "  await new Promise((resolve) => setTimeout(resolve, 1));",
        "}",
        "log.close();",
      ],
      { HW_COUNT: String(CHILD_EVENTS) },
    );
    let parentEvents = 1;
    while (child.exitCode === null && child.signalCode === null) {
      log.append(input({ runId: "parent" }));
      parentEvents += 1;
      await tick();
    }
    expect(await done).toEqual({ code: 0, stderr: "" });

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
