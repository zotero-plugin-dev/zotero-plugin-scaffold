import type { Context } from "../types/index.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { watch } from "../utils/watcher.js";
import { ZoteroRunner } from "../utils/zotero-runner.js";
import { Base } from "./base.js";
import Build from "./builder/index.js";

export default class Serve extends Base {
  private builder: Build;
  private runner?: ZoteroRunner;

  private _zoteroBinPath?: string;

  constructor(ctx: Context) {
    super(ctx);
    process.env.NODE_ENV ??= "development";
    this.builder = new Build(ctx);
  }

  async run() {
    this.runner = new ZoteroRunner({
      binary: {
        path: this.zoteroBinPath,
        devtools: this.ctx.server.devtools,
        args: this.ctx.server.startArgs,
      },
      profile: {
        path: this.profilePath,
        dataDir: this.dataDir,
        // keepChanges: this.ctx.server.keepProfileChanges,
        createIfMissing: this.ctx.server.createProfileIfMissing,
      },
      plugins: {
        list: [{
          id: this.ctx.id,
          sourceDir: join(this.ctx.dist, "addon"),
        }],
        asProxy: this.ctx.server.asProxy,
      },
    });

    await this.ctx.hooks.callHook("serve:init", this.ctx);

    // prebuild
    if (this.ctx.server.prebuild) {
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
  async watch() {
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

  async reload() {
    this.logger.tip("Reloading...");
    await this.runner?.reloadAllPlugins();
    await this.ctx.hooks.callHook("serve:onReloaded", this.ctx);
  }

  // Use arrow functions to keep `this`
  exit = () => {
    this.logger.info("Server shutdown by user request.");
    this.runner?.exit();
    this.ctx.hooks.callHook("serve:exit", this.ctx);
    process.exit();
  };

  private onZoteroExit = (_code?: number | null, _signal?: any) => {
    this.logger.info(`Zotero terminated.`);
    process.exit();
  };

  get zoteroBinPath() {
    if (this._zoteroBinPath)
      return this._zoteroBinPath;

    this._zoteroBinPath = process.env.ZOTERO_PLUGIN_ZOTERO_BIN_PATH;
    if (!this._zoteroBinPath || !existsSync(this._zoteroBinPath))
      throw new Error("The Zotero binary not found.");

    return this._zoteroBinPath;
  }

  get profilePath() {
    return process.env.ZOTERO_PLUGIN_PROFILE_PATH;
  }

  get dataDir() {
    return process.env.ZOTERO_PLUGIN_DATA_DIR;
  }
}
