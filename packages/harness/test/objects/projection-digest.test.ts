import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  artifactRecorded,
  decisionOpened,
  footprintAddress,
  openSessionLog,
  projectionDigest,
  runRecorded,
  taskCreated,
  type SessionLog,
} from "../../src/index.ts";

// B5-3b: the projection digest, verifyProjections, rebuildProjections and the owner's
// `inspect` and `rebuild` commands, on real node:sqlite files and the real CLI.
const CLI = fileURLToPath(new URL("../../src/cli.ts", import.meta.url));
const RUN = "run-a";
const AT = "2026-10-08T00:00:00.000Z";
const repoId = "/Users/x/repo/.git";
let dir: string;
let file: string;
let log: SessionLog;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "hw-digest-"));
  file = join(dir, "session.sqlite");
  log = openSessionLog(file);
});
afterEach(() => {
  log.close();
  rmSync(dir, { recursive: true, force: true });
});

let nextId = 0;
function append(type: string, payload: object): void {
  nextId += 1;
  const eventId = "evt-" + String(nextId);
  const envelope = {
    eventId,
    graphId: "graph-1",
    runId: RUN,
    nodeId: "node-1",
  };
  log.append({ ...envelope, type, at: AT, payload: { ...payload } });
}
/** Runs `fn` on a raw connection; `harness` registers the projection flag as on. */
function raw<T>(fn: (db: DatabaseSync) => T, harness = false, path = file): T {
  const db = new DatabaseSync(path);
  try {
    if (harness) db.function("hw_projection_write", () => 1);
    return fn(db);
  } finally {
    db.close();
  }
}
const rawExec = (sql: string, harness = false) => {
  raw((db) => {
    db.exec(sql);
  }, harness);
};
/** Inserts an event row as a raw writer would, at the next seq. */
function rawEvent(type: string, payload: string, at = AT): number {
  const seq = (log.lastSeq() ?? -1) + 1;
  raw((db) => {
    const sql =
      "INSERT INTO events VALUES (?, 1, ?, 'graph-1', ?, 'node-1', ?, ?, ?)";
    db.prepare(sql).run(seq, "evt-raw-" + String(seq), RUN, type, at, payload);
  });
  return seq;
}
const cli = (...args: string[]) =>
  spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    timeout: 60_000,
  });
const sha256 = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");

const task = (id = "task-1", scope = ["src/a.ts"]) =>
  taskCreated({ id, repoId, text: "add a dependency", scope });
const fileA = artifactRecorded({
  ...footprintAddress("footprint.file", repoId, "src/a.ts"),
  type: "footprint.file",
  repoId,
  ref: "src/a.ts",
});
const owned = decisionOpened({
  id: "decision-1",
  authority: "owner",
  taskId: "task-1",
  runId: RUN,
  signalIds: ["floor-dep-1"],
  class: "technology",
  source: "floor",
  brief: {
    question: "Which HTTP client should the harness use?",
    options: [
      { id: "a", label: "A", tradeoffs: "more code" },
      { id: "b", label: "B", tradeoffs: "one dependency" },
    ],
    recommendationSha256: "d".repeat(64),
    optionOrderSeed: "e".repeat(32),
    confidence: "medium",
    costIfWrong: "one module to rewrite",
    reversibility: "costly",
    uncertainty: "retries behind a proxy",
    blocked: "the fetch module",
    concepts: ["http-client"],
    proposedFootprint: [fileA.id],
  },
});
/** task-1, its run RUN, a footprint Artifact and the owned decision-1. */
function seed(): void {
  append("task.created", task());
  const run = runRecorded({
    taskId: "task-1",
    engine: "scripted",
    baseCommit: "a".repeat(40),
    class: "bounded",
  });
  append("run.recorded", run);
  append("artifact.recorded", { ...fileA, runId: RUN });
  append("decision.opened", owned);
}
const IDS = [fileA.id, "decision-1", RUN, "task-1"];
const EMPTY = sha256('["helmwright-projection-1",[]]');

