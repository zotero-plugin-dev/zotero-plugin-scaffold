import type { Command } from "@zotero-plugin/config";
import type { BuilderContext } from "../types.js";
import type { EsbuildManager } from "./esbuild.js";
import process from "node:process";
import { styleText } from "node:util";
import { dateFormat } from "@zotero-plugin/utils";
import { emptyDir } from "fs-extra/esm";

import copyAssets from "./assets.js";
import { createEsbuildManager } from "./esbuild.js";
import buildLocale from "./fluent.js";
import buildManifest from "./manifest.js";
import buildPrefs from "./prefs.js";
import replaceDefine from "./replace.js";
import buildUpdateJson from "./update-json.js";
import pack from "./zip.js";

export interface BuildRunOptions {
  /** Defaults to `process.env.NODE_ENV === "production"`. */
  pack?: boolean;
}

export interface Builder extends Command {
  run: (opts?: BuildRunOptions) => Promise<void>;
  /**
   * Rebuild after a change: script files only re-run esbuild, anything else
   * re-runs the full pipeline.
   */
  rebuild: (changedFile?: string) => Promise<void>;
  stop: () => Promise<void>;
}

export async function createBuilder(ctx: BuilderContext): Promise<Builder> {
  const { logger } = ctx;
  const esbuildManager: EsbuildManager = await createEsbuildManager(ctx);

  let disposed = false;
  let queue: Promise<unknown> = Promise.resolve();

  function assertUsable(): void {
    if (disposed)
      throw new Error("This builder has been stopped, create a new one.");
  }

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = queue.then(work, work);
    queue = next.then(() => undefined, () => undefined);
    return next;
  }

  async function bundle(): Promise<void> {
    await esbuildManager.rebuild();
    await ctx.hooks.callHook("build:bundle", ctx);
  }

  async function prepareAssets(): Promise<void> {
    const { source, namespace, dist, build } = ctx.config;

    await emptyDir(dist);
    await ctx.hooks.callHook("build:mkdir", ctx);

    await copyAssets([...source], dist, [...build.assets]);
    await replaceDefine(dist, build.define);
    await ctx.hooks.callHook("build:copyAssets", ctx);

    logger.debug("Preparing manifest", { space: 2 });
    await buildManifest(ctx);
    await ctx.hooks.callHook("build:makeManifest", ctx);

    logger.debug("Preparing locale files", { space: 2 });
    await buildLocale(dist, namespace, {
      ...build.fluent,
      ignore: [...build.fluent.ignore],
    });
    await ctx.hooks.callHook("build:fluent", ctx);

    logger.debug("Preparing preference files", { space: 2 });
    await buildPrefs(dist, build.prefs);
  }

  async function buildInProduction(): Promise<void> {
    const { dist, xpiName } = ctx.config;

    await pack(dist, xpiName);
    await ctx.hooks.callHook("build:pack", ctx);

    await buildUpdateJson(ctx);
    await ctx.hooks.callHook("build:makeUpdateJSON", ctx);
  }

  async function build(opts: BuildRunOptions = {}): Promise<void> {
    const { dist } = ctx.config;
    const { version } = ctx;
    const startedAt = new Date();
    const buildTime = dateFormat("YYYY-mm-dd HH:MM:SS", startedAt);

    logger.info(`Building version ${styleText("blue", version)} to ${styleText("blue", dist)} at ${styleText("blue", buildTime)} in ${styleText("blue", process.env.NODE_ENV)} mode.`);
    await ctx.hooks.callHook("build:init", ctx);

    logger.tip("Preparing static assets", { space: 1 });
    await prepareAssets();

    logger.tip("Bundling scripts", { space: 1 });
    await bundle();

    if (opts.pack ?? process.env.NODE_ENV === "production") {
      logger.tip("Packing plugin", { space: 1 });
      await buildInProduction();
    }

    await ctx.hooks.callHook("build:done", ctx);
    logger.success(`Build finished in ${(Date.now() - startedAt.getTime()) / 1000} s.`);
  }

  return {
    run(opts) {
      assertUsable();
      return enqueue(async () => await build(opts));
    },

    rebuild(changedFile) {
      assertUsable();
      return enqueue(async () =>
        changedFile && isScriptFile(changedFile)
          ? await bundle()
          : await build(),
      );
    },

    async stop() {
      if (disposed)
        return;

      disposed = true;
      await queue;
      await esbuildManager.dispose();
    },
  };
}

const SCRIPT_EXTENSIONS = [".ts", ".tsx"];

function isScriptFile(file: string): boolean {
  return SCRIPT_EXTENSIONS.some(ext => file.endsWith(ext));
}
