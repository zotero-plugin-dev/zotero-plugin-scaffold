import type { Context } from "../../types/index.js";
import type { Logger } from "../../utils/logger.js";
import { isCI } from "std-env";
import { globSync } from "tinyglobby";

export abstract class ReleaseBase {
  isCI: boolean;
  ctx: Context;
  constructor(ctx: Context) {
    this.ctx = ctx;
    this.isCI = isCI;
  }

  abstract run(): Context | Promise<Context> | void | Promise<void>;

  checkFiles(): void {
    const { dist } = this.ctx;

    if (globSync(`${dist}/*.xpi`).length === 0) {
      throw new Error("No xpi file found, are you sure you have run build?");
    }
  }

  get logger(): Logger {
    return this.ctx.logger;
  }
}
