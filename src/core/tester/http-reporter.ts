import type { ReportEvent } from "./protocol.js";
import http from "node:http";
import { styleText } from "node:util";
import { logger } from "../../utils/logger.js";
import { findFreeTcpPort } from "../../utils/zotero/remote-zotero.js";

export class TestHttpReporter {
  private _server?: http.Server;
  private _port?: number;
  public passed: number = 0;
  public failed: number = 0;

  constructor() { }

  async getPort(): Promise<void> {
    this._port = await findFreeTcpPort();
  }

  get port(): number {
    return this._port!;
  }

  async start(): Promise<this> {
    if (!this._port)
      await this.getPort();

    this._server = http.createServer(this.handleRequest.bind(this));
    this._server.listen(this._port, () => {
      logger.debug(`Server is listening on http://localhost:${this.port}`);
    });
    return this;
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Zotero Plugin Test Server is running");
    }
    else
      if (req.method === "POST" && req.url === "/update") {
        let body = "";

        // Collect data chunks
        req.on("data", (chunk) => {
          body += chunk;
        });

        // Parse and handle the complete data
        req.on("end", async () => {
          try {
            const jsonData = JSON.parse(body) as ReportEvent;
            await this.onData(jsonData);

            // Send a response to the client
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: "Results received successfully" }));
          }
          catch (error) {
            logger.error(`Error parsing JSON:, ${error}`);
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid JSON" }));
          }
        });
      }
      else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not Found" }));
      }
  }

  async onData(event: ReportEvent): Promise<void> {
    switch (event.type) {
      case "debug":
        logger.log(event.data);
        break;

      case "start":
        logger.newLine();
        break;

      case "suite":
        if (event.data.title)
          logger.tip(event.data.title, { space: event.data.indents - 1 });
        break;

      case "pass":
        logger.success(
          `${event.data.title} ${styleText("gray", `${event.data.duration ?? 0}ms`)}`,
          { space: event.data.indents - 1 },
        );
        break;

      case "fail": {
        const { data } = event;
        logger.fail(styleText("red", `${data.title}, ${data.error.message}`), { space: data.indents - 1 });

        const format = (value: unknown) => typeof value === "object"
          ? JSON.stringify(value, null, 2).replaceAll("\n", `\n${"  ".repeat(data.indents + 1)}`)
          : String(value);

        logger.log(`Expected: ${styleText("green", format(data.error.expected))}`, { space: data.indents + 0.5 });
        logger.log(`Received: ${styleText("red", format(data.error.actual))}`, { space: data.indents + 0.5 });
        break;
      }

      case "pending":
        logger.info(`${event.data.title} pending`, { space: event.data.indents - 1 });
        break;

      case "suite end":
        break;

      case "end":
        this.passed = event.data.passed;
        this.failed = event.data.failed;

        logger.newLine();
        if (this.failed === 0)
          logger.success(`Test run completed - ${this.passed} passed`);
        else
          logger.fail(`Test run completed - ${this.passed} passed, ${this.failed} failed`);
        break;

      case "error":
        logger.error(event.data.title);
        this.failed++;
        break;
    }
  }

  stop(): void {
    this._server?.close();
  }
}
