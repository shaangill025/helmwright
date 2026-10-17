import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
  type Server,
} from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach } from "vitest";
import { SpendLedger } from "../../../src/proxy/ledger.ts";
import { type ProxyLogEntry } from "../../../src/proxy/redact.ts";
import { startProxy, type RunningProxy } from "../../../src/proxy/server.ts";

/** Shared fakes for the proxy tests. No real key, no network beyond loopback. */
export const FAKE_KEY = "sk-ant-FAKE-not-a-real-key-0123456789";
export const TOKEN = "per-run-bearer-token-abcdef-0123456789";
export const MODEL = "claude-opus-5-5";
export const USD = 1_000_000;

export interface Seen {
  method: string | undefined;
  url: string | undefined;
  headers: IncomingHttpHeaders;
  body: string;
}

export interface FakeReply {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface Reply {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

export const usageReply = (input: number, output: number): FakeReply => ({
  status: 200,
  headers: { "content-type": "application/json", "set-cookie": "a=b" },
  body: JSON.stringify({
    id: "msg_1",
    usage: { input_tokens: input, output_tokens: output },
  }),
});

export const message = (maxTokens = 1000) =>
  JSON.stringify({
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: "hi" }],
  });

export interface StartOptions {
  runId?: string;
  totalCapUsd?: number;
  runCapUsd?: number;
  maxBodyBytes?: number;
  maxResponseBytes?: number;
  upstreamBaseUrl?: string;
  lockTimeoutMs?: number;
}

export interface CallOptions {
  method?: string;
  path?: string;
  headers?: Record<string, string>;
  body?: string;
  auth?: string | null;
}

/** A loopback URL whose port refuses connections. */
export async function closedPortUrl(): Promise<string> {
  const probe = createServer();
  await new Promise<void>((r) => probe.listen(0, "127.0.0.1", r));
  const port = (probe.address() as AddressInfo).port;
  await new Promise((r) => probe.close(r));
  return `http://127.0.0.1:${String(port)}`;
}

export interface Harness {
  dir: string;
  seen: Seen[];
  logs: ProxyLogEntry[];
  proxies: RunningProxy[];
  /** What the fake upstream answers next. */
  reply: FakeReply;
  /** Delay before the fake upstream answers. */
  delayMs: number;
  /** Make the fake upstream drop the socket instead of answering. */
  reset: boolean;
  upstreamUrl(): string;
  ledgerPath(): string;
  reopen(): SpendLedger;
  start(over?: StartOptions): Promise<RunningProxy>;
  call(proxy: RunningProxy, opts?: CallOptions): Promise<Reply>;
  /** Everything the logs and files under the temp dir contain, as text. */
  everything(): string;
}

/** Register hooks that give each test a fresh fake upstream, then return the harness. */
export function useHarness(): Harness {
  let upstream: Server;
  const h: Harness = {
    dir: "",
    seen: [],
    logs: [],
    proxies: [],
    reply: usageReply(100, 50),
    delayMs: 0,
    reset: false,
    upstreamUrl: () =>
      `http://127.0.0.1:${String((upstream.address() as AddressInfo).port)}`,
    ledgerPath: () => join(h.dir, "ledger", "spend.json"),
    reopen: () =>
      new SpendLedger({
        path: h.ledgerPath(),
        totalCapUsd: 25,
        runCapUsd: 2,
      }),
    async start(over = {}) {
      const proxy = await startProxy({
        token: TOKEN,
        apiKey: FAKE_KEY,
        upstreamBaseUrl: over.upstreamBaseUrl ?? h.upstreamUrl(),
        ...(over.maxResponseBytes === undefined
          ? {}
          : { maxResponseBytes: over.maxResponseBytes }),
        runId: over.runId ?? "run-1",
        ledger: new SpendLedger({
          path: h.ledgerPath(),
          totalCapUsd: over.totalCapUsd ?? 25,
          runCapUsd: over.runCapUsd ?? 2,
          ...(over.lockTimeoutMs === undefined
            ? {}
            : { lockTimeoutMs: over.lockTimeoutMs }),
        }),
        ...(over.maxBodyBytes === undefined
          ? {}
          : { maxBodyBytes: over.maxBodyBytes }),
        log: (e) => h.logs.push(e),
      });
      h.proxies.push(proxy);
      return proxy;
    },
    call(proxy, opts = {}) {
      const auth = opts.auth === undefined ? `Bearer ${TOKEN}` : opts.auth;
      return new Promise((resolve, reject) => {
        const req = httpRequest(
          {
            host: "127.0.0.1",
            port: proxy.port,
            method: opts.method ?? "POST",
            path: opts.path ?? "/v1/messages",
            headers: {
              "content-type": "application/json",
              ...(auth === null ? {} : { authorization: auth }),
              ...opts.headers,
            },
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on("data", (c: Buffer) => chunks.push(c));
            res.on("end", () => {
              resolve({
                status: res.statusCode ?? 0,
                headers: res.headers,
                body: Buffer.concat(chunks).toString("utf8"),
              });
            });
          },
        );
        req.on("error", reject);
        req.end(opts.body ?? message());
      });
    },
    everything() {
      const files = readdirSync(h.dir, { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => readFileSync(join(e.parentPath, e.name), "utf8"));
      return JSON.stringify(h.logs) + files.join("\n");
    },
  };

  beforeEach(async () => {
    h.dir = mkdtempSync(join(tmpdir(), "hw-proxy-"));
    h.seen = [];
    h.proxies = [];
    h.logs = [];
    h.reply = usageReply(100, 50);
    h.delayMs = 0;
    h.reset = false;
    upstream = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        h.seen.push({
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        });
        if (h.reset) {
          req.socket.destroy();
          return;
        }
        setTimeout(() => {
          res.writeHead(h.reply.status, h.reply.headers);
          res.end(h.reply.body);
        }, h.delayMs);
      });
    });
    await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", r));
  });

  afterEach(async () => {
    for (const p of h.proxies) await p.close();
    await new Promise((r) => upstream.close(r));
    rmSync(h.dir, { recursive: true, force: true });
  });

  return h;
}
