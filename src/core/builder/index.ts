import type { Context } from "../../types/index.js";
import process from "node:process";
import { styleText } from "node:util";
import { emptyDir } from "fs-extra/esm";
import { dateFormat } from "../../utils/string.js";
import { Base } from "../base.js";

import copyAssets from "./assets.js";
import esbuild from "./esbuild.js";
import buildLocale from "./fluent.js";
import buildManifest from "./manifest.js";
import buildPrefs from "./prefs.js";
import replaceDefine from "./replace.js";
import buildUpdateJson from "./update-json.js";
import pack from "./zip.js";

export default class Build extends Base {
  private buildTime: string;
  constructor(ctx: Context) {
    super(ctx);
    process.env.NODE_ENV ??= "production";
    this.buildTime = "";
  }

  /**
   * Default build runner
   */
  async run(): Promise<void> {
    const { dist, version } = this.ctx;
    const t = new Date();
    this.buildTime = dateFormat("YYYY-mm-dd HH:MM:SS", t);
    this.logger.info(`Building version ${styleText("blue", version)} to ${styleText("blue", dist)} at ${styleText("blue", this.buildTime)} in ${styleText("blue", process.env.NODE_ENV)} mode.`);
    await this.ctx.hooks.callHook("build:init", this.ctx);

    this.logger.tip("Preparing static assets", { space: 1 });
    await this.prepareAssets();

    this.logger.tip("Bundling scripts", { space: 1 });
    await this.bundle();

    /** ======== build resolved =========== */

    if (process.env.NODE_ENV === "production") {
      this.logger.tip("Packing plugin", { space: 1 });
      await this.buildInProduction();
    }

    await this.ctx.hooks.callHook("build:done", this.ctx);
    this.logger.success(`Build finished in ${(new Date().getTime() - t.getTime()) / 1000} s.`);
  }

  private async prepareAssets() {
    const { source, namespace, dist, build } = this.ctx;

    await emptyDir(dist);
    await this.ctx.hooks.callHook("build:mkdir", this.ctx);

    await copyAssets(source, dist, build.assets);
    await replaceDefine(dist, build.define);
    await this.ctx.hooks.callHook("build:copyAssets", this.ctx);

    this.logger.debug("Preparing manifest", { space: 2 });
    await buildManifest(this.ctx);
    await this.ctx.hooks.callHook("build:makeManifest", this.ctx);

    this.logger.debug("Preparing locale files", { space: 2 });
    await buildLocale(dist, namespace, build.fluent);
    await this.ctx.hooks.callHook("build:fluent", this.ctx);

    this.logger.debug("Preparing preference files", { space: 2 });
    await buildPrefs(dist, build.prefs);
  }

  async bundle(): Promise<void> {
    const { dist, build: { esbuildOptions } } = this.ctx;
    await esbuild(dist, esbuildOptions);
    await this.ctx.hooks.callHook("build:bundle", this.ctx);
  }

  async buildInProduction(): Promise<void> {
    const { dist, xpiName } = this.ctx;

    await pack(dist, xpiName);
    await this.ctx.hooks.callHook("build:pack", this.ctx);

    await buildUpdateJson(this.ctx);
    await this.ctx.hooks.callHook("build:makeUpdateJSON", this.ctx);
  }

  exit(): void {}
}
