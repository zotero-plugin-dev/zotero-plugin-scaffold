import type { PoolOptions, PoolWorker, WorkerRequest } from "vitest/node";
import type { ZoteroPoolOptions } from "./options.js";
/**
 * Pool worker: owns the HTTP bridge, the bundling step and the Zotero
 * process lifecycle. Implements vitest's `PoolWorker` interface.
 */
import { join, resolve } from "node:path";
import process from "node:process";
import * as flatted from "flatted";
import { ZoteroRunner } from "../../../utils/zotero-runner.js";
import { buildTesterPlugin } from "../bundler.js";
import { HttpBridge } from "./http-bridge.js";
import { resolveOptions } from "./options.js";

export class ZoteroPoolWorker implements PoolWorker {
  readonly name = "zotero";
  private readonly poolOptions: PoolOptions;
  private readonly options: ReturnType<typeof resolveOptions>;
  private readonly listeners = new Map<string, Set<(arg: any) => void>>();
  private bridge?: HttpBridge;
  private zotero?: ZoteroRunner;

  constructor(options: PoolOptions, poolOptions: ZoteroPoolOptions = {}) {
    this.poolOptions = options;
    this.options = resolveOptions(poolOptions);
  }

  on(event: string, callback: (arg: any) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
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
    this.bridge?.send(message);
  }

  deserialize(data: unknown): unknown {
    return typeof data === "string" ? flatted.parse(data) : data;
  }

  async start(): Promise<void> {
    // 1. HTTP bridge
    const bridge = new HttpBridge(message => this.emit("message", message));
    await bridge.start();
    this.bridge = bridge;
    process.stdout.write(`[zotero-pool] HTTP bridge on http://127.0.0.1:${bridge.port}\n`);

    // 2. bundle the tester plugin (page runtime + test files)
    const testerDir = join(process.cwd(), ".scaffold", "tester");
    await buildTesterPlugin({
      outDir: testerDir,
      port: bridge.port,
      testDir: process.cwd(),
      testFiles: this.poolOptions.project.config.include,
    });

    // 3. launch Zotero with the tester plugin as a proxy addon
    //    (RDP is not needed: proxy addons are installed via profile files)
    this.zotero = new ZoteroRunner({
      binary: {
        path: this.options.zoteroBin,
        args: this.options.args,
        devtools: false,
        // connectRDP defaults to !asProxy — proxy addons need no RDP
      },
      profile: {
        path: this.options.profileDir,
        dataDir: this.options.dataDir,
        createIfMissing: true,
        customPrefs: {
          // suppress the first-run connector install page
          "extensions.zotero.firstRun": false,
          "extensions.zotero.firstRun2": false,
          // proxy addons live in the PROFILE scope; ZoteroRunner's defaults
          // set enabledScopes=5 (APP|ADDON) which excludes it
          "extensions.enabledScopes": 15,
          ...this.options.extraPrefs,
        },
      },
      plugins: {
        asProxy: true,
        list: [
          { id: this.options.testerPluginId, sourceDir: testerDir },
          ...(this.options.pluginDir && this.options.pluginId
            ? [{ id: this.options.pluginId!, sourceDir: resolve(this.options.pluginDir) }]
            : []),
        ],
      },
    });
    process.stdout.write("[zotero-pool] ZoteroRunner.run() starting..." + "\n");
    await this.zotero.run();
    process.stdout.write("[zotero-pool] ZoteroRunner.run() done" + "\n");

    // 4. wait for the test window (Zotero cold start takes 15-30s; vitest's
    //    START_TIMEOUT would fire first, hence the handshake)
    await bridge.waitReady();
  }

  async stop(): Promise<void> {
    this.zotero?.exit();
    this.zotero = undefined;
    this.bridge?.stop();
    this.bridge = undefined;
  }
}
