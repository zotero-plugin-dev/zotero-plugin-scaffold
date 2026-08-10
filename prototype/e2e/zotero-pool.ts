/**
 * Custom vitest pool that runs tests inside a real Zotero instance (e2e
 * prototype). The pool worker owns:
 *   1. a bundling step (rolldown → tester plugin with the vitest runtime)
 *   2. an HTTP bridge to the Zotero test window (POST /post, GET /poll)
 *   3. the Zotero process lifecycle
 */
import http from "node:http";
import { execSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { findFreeTcpPort } from "../../src/utils/zotero/remote-zotero.js";
import type { PoolOptions, PoolRunnerInitializer, PoolWorker, WorkerRequest } from "vitest/node";
import { createRequire } from "node:module";
import { buildPlugin, resolveFlatted } from "./bundler.js";
import { launchZotero } from "./zotero-launcher.js";

const ROOT = fileURLToPath(new URL(".", import.meta.url));

export function zoteroPool(): PoolRunnerInitializer {
  return {
    name: "zotero",
    createPoolWorker: (options) => new ZoteroPoolWorker(options),
  };
}

const flatted = createRequire(import.meta.url)(resolveFlatted().cjs) as {
  stringify(value: unknown, replacer?: (key: string, value: unknown) => unknown): string;
  parse(text: string): unknown;
};

class ZoteroPoolWorker implements PoolWorker {
  readonly name = "zotero";
  private server?: http.Server;
  private port = 0;
  private downlink: string[] = [];
  private listeners = new Map<string, Set<(arg: any) => void>>();
  private zotero?: ChildProcess;
  private readyResolve?: () => void;
  private ready = new Promise<void>((resolve) => {
    this.readyResolve = resolve;
  });
  private started = false;

  constructor(private readonly options: PoolOptions) {}

  on(event: string, callback: (arg: any) => void): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: (arg: any) => void): void {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, arg: any): void {
    for (const cb of this.listeners.get(event) ?? []) {
      try {
        cb(arg);
      }
      catch (e) {
        console.error(`[zotero-pool] listener error on "${event}":`, e);
      }
    }
  }

  send(message: WorkerRequest): void {
    this.downlink.push(flatted.stringify(message));
  }

  deserialize(data: unknown): unknown {
    return typeof data === "string" ? flatted.parse(data) : data;
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (req.method === "POST" && req.url === "/post") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const message = flatted.parse(body);
          const msgStr = JSON.stringify(message) ?? "";
          if (msgStr.includes("onCollected")) {
            const idx = msgStr.indexOf("onCollected");
            console.log(`[zotero-pool] /post: onCollected FULL=${msgStr}`);
          }
          else {
            console.log(`[zotero-pool] /post: ${msgStr.slice(0, 100)}`);
          }
          this.emit("message", message);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end("{}");
        }
        catch (e) {
          console.error(`[zotero-pool] /post parse error:`, e, `
body:`, body.slice(0, 200));
          res.writeHead(400);
          res.end(String(e));
        }
      });
    }
    else if (req.method === "POST" && req.url === "/debug") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const { message } = JSON.parse(body);
          process.stdout.write(`[zotero-page] ${message}`);
        }
        catch {}
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
      });
    }
    else if (req.method === "POST" && req.url === "/ready") {
      this.readyResolve?.();
      this.readyResolve = undefined;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");
    }
    else if (req.method === "GET" && req.url === "/poll") {
      const messages = this.downlink.splice(0);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(messages));
    }
    else {
      res.writeHead(404);
      res.end();
    }
  }

  async start(): Promise<void> {
    this.port = await findFreeTcpPort();
    await buildPlugin(this.port);

    this.server = http.createServer(this.handleRequest.bind(this));
    await new Promise<void>((resolve) => this.server!.listen(this.port, resolve));
    console.log(`[zotero-pool] HTTP bridge on http://127.0.0.1:${this.port}`);

    const binary = process.env.ZOTERO_PLUGIN_ZOTERO_BIN_PATH
      ?? process.env.ZOTERO_BIN;
    if (!binary) {
      throw new Error("ZOTERO_PLUGIN_ZOTERO_BIN_PATH is not set");
    }

    this.zotero = await launchZotero({
      binary,
      profileDir: join(ROOT, ".scaffold", "profile"),
      dataDir: join(ROOT, ".scaffold", "data"),
      pluginDir: join(ROOT, "out"),
      pluginId: "zotero-vitest-pool-e2e@prototype",
    });

    // Wait until the Zotero test window has loaded and starts polling,
    // so vitest's START_TIMEOUT is not hit during the Zotero cold start.
    await this.ready;
    this.started = true;
  }

  async stop(): Promise<void> {
    // Force-kill Zotero: SIGTERM leaves child processes behind on Windows,
    // which keeps the child stdio pipes open and stalls Vite's shutdown.
    try {
      execSync("taskkill /f /im zotero.exe", { stdio: "ignore" });
    }
    catch {
      // already exited
    }
    this.zotero = undefined;
    this.server?.closeAllConnections?.();
    this.server?.close();
    this.server = undefined;
    this.started = false;
  }
}
