import type { Command } from "@zotero-plugin/config";
import type { Builder } from "./builder/index.js";
import type { DevServerContext } from "./types.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { watch } from "@zotero-plugin/utils";
import { ZoteroRunner } from "@zotero-plugin/zotero-runner";
import { createBuilder } from "./builder/index.js";

export interface DevServer extends Command {
  run: () => Promise<void>;
  stop: () => Promise<void>;
}

export async function createDevServer(ctx: DevServerContext): Promise<DevServer> {
  const { logger } = ctx;
  const builder: Builder = await createBuilder(ctx);

  let runner: ZoteroRunner | undefined;
  let watcher: ReturnType<typeof watch> | undefined;
  let stopping: Promise<void> | undefined;
  let resolveRun: (() => void) | undefined;

  async function stop(): Promise<void> {
    stopping ??= (async () => {
      await watcher?.close();
      watcher = undefined;

      runner?.exit();
      runner = undefined;

      await builder.stop();
      resolveRun?.();
    })();

    return stopping;
  }

  async function reload(): Promise<void> {
    logger.tip("Reloading...");
    await runner?.reloadAllPlugins();
    await ctx.hooks.callHook("serve:onReloaded", ctx);
  }

  function watchSources(): void {
    watcher = watch(
      [...ctx.config.source],
      [...ctx.config.watchIgnore],
      {
        onReady: async () => {
          await ctx.hooks.callHook("serve:ready", ctx);
        },
        onChange: async (path) => {
          await ctx.hooks.callHook("serve:onChanged", ctx, path);
          await builder.rebuild(path);
          await reload();
        },
      },
    );
  }

  async function run(): Promise<void> {
    const {
      devtools,
      debugOutputWindow,
      debugOutputFile,
      startArgs,
      prefs,
      createProfileIfMissing,
      asProxy,
      prebuild,
    } = ctx.config.devServer;

    const done = new Promise<void>((resolve) => {
      resolveRun = resolve;
    });

    runner = new ZoteroRunner({
      binary: {
        path: zoteroBinPath(),
        devtools,
        args: [...startArgs],
        debugOutputWindow,
        debugOutputFile,
      },
      profile: {
        path: process.env.ZOTERO_PLUGIN_PROFILE_PATH,
        dataDir: process.env.ZOTERO_PLUGIN_DATA_DIR,
        createIfMissing: createProfileIfMissing,
        customPrefs: prefs,
      },
      plugins: {
        list: [
          {
            id: ctx.config.id,
            sourceDir: join(ctx.config.dist, "addon"),
          },
        ],
        asProxy,
      },
    });

    await ctx.hooks.callHook("serve:init", ctx);

    if (prebuild) {
      await builder.run({ pack: false });
      await ctx.hooks.callHook("serve:prebuild", ctx);
    }

    await runner.run();

    const onZoteroExit = (): void => {
      logger.info("Zotero terminated.");
      void stop();
    };
    runner.zotero?.on("exit", onZoteroExit);
    runner.zotero?.on("close", onZoteroExit);

    watchSources();

    await done;
  }

  return { run, stop };
}

function zoteroBinPath(): string {
  const path = process.env.ZOTERO_PLUGIN_ZOTERO_BIN_PATH;
  if (!path || !existsSync(path))
    throw new Error("The Zotero binary not found.");

  return path;
}