describe("projection digest and verifyProjections (B5-3b)", () => {
  it("matches an untouched log and keeps the digest format", () => {
    expect(log.verifyProjections()).toEqual({
      match: true,
      guarded: true,
      storedDigest: EMPTY,
      rebuiltDigest: EMPTY,
      differingIds: [],
    });
    const records = new Map([
      ["b", { x: 1 }],
      ["a", { z: 2, y: [3] }],
    ]);
    const text = '["helmwright-projection-1",[{"y":[3],"z":2},{"x":1}]]';
    expect(projectionDigest(records)).toBe(sha256(text));
    seed();
    const check = log.verifyProjections();
    expect(check).toMatchObject({ match: true, differingIds: [] });
    expect(check.storedDigest).toBe(check.rebuiltDigest);
    expect(check.rebuiltDigest).toBe(
      "bdf66a58a8a63cec1a3641b03ae8bda6fee38c9c7403ea65708dd7b9001d1c95",
    );
  });

  it("finds a hand-edited, a deleted and an extra row by ID", () => {
    seed();
    const digest = log.verifyProjections().rebuiltDigest;
    const resolved = { ...log.object("decision-1"), status: "resolved" };
    raw((db) => {
      db.exec("DROP TRIGGER objects_guard_update");
      const sql = "UPDATE objects SET record = ? WHERE id = 'decision-1'";
      db.prepare(sql).run(JSON.stringify(resolved));
    });
    expect(log.verifyProjections()).toMatchObject({
      match: false,
      guarded: false,
      rebuiltDigest: digest,
      differingIds: ["decision-1"],
    });
    expect(log.rebuildProjections()).toBe(digest);

    rawExec("DELETE FROM objects WHERE id = 'task-1'", true);
    let check = log.verifyProjections();
    expect(check).toMatchObject({ match: false, guarded: true });
    expect([check.differingIds, check.rebuiltDigest]).toEqual([
      ["task-1"],
      digest,
    ]);
    expect(log.rebuildProjections()).toBe(digest);

    const extra = { ...log.object("task-1"), id: "task-9", createdSeq: 9 };
    raw((db) => {
      const sql = "INSERT INTO objects VALUES ('task-9', 'task', 0, 9, 9, ?)";
      db.prepare(sql).run(JSON.stringify(extra));
    }, true);
    check = log.verifyProjections();
    expect(check).toMatchObject({ match: false, differingIds: ["task-9"] });
    expect(check.storedDigest).not.toBe(digest);
  });

  it("finds a stale projection: a valid event inserted raw", () => {
    seed();
    expect(log.verifyProjections().match).toBe(true);
    rawEvent("task.created", JSON.stringify(task("task-2")));
    // Every read accepts the row, but no projection row was written for it.
    expect(log.events().at(-1)?.type).toBe("task.created");
    expect(log.object("task-2")).toBeUndefined();
    const check = log.verifyProjections();
    expect(check).toMatchObject({ match: false, guarded: true });
    expect(check.differingIds).toEqual(["task-2"]);
    expect(check.storedDigest).not.toBe(check.rebuiltDigest);
  });

  it("finds a dropped trigger or table; rebuild restores them and the digest", () => {
    seed();
    for (let i = 10; i < 30; i += 1)
      append("task.created", task("task-" + String(i)));
    const digest = log.verifyProjections().rebuiltDigest;
    rawExec("DROP TRIGGER objects_guard_delete");
    expect(log.verifyProjections()).toMatchObject({
      match: false,
      guarded: false,
      storedDigest: digest,
      differingIds: [],
    });
    rawExec("DROP TABLE objects");
    const ids = [
      ...IDS,
      ...Array.from({ length: 20 }, (_, i) => "task-" + String(i + 10)),
    ];
    expect(log.verifyProjections()).toEqual({
      match: false,
      guarded: false,
      storedDigest: null,
      rebuiltDigest: digest,
      differingIds: ids.sort().slice(0, 20),
    });
    expect(log.rebuildProjections()).toBe(digest);
    expect(log.verifyProjections()).toMatchObject({
      match: true,
      guarded: true,
    });
    expect(log.object("decision-1")).toMatchObject({ status: "pending" });
    expect(() => {
      rawExec("DELETE FROM objects");
    }).toThrow(/no such function/);
  });

  it("refuses to rebuild or verify over a forged row and changes nothing", () => {
    seed();
    const digest = log.verifyProjections().rebuiltDigest;
    const seq = rawEvent("decision.owner.resolve", "{}");
    const forged = "corrupt event at seq " + String(seq);
    expect(() => log.rebuildProjections()).toThrow(forged);
    expect(() => log.verifyProjections()).toThrow(forged);
    const rows = raw((db) =>
      db.prepare("SELECT COUNT(*) AS n FROM objects").get(),
    );
    expect(rows?.["n"]).toBe(4);
    const kept = new Map(IDS.map((id) => [id, log.object(id)]));
    expect(projectionDigest(kept)).toBe(digest);
  });

  it("accepts a scope in UTF-16 order, which SQL text order reverses", () => {
    const scope = ["src/\u{1F600}.ts", "src/\uFF61.ts"];
    const reversed = [...scope].reverse();
    expect(() => {
      append("task.created", { ...task(), scope: reversed });
    }).toThrow("scope is not sorted and unique");
    const sqlOrder = raw((db) =>
      db
        .prepare("SELECT value FROM json_each(?) ORDER BY value")
        .all(JSON.stringify(scope))
        .map((row) => row["value"]),
    );
    expect(sqlOrder).toEqual(reversed);
    append("task.created", task("task-1", scope));
    expect(log.object("task-1")).toMatchObject({ scope });
    const check = log.verifyProjections();
    expect(check.match).toBe(true);
    expect(log.rebuildProjections()).toBe(check.rebuiltDigest);
  });
});

