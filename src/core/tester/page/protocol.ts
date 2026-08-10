import type { PageRpc } from "./rpc.js";
import type { WorkerStateLike } from "./state.js";
import type { HttpTransport } from "./transport.js";
import { serializeError } from "@vitest/utils/error";
/**
 * Worker protocol for the in-page test runner, mirroring vitest's official
 * `init()` from `vitest/worker` (message framing, not the node internals).
 *
 * Message flow:
 *   host → page: { __vitest_worker_request__: true, type: "start", ... } →
 *                page replies { type: "started", __vitest_worker_response__: true }
 *   host → page: { __vitest_worker_request__: true, type: "run"|"collect", context } →
 *                page runs and replies { type: "testfileFinished", error? }
 *   host → page: { __vitest_worker_request__: true, type: "stop" } →
 *                page replies { type: "stopped" }
 *   host → page: raw birpc messages (onCancel etc.) → forwarded to rpc callbacks
 *   page → host: raw birpc messages (onQueued/onCollected/onTaskUpdate) and
 *                the lifecycle replies above, all via the transport
 *
 * Imports of "flatted"/"@vitest/utils/error" are redirected to the runtime
 * chunk by the bundler, so the page and the test files share one instance of
 * every vitest module.
 */
import { parse as flattedParse, stringify as flattedStringify } from "flatted";
import { createPageRpc, errorReplacer } from "./rpc.js";
import { createWorkerState } from "./state.js";

export interface RunHandlers {
  /** Runs (or collects) the files from the given context. */
  runMethod: (context: any, isCollect: boolean, state: WorkerStateLike) => Promise<void>;
}

export class WorkerProtocol {
  private readonly state: WorkerStateLike;
  private readonly rpc: PageRpc;
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private polling = false;

  constructor(
    private transport: HttpTransport,
    private readonly handlers: RunHandlers,
    private readonly dump: (message: string) => void,
  ) {
    this.state = createWorkerState(null, null);
    this.rpc = createPageRpc(
      (message) => {
        // Raw birpc message: no __vitest_worker_response__ marker.
        this.post(message).catch(() => {});
      },
      this.state,
    );
    this.state.rpc = this.rpc.rpc;
  }

  get workerState(): WorkerStateLike {
    return this.state;
  }

  private async post(message: unknown): Promise<void> {
    try {
      // birpc messages arrive already flatted-serialized (rpc.ts's serialize
      // option); re-serializing a string would wrap it in an array
      // (flatted.stringify("…") → ["…"]). Pass strings through verbatim;
      // protocol messages (started/testfileFinished/…) are objects and need
      // serializing here.
      const body = typeof message === "string"
        ? message
        : flattedStringify(message, errorReplacer);
      await this.transport.post(body);
    }
    catch (e) {
      this.dump(`post error: ${e}\n`);
    }
  }

  /** Starts polling and performs the ready handshake. */
  start(): void {
    this.pollTimer = setInterval(() => this.poll(), 150);
    this.transport.ready().catch(e => this.dump(`ready error: ${e}\n`));
  }

  private async poll(): Promise<void> {
    if (this.polling) {
      return;
    }
    this.polling = true;
    try {
      const messages = await this.transport.poll();
      for (const raw of messages) {
        this.dispatch(raw);
      }
    }
    catch {
      // host not reachable yet (Zotero booting)
    }
    finally {
      this.polling = false;
    }
  }

  private dispatch(raw: string): void {
    let message: unknown;
    try {
      message = flattedParse(raw);
    }
    catch (e) {
      this.dump(`dispatch parse error: ${e}\n`);
      return;
    }
    if (message && typeof message === "object" && (message as any).__vitest_worker_request__ === true) {
      this.handleRequest(message as any).catch(e => this.dump(`request error: ${e}\n`));
    }
    else {
      for (const cb of this.rpc.onMessageCallbacks) {
        try {
          cb(message);
        }
        catch (e) {
          this.dump(`rpc callback error: ${e}\n`);
        }
      }
    }
  }

  private async handleRequest(message: any): Promise<void> {
    switch (message.type) {
      case "start": {
        this.state.ctx = message.context;
        this.state.config = message.context.config;
        this.dump("started\n");
        await this.post({ type: "started", __vitest_worker_response__: true });
        break;
      }
      case "run":
      case "collect": {
        const isCollect = message.type === "collect";
        this.state.ctx = { ...this.state.ctx, ...message.context };
        this.state.filepath = undefined;
        try {
          await this.handlers.runMethod(this.state.ctx, isCollect, this.state);
          await this.post({ type: "testfileFinished", __vitest_worker_response__: true });
        }
        catch (error) {
          await this.post({
            type: "testfileFinished",
            __vitest_worker_response__: true,
            error: serializeError(error),
          });
        }
        break;
      }
      case "stop": {
        this.dump("stopped\n");
        await this.post({ type: "stopped", __vitest_worker_response__: true });
        break;
      }
    }
  }
}
