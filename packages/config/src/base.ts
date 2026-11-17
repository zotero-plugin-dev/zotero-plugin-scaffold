import type { Logger } from "@zotero-plugin/utils";
import type { BaseUserConfig, ContextOf } from "./types.js";

export abstract class Base<TCtx extends ContextOf = ContextOf> {
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
