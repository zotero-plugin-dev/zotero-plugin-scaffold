import type { AddressInfo } from "node:net";
/**
 * HTTP bridge between the vitest server (pool worker) and the Zotero test
 * window. Message framing:
 *   page → host: POST /post   (flatted-serialized message, raw body)
 *   host → page: GET  /poll   (JSON array of flatted strings, drained queue)
 *   page → host: POST /ready  (handshake: page is polling)
 *   page → host: POST /debug  (page logs)
 */
import http from "node:http";
import * as flatted from "flatted";
import { logger } from "../../../utils/logger.js";
import { findFreeTcpPort } from "../../../utils/zotero/remote-zotero.js";

export class HttpBridge {
  private server?: http.Server;
  private readonly downlink: string[] = [];
  private readyResolve?: () => void;
  private readonly readyPromise = new Promise<void>((resolve) => {
    this.readyResolve = resolve;
  });

  constructor(private readonly onMessage: (message: unknown) => void) {}

  get port(): number {
    return (this.server?.address() as AddressInfo).port;
  }

  async start(): Promise<void> {
    const port = await findFreeTcpPort();
    this.server = http.createServer(this.handleRequest.bind(this));
    await new Promise<void>(resolve => this.server!.listen(port, resolve));
  }

  /** Waits until the test window has loaded and started polling. */
  async waitReady(timeoutMs = 120_000): Promise<void> {
    await Promise.race([
      this.readyPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for the Zotero test window")), timeoutMs)),
    ]);
  }

  /** Queues a message for the page (flatted-serialized). */
  send(message: unknown): void {
    this.downlink.push(flatted.stringify(message));
  }

  stop(): void {
    this.server?.closeAllConnections?.();
    this.server?.close();
    this.server = undefined;
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (req.method === "POST" && req.url === "/post") {
      let body = "";
      req.on("data", chunk => (body += chunk));
      req.on("end", () => {
        try {
          const message = flatted.parse(body);
          this.onMessage(message);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end("{}");
        }
        catch (e) {
          logger.error(`[zotero-pool] /post parse error: ${e}`);
          res.writeHead(400);
          res.end(String(e));
        }
      });
    }
    else if (req.method === "POST" && req.url === "/debug") {
      let body = "";
      req.on("data", chunk => (body += chunk));
      req.on("end", () => {
        try {
          const { message } = JSON.parse(body) as { message?: string };
          if (message) {
            // page errors are the only signal when the test window fails to
            // come up — surface them at warn level; everything else is debug
            const text = String(message);
            if (text.includes("[page-error]") || text.includes("[page-unhandledrejection]")) {
              logger.warn(text);
            }
            else {
              logger.debug(text);
            }
          }
        }
        catch {
          // ignore malformed debug messages
        }
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
}
