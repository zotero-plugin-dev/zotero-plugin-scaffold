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
import { isZoteroRunningByProfile, killZoteroByProfile, ZoteroRunner } from "../../../utils/zotero-runner.js";
import { buildTesterPlugin } from "../bundler.js";
import { HttpBridge } from "./http-bridge.js";
import { resolveOptions } from "./options.js";

// Workers that are currently running (between start() and stop()). Used to
// reject two zotero projects booting a Zotero against the same resources.
const activeWorkers = new Set<ZoteroPoolWorker>();

/** A soft-stopped (watch mode) instance, kept alive for the next rerun. */
interface LiveInstance {
  zotero: ZoteroRunner;
  bridge: HttpBridge;
}

// Watch mode: vitest stops the pool worker after every run, but the Zotero
// instance and its test window can survive. Keyed by resolved profile dir;
// the next worker of the same project takes the instance over instead of
// cold-booting Zotero (~30s) again.
const liveInstances = new Map<string, LiveInstance>();

let exitCleanupRegistered = false;
function registerExitCleanup(): void {
  if (exitCleanupRegistered) {
    return;
  }
  exitCleanupRegistered = true;
  process.once("exit", () => {
    for (const { zotero } of liveInstances.values()) {
      zotero.exit();
    }
    liveInstances.clear();
  });
}

// Module-level so stamps stay unique across watch-rerun workers: every
// takeover rebuilds with a fresh stamp and the page must import a URL it has
// never loaded before (otherwise the module cache returns the old code).
let buildStampCounter = 0;

// buildTesterPlugin writes a shared .tmp-page dir inside outDir; serialize
// builds per outDir so a takeover rebuild can never race another one.
const bundleChains = new Map<string, Promise<void>>();

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

  /**
   * Watch mode lives on the global vitest config (project.config.watch is
   * undefined); check both so soft-stop/takeover also work with CLI flags
   * like --watch that never reach the project config.
   */
  private isWatchMode(): boolean {
    return (this.poolOptions.project.vitest?.config as any)?.watch === true
      || (this.poolOptions.project.config as any).watch === true;
  }

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
    // A "stopped" reply means vitest is tearing this worker down (its stop()
    // call follows after the page handshake) — soft-stop immediately so the
    // next watch-rerun worker can take the instance over before a cold boot
    // could mistake it for a leftover and kill it.
    if (event === "message" && arg?.type === "stopped" && arg.__vitest_worker_response__ && this.isWatchMode()) {
      this.softStop();
    }
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
    const watch = this.isWatchMode();
    // The first run/collect of a freshly started worker carries the stale
    // invalidates that caused the restart — start() already bundled the
    // current contents, so only rebuild for later requests (a worker that
    // survives across watch runs).
    if (watch && this.hasRun && Array.isArray(invalidates) && invalidates.length > 0) {
      buildStampCounter += 1;
      await this.buildBundle(buildStampCounter.toString(36), undefined, "tests-only");
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

    // Watch rerun: take over the soft-stopped Zotero instance (if its
    // process is still alive) instead of cold-booting another one. The page
    // keeps polling the same bridge; the fresh bundle (new stamp) plus the
    // per-run context manifest makes it import the updated test code.
    const profileKey = resolve(this.options.profileDir);
    const live = liveInstances.get(profileKey);
    if (live && live.bridge.isPageAlive(2000)) {
      liveInstances.delete(profileKey);
      this.zotero = live.zotero;
      this.bridge = live.bridge;
      this.bridge.setHandler(message => this.emit("message", message));
      buildStampCounter += 1;
      await this.buildBundle(buildStampCounter.toString(36), undefined, "tests-only");
      logger.debug(`[zotero-pool] reusing live Zotero instance (${profileKey})`);
      return;
    }
    // The recorded instance died while soft-stopped — drop it and boot fresh.
    if (live) {
      liveInstances.delete(profileKey);
      live.bridge.stop();
    }
    // A cold boot must not race a leftover instance on the same profile
    // (soft-stop takeover failed, or a force-killed session left a zombie):
    // kill it and give the lock a moment to be released.
    if (isZoteroRunningByProfile(profileKey)) {
      killZoteroByProfile(profileKey);
      await delay(1500);
    }

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
  private async buildBundle(
    stamp?: string,
    testerDir = join(process.cwd(), ".scaffold", "tester", this.projectSuffix),
    mode: "full" | "tests-only" = "full",
  ): Promise<void> {
    const key = resolve(testerDir);
    const chain = (bundleChains.get(key) ?? Promise.resolve()).then(async () => {
      this.testerManifest = await buildTesterPlugin({
        outDir: testerDir,
        port: this.bridge?.port ?? 0,
        testDir: process.cwd(),
        testFiles: this.poolOptions.project.config.include,
        stamp,
        mode,
      });
    });
    bundleChains.set(key, chain.catch(() => {}));
    await chain;
  }

  async stop(): Promise<void> {
    activeWorkers.delete(this);
    if (this.isWatchMode()) {
      this.softStop();
      return;
    }
    this.zotero?.exit();
    this.zotero = undefined;
    this.bridge?.stop();
    this.bridge = undefined;
  }

  /**
   * Keeps the Zotero instance and its test window alive for the next watch
   * rerun. Idempotent: called both from the "stopped" reply (early, before
   * vitest's worker.stop()) and from stop() itself.
   */
  private softStop(): void {
    if (!this.zotero || !this.bridge) {
      return;
    }
    const profileKey = resolve(this.options.profileDir);
    liveInstances.set(profileKey, { zotero: this.zotero, bridge: this.bridge });
    registerExitCleanup();
    this.zotero = undefined;
    this.bridge = undefined;
    logger.debug(`[zotero-pool] watch mode: keeping Zotero alive for the next rerun`);
  }
}
