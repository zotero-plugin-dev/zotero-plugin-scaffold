import type { PoolOptions, PoolWorker, WorkerRequest } from "vitest/node";
import type { ZoteroPoolOptions } from "./options.js";
/**
 * Pool worker: owns the HTTP bridge, the bundling step and the Zotero
 * process lifecycle. Implements vitest's `PoolWorker` interface.
 */
import { join, resolve } from "node:path";
import process from "node:process";
import { delay } from "es-toolkit";
import * as flatted from "flatted";
import { logger } from "../../../utils/logger.js";
import { ZoteroRunner } from "../../../utils/zotero-runner.js";
import { buildTesterPlugin } from "../bundler.js";
import { HttpBridge } from "./http-bridge.js";
import { resolveOptions } from "./options.js";

// Workers that are currently running (between start() and stop()). Used to
// reject two zotero projects booting a Zotero against the same resources.
const activeWorkers = new Set<ZoteroPoolWorker>();

export interface WorkerResources {
  profileDir: string;
  dataDir: string;
}

export function findResourceConflict(
  active: ReadonlySet<{ resources: WorkerResources }>,
  resources: WorkerResources,
): WorkerResources | undefined {
  return [...active].find(w => w.resources.profileDir === resources.profileDir && w.resources.dataDir === resources.dataDir)?.resources;
}

export class ZoteroPoolWorker implements PoolWorker {
  readonly name = "zotero";
  private readonly poolOptions: PoolOptions;
  private readonly options: ReturnType<typeof resolveOptions>;
  private readonly listeners = new Map<string, Set<(arg: any) => void>>();
  private bridge?: HttpBridge;
  private zotero?: ZoteroRunner;

  /** Manifest of the latest bundle (source path → artifact), re-baked per build. */
  private testerManifest: Record<string, string> = {};
  private buildStamp = 0;
  private hasRun = false;
  /** Messages queued while a watch rebuild is in flight. */
  private readonly sendQueue: WorkerRequest[] = [];
  private draining = false;

  /** Resolved resource dirs — two workers sharing them must not run in parallel. */
  get resources(): WorkerResources {
    return {
      profileDir: resolve(this.options.profileDir),
      dataDir: resolve(this.options.dataDir),
    };
  }

  /** Derived from the project name; keeps per-project resources apart. */
  private readonly projectSuffix: string;

  constructor(options: PoolOptions, poolOptions: ZoteroPoolOptions = {}) {
    this.poolOptions = options;
    this.options = resolveOptions(poolOptions, options.project.config.name);
    this.projectSuffix = options.project.config.name ? `-${options.project.config.name}` : "";
    const { isolate, fileParallelism } = options.project.config as any;
    if (isolate) {
      throw new Error(
        "[zotero-pool] test.isolate must be false: every file runs in the same "
        + "Zotero instance, one after another. Add `isolate: false` to the "
        + "project's test config (vitest's default is true).",
      );
    }
    if (fileParallelism !== false) {
      throw new Error(
        "[zotero-pool] test.fileParallelism must be false: files are scheduled "
        + "serially so a single Zotero instance is reused (canReuse). Add "
        + "`fileParallelism: false` to the project's test config.",
      );
    }
  }

  /**
   * Reuses this worker (and thus the running Zotero instance) for subsequent
   * test files. With `isolate: false`, vitest schedules files serially and
   * hands the next task to the idle runner instead of spawning a new one.
   */
  canReuse(task: any): boolean {
    return task.worker === this.name;
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
    this.sendQueue.push(message);
    void this.drain();
  }

  /**
   * Forwards queued messages in order. In watch mode, run/collect requests
   * that carry changed files (`context.invalidates`) trigger a rebundle with
   * a fresh stamp: the page then imports new artifact URLs instead of the
   * cached modules, so a rerun executes the updated test code.
   */
  private async drain(): Promise<void> {
    if (this.draining) {
      return;
    }
    this.draining = true;
    try {
      while (this.sendQueue.length > 0) {
        const message = this.sendQueue.shift()!;
        await this.maybeRebuild(message);
        this.bridge?.send(message);
      }
    }
    finally {
      this.draining = false;
    }
  }

