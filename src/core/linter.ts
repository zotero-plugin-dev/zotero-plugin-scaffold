// AddonLint
import type { Context } from "../types/index.js";
import { Base } from "./base.js";

export default class Lint extends Base {
  constructor(ctx: Context) {
    super(ctx);
  }

  run() {
    // webext.cmd.lint({});
  }

  exit() {}
}
