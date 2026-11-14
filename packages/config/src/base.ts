import type { Logger } from "@zotero-plugin/utils";
import type { BaseContext, BaseUserConfig } from "./types.js";

/**
 * Base class for command drivers.
 *
 * Each command package extends this class with its own context slice.
 */
export abstract class Base<TCtx extends BaseContext = BaseContext> {
  ctx: TCtx;
  constructor(ctx: TCtx) {
    this.ctx = ctx;
  }

  abstract run(): void | Promise<void>;

  abstract exit(): void;

  get logger(): Logger {
    return this.ctx.logger;
  }
}

/**
 * Helper for user define configuration.
 */
export function defineConfig<T extends BaseUserConfig>(userConfig: T): T {
  return userConfig;
}