describe("inspect and rebuild through the real CLI (B5-3b)", () => {
  /** Control, format (bidi included) and separator characters. */
  const UNSAFE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
  const lines = (stdout: string) =>
    stdout
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  const shape = (path = file) =>
    raw(
      (db) => {
        const version = db.prepare("PRAGMA user_version").get()?.[
          "user_version"
        ];
        const sql =
          "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name";
        const tables = db
          .prepare(sql)
          .all()
          .map((row) => row["name"]);
        return { version, tables };
      },
      false,
      path,
    );

  it("inspect prints escaped raw rows of a log whose reads throw, and writes nothing", () => {
    seed();
    const forged = rawEvent(
      "decision.owner.resolve",
      '{"note":"\u202Egnp.exe"}',
    );
    const hostile = rawEvent("test.happened", "{}", "2026\u001b[2J");
    expect(() => log.events()).toThrow(
      "corrupt event at seq " + String(forged),
    );
    log.close();
    const before = [readFileSync(file), statSync(file).mtimeMs, shape()];

    const shown = cli("inspect", "--state-dir", dir);
    expect(shown.status, shown.stderr).toBe(0);
    for (const line of shown.stdout.split("\n")) {
      expect(line).not.toMatch(UNSAFE);
    }
    expect(shown.stdout).toContain("\\u202e");
    expect(shown.stdout).toContain("\\u001b");
    const rows = lines(shown.stdout);
    expect(rows.map((row) => row["seq"])).toEqual([
      0,
      1,
      2,
      3,
      forged,
      hostile,
    ]);
    expect(rows.slice(0, 4).map((row) => row["refused"])).toEqual([
      null,
      null,
      null,
      null,
    ]);
    expect(rows[forged]).toMatchObject({
      type: "decision.owner.resolve",
      runId: RUN,
      payload: '{"note":"\u202Egnp.exe"}',
    });
    expect(rows[forged]?.["refused"]).toMatch(/seq 4: .*refused until SIG/);
    expect(rows[hostile]).toMatchObject({ at: "2026\u001b[2J" });
    expect(rows[hostile]?.["refused"]).toMatch(
      /corrupt event at seq 5: .*\/at/,
    );

    const page = cli(
      "inspect",
      "--state-dir",
      dir,
      "--from-seq",
      "1",
      "--limit",
      "2",
    );
    expect(page.status, page.stderr).toBe(0);
    expect(lines(page.stdout).map((row) => row["seq"])).toEqual([1, 2]);
    expect(page.stderr).toContain("more rows from seq 3");
    expect([readFileSync(file), statSync(file).mtimeMs, shape()]).toEqual(
      before,
    );
    log = openSessionLog(file);
  });

  it("inspect reads a v2 file without migrating it; rebuild migrates it", () => {
    const v2 = join(dir, "v2", "session.sqlite");
    mkdirSync(join(dir, "v2"));
    raw(
      (db) => {
        // The v2 events columns; projection.test.ts has the full frozen v2 DDL.
        db.exec(
          "CREATE TABLE events (seq INTEGER PRIMARY KEY, schema_version INTEGER NOT NULL, event_id TEXT NOT NULL, graph_id TEXT NOT NULL, run_id TEXT NOT NULL, node_id TEXT NOT NULL, type TEXT NOT NULL, at TEXT NOT NULL, payload TEXT NOT NULL) STRICT; PRAGMA user_version = 2;",
        );
        const sql =
          "INSERT INTO events VALUES (0, 1, 'evt-v2', 'graph-1', ?, 'node-1', 'task.created', ?, ?)";
        db.prepare(sql).run(RUN, AT, JSON.stringify(task()));
      },
      false,
      v2,
    );
    const before = [readFileSync(v2), shape(v2)];
    const shown = cli("inspect", "--state-dir", join(dir, "v2"));
    expect(shown.status, shown.stderr).toBe(0);
    expect(lines(shown.stdout)).toEqual([
      expect.objectContaining({ seq: 0, type: "task.created", refused: null }),
    ]);
    expect([readFileSync(v2), shape(v2)]).toEqual(before);
    expect(before[1]).toEqual({ version: 2, tables: ["events"] });

    const rebuilt = cli("rebuild", "--state-dir", join(dir, "v2"));
    expect(rebuilt.status, rebuilt.stderr).toBe(0);
    expect(shape(v2)).toEqual({ version: 3, tables: ["events", "objects"] });
  });

  it("rebuild restores a dropped table, and refuses a log with a forged row", () => {
    seed();
    const digest = log.verifyProjections().rebuiltDigest;
    rawExec("DROP TABLE objects");
    const rebuilt = cli("rebuild", "--state-dir", dir);
    expect(rebuilt.status, rebuilt.stderr).toBe(0);
    expect(lines(rebuilt.stdout)).toEqual([{ rebuilt: true, digest }]);
    expect(log.verifyProjections()).toMatchObject({
      match: true,
      guarded: true,
    });

    const seq = rawEvent("decision.owner.resolve", "{}");
    const refused = cli("rebuild", "--state-dir", dir);
    expect(refused.status).toBe(1);
    expect(refused.stdout).toBe("");
    expect(refused.stderr).toMatch(
      /^helmwright: rebuild refused \(see inspect; until SIG/,
    );
    expect(refused.stderr).toContain("corrupt event at seq " + String(seq));
    expect(shape().tables).toEqual(["events", "objects"]);
  });

  it("refuses bad inspect options and a missing log", () => {
    for (const args of [
      ["inspect", "--limit", "0"],
      ["inspect", "--limit", "1001"],
      ["inspect", "--from-seq", "-1"],
      ["rebuild", "--limit", "5"],
    ]) {
      const result = cli(...args, "--state-dir", dir);
      expect(result.status, args.join(" ")).toBe(64);
    }
    const missing = cli("inspect", "--state-dir", join(dir, "none"));
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("no session log at");
  });
});
