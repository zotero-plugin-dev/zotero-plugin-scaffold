/**
 * Minimal custom pool prototype.
 *
 * Simulates a "Zotero test session": each test file is executed in a forked
 * child process (standing in for the Zotero page) that hosts vitest's official
 * worker runtime (`init()` from `vitest/worker`). The IPC channel between the
 * vitest server and the child process stands in for the future HTTP/WS bridge
 * to a real Zotero instance.
 */
import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { PoolOptions, PoolRunnerInitializer, PoolWorker, WorkerRequest } from "vitest/node";

export function zoteroPool(): PoolRunnerInitializer {
  return {
    name: "zotero-pool",
    createPoolWorker: (options) => new ZoteroPoolWorker(options),
  };
}

class ZoteroPoolWorker implements PoolWorker {
  readonly name = "zotero-pool";
  private child?: ChildProcess;

  constructor(private readonly options: PoolOptions) {}

  on(event: string, callback: (arg: any) => void): void {
    this.child?.on(event, callback);
  }

  off(event: string, callback: (arg: any) => void): void {
    this.child?.off(event, callback);
  }

  send(message: WorkerRequest): void {
    this.child?.send(message);
  }

  deserialize(data: unknown): unknown {
    return data;
  }

  async start(): Promise<void> {
    // Simulates launching Zotero with the tester plugin preloaded.
    const entry = fileURLToPath(new URL("./worker-page.js", import.meta.url));
    this.child = fork(entry, [], {
      serialization: "advanced",
      stdio: "pipe",
    });
    this.child.stdout?.pipe(process.stdout);
    this.child.stderr?.pipe(process.stderr);
  }

  async stop(): Promise<void> {
    this.child?.kill();
    this.child = undefined;
  }
}