  private async maybeRebuild(message: WorkerRequest): Promise<void> {
    if (message.type !== "run" && message.type !== "collect") {
      return;
    }
    const context = message.context as any;
    const invalidates = context?.invalidates;
    const watch = (this.poolOptions.project.config as any).watch === true;
    // The first run/collect of a freshly started worker carries the stale
    // invalidates that caused the restart — start() already bundled the
    // current contents, so only rebuild for later requests (a worker that
    // survives across watch runs).
    if (watch && this.hasRun && Array.isArray(invalidates) && invalidates.length > 0) {
      this.buildStamp += 1;
      await this.buildBundle(this.buildStamp.toString(36));
    }
    this.hasRun = true;
    // Always hand the current manifest to the page: after a rebuild it
    // differs from the one baked into setup.js.
    context.testerManifest = this.testerManifest;
  }

  deserialize(data: unknown): unknown {
    return typeof data === "string" ? flatted.parse(data) : data;
  }

  async start(): Promise<void> {
    const conflict = findResourceConflict(activeWorkers, this.resources);
    if (conflict) {
      throw new Error(
        "[zotero-pool] Another zotero project is already running against the "
        + `same profile/data dir (${conflict.profileDir}). Run projects one at a `
        + "time with `vitest --project=<name>`, or give each zotero project its "
        + "own profileDir/dataDir in zoteroPool().",
      );
    }
    activeWorkers.add(this);

    // Boot Zotero with retries: after a force kill (e.g. a previous watch
    // rerun) the profile lock may not be released yet and the test window
    // never comes up. Each attempt gets a fresh bridge/bundle/Zotero; the
    // total budget stays under vitest's WORKER_START_TIMEOUT (90s).
    const testerDir = join(process.cwd(), ".scaffold", "tester", this.projectSuffix);
    const maxAttempts = 3;
    for (let attempt = 1; ; attempt++) {
      try {
        await this.bootZotero(testerDir);
        return;
      }
      catch (error) {
        this.zotero?.exit();
        this.zotero = undefined;
        this.bridge?.stop();
        this.bridge = undefined;
        if (attempt >= maxAttempts) {
          throw error;
        }
        logger.warn(
          `[zotero-pool] test window did not come up (attempt ${attempt}/${maxAttempts}), retrying`,
        );
        await delay(2000);
      }
    }
  }

  /** One launch attempt: HTTP bridge → bundle → Zotero → wait for the page. */
  private async bootZotero(testerDir: string): Promise<void> {
    // 1. HTTP bridge
    const bridge = new HttpBridge(message => this.emit("message", message));
    await bridge.start();
    this.bridge = bridge;
    logger.debug(`[zotero-pool] HTTP bridge on http://127.0.0.1:${bridge.port}`);

    // 2. bundle the tester plugin (page runtime + test files); per-project
    //    dir so parallel projects never overwrite each other's bridge port
    await this.buildBundle(undefined, testerDir);

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
    logger.debug("[zotero-pool] ZoteroRunner.run() starting...");
    await this.zotero.run();
    logger.debug("[zotero-pool] ZoteroRunner.run() done");

    // 4. wait for the test window (Zotero cold start takes 15-30s; vitest's
    //    START_TIMEOUT would fire first, hence the handshake)
    await bridge.waitReady(25_000);
  }

  /**
   * Bundles the tester plugin (runtime chunk + page + test files + manifest).
   * Pass a stamp on watch rebuilds to cache-bust the test artifact URLs.
   */
  private async buildBundle(stamp?: string, testerDir = join(process.cwd(), ".scaffold", "tester", this.projectSuffix)): Promise<void> {
    this.testerManifest = await buildTesterPlugin({
      outDir: testerDir,
      port: this.bridge?.port ?? 0,
      testDir: process.cwd(),
      testFiles: this.poolOptions.project.config.include,
      stamp,
    });
  }

  async stop(): Promise<void> {
    activeWorkers.delete(this);
    this.zotero?.exit();
    this.zotero = undefined;
    this.bridge?.stop();
    this.bridge = undefined;
  }
}
