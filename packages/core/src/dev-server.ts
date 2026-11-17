import type { CoreContext } from "./types.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { Base } from "@zotero-plugin/config";
import { watch } from "@zotero-plugin/utils";
import { ZoteroRunner } from "@zotero-plugin/zotero-runner";
import { Builder } from "./builder/index.js";

export class DevServer extends Base<CoreContext> {
  private builder: Builder;
  private runner?: ZoteroRunner;

  private _zoteroBinPath?: string;

  constructor(ctx: CoreContext) {
    super(ctx);
    process.env.NODE_ENV ??= "development";
    this.builder = new Builder(ctx);
  }

  async run(): Promise<void> {
    const {
      devtools,
      debugOutputWindow,
      debugOutputFile,
      startArgs,
      prefs,
      createProfileIfMissing,
      asProxy,
      prebuild,
    } = this.ctx.config.devServer;

    this.runner = new ZoteroRunner({
      binary: {
        path: this.zoteroBinPath,
        devtools,
        args: startArgs,
        debugOutputWindow,
        debugOutputFile,
      },
      profile: {
        path: this.profilePath,
        dataDir: this.dataDir,
        // keepChanges: this.ctx.server.keepProfileChanges,
        createIfMissing: createProfileIfMissing,
        customPrefs: prefs,
      },
      plugins: {
        list: [
          {
            id: this.ctx.config.id,
            sourceDir: join(this.ctx.config.dist, "addon"),
          },
        ],
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
    const { source, watchIgnore } = this.ctx.config;

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
