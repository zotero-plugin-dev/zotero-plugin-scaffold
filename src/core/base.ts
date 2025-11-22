import type { Context } from "../types/index.js";

export abstract class Base {
  ctx: Context;
  constructor(ctx: Context) {
    this.ctx = ctx;
  }

  abstract run(): void | Promise<void>;

  abstract exit(): void;

  get logger() {
    return this.ctx.logger;
  }
}
