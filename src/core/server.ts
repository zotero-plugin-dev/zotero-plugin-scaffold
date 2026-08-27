import type { Context } from "../types/index.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { watch } from "../utils/watcher.js";
import { ZoteroRunner } from "../utils/zotero-runner.js";
import { Base } from "./base.js";
import Build from "./builder/index.js";

/**
 * Resolve Zotero debug-related launch arguments, de-duplicated against
 * arguments already written in `startArgs`:
 *
 * - `debugOutputWindow` appends `-ZoteroDebug` (opens the Debug Output window,
 *   `forceDebugLog = 2`);
 * - `-ZoteroDebugText` (`forceDebugLog = 1`) is always appended so that
 *   `Zotero.debug()` / `dump()` output goes to stdout, where the runner
 *   captures it into the log file.
 *
 * @see docs/src/design/zotero-output-debug-config.md §5
 */
export function resolveDebugArgs(
  startArgs: string[],
  debugOutputWindow: boolean,
): string[] {
  const args = [...startArgs];
  if (debugOutputWindow && !args.includes("-ZoteroDebug"))
    args.push("-ZoteroDebug");
  if (!args.includes("-ZoteroDebugText"))
    args.push("-ZoteroDebugText");
  return args;
}

export default class Serve extends Base {
  private builder: Build;
  private runner?: ZoteroRunner;

  private _zoteroBinPath?: string;

  constructor(ctx: Context) {
    super(ctx);
    process.env.NODE_ENV ??= "development";
    this.builder = new Build(ctx);
  }

  async run(): Promise<void> {
    const {
      devtools,
      debugOutputWindow,
      zoteroLog,
      logDir,
      logRetentionDays,
      startArgs,
      prefs,
      createProfileIfMissing,
      asProxy,
      prebuild,
    } = this.ctx.server;

    this.runner = new ZoteroRunner({
      binary: {
        path: this.zoteroBinPath,
        devtools,
        args: resolveDebugArgs(startArgs, debugOutputWindow),
        log: zoteroLog
          ? { dir: logDir, retentionDays: logRetentionDays }
          : false,
      },
      profile: {
        path: this.profilePath,
        dataDir: this.dataDir,
        // keepChanges: this.ctx.server.keepProfileChanges,
        createIfMissing: createProfileIfMissing,
        customPrefs: prefs,
      },
      plugins: {
        list: [{
          id: this.ctx.id,
          sourceDir: join(this.ctx.dist, "addon"),
        }],
        asProxy,
      },
    });

    await this.ctx.hooks.callHook("serve:init", this.ctx);

    // prebuild
    if (prebuild) {
      await this.builder.run();
      await this.ctx.hooks.callHook("serve:prebuild", this.ctx);
    }

    // start Zotero
    await this.runner.run();
    this.runner.zotero?.on("exit", this.onZoteroExit);
    this.runner.zotero?.on("close", this.onZoteroExit);

    // watch
    await this.watch();
  }

  /**
   * watch source dir and build when file changed
   */
  async watch(): Promise<void> {
    const { source, watchIgnore } = this.ctx;

    watch(
      source,
      watchIgnore,
      {
        onReady: async () => {
          await this.ctx.hooks.callHook("serve:ready", this.ctx);
        },
        onChange: async (path) => {
          await this.ctx.hooks.callHook("serve:onChanged", this.ctx, path);

          if (path.endsWith(".ts") || path.endsWith(".tsx")) {
            await this.builder.bundle();
          }
          else {
            await this.builder.run();
          }

          await this.reload();
        },
      },
    );
  }

  async reload(): Promise<void> {
    this.logger.tip("Reloading...");
    await this.runner?.reloadAllPlugins();
    await this.ctx.hooks.callHook("serve:onReloaded", this.ctx);
  }

  // Use arrow functions to keep `this`
  exit = (): never => {
    this.logger.info("Server shutdown by user request.");
    this.runner?.exit();
    this.ctx.hooks.callHook("serve:exit", this.ctx);
    process.exit();
  };

  private onZoteroExit = (_code?: number | null, _signal?: any) => {
    this.logger.info(`Zotero terminated.`);
    process.exit();
  };

  get zoteroBinPath(): string {
    if (this._zoteroBinPath)
      return this._zoteroBinPath;

    this._zoteroBinPath = process.env.ZOTERO_PLUGIN_ZOTERO_BIN_PATH;
    if (!this._zoteroBinPath || !existsSync(this._zoteroBinPath))
      throw new Error("The Zotero binary not found.");

    return this._zoteroBinPath;
  }

  get profilePath(): string | undefined {
    return process.env.ZOTERO_PLUGIN_PROFILE_PATH;
  }

  get dataDir(): string | undefined {
    return process.env.ZOTERO_PLUGIN_DATA_DIR;
  }
}
