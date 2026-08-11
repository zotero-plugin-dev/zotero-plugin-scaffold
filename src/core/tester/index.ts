/**
 * `zotero-plugin test` — thin wrapper around vitest.
 *
 * The heavy lifting (bundling, Zotero lifecycle, message bridge, test
 * execution) lives in the zotero pool (`zoteroPlugin` from
 * `zotero-plugin-scaffold/vitest`). This class only:
 *   1. builds the user's plugin (prebuild)
 *   2. generates a temporary vitest config that wires the pool
 *   3. spawns vitest and forwards its exit code
 */
import type { Context } from "../../types/index.js";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import process from "node:process";
import { emptyDir, outputFile } from "fs-extra/esm";
import { isCI } from "std-env";
import { TESTER_DATA_DIR, TESTER_PROFILE_DIR } from "../../constant.js";
import { logger } from "../../utils/logger.js";
import { Base } from "../base.js";
import Build from "../builder/index.js";
import { generateVitestConfig } from "./cli-config.js";
import { prepareHeadless } from "./headless.js";

export default class Test extends Base {
  private builder: Build;

  constructor(ctx: Context) {
    super(ctx);
    process.env.NODE_ENV ??= "test";
    this.builder = new Build(ctx);

    if (isCI) {
      this.ctx.test.headless = true;
      this.ctx.test.watch = false;
    }
  }

  async run(): Promise<void> {
    // Stale profiles are cleaned so every run starts from a fresh Zotero.
    await emptyDir(TESTER_PROFILE_DIR);
    await emptyDir(TESTER_DATA_DIR);
    await this.ctx.hooks.callHook("test:init", this.ctx);

    // Prebuild the user's plugin (the pool loads it as a proxy addon).
    await this.builder.run();
    await this.ctx.hooks.callHook("test:prebuild", this.ctx);

    if (this.ctx.test.headless) {
      await prepareHeadless();
    }

    // Generate the temporary vitest config that wires the zotero pool. The
    // legacy test.waitForPlugin expression is passed to the pool, which bakes
    // it into the page and polls it before the run starts.
    const configPath = join(process.cwd(), ".scaffold", "vitest.config.ts");
    await outputFile(configPath, generateVitestConfig(this.ctx));
    logger.debug(`Generated vitest config at ${configPath}`);

    // Delegate to the project's vitest; the pool owns the Zotero lifecycle.
    const vitestCli = join(process.cwd(), "node_modules", "vitest", "vitest.mjs");
    const { existsSync } = await import("node:fs");
    if (!existsSync(vitestCli)) {
      logger.error(
        "vitest not found in this project. Install it with "
        + "`npm install -D vitest@^5` (the zotero pool runs on vitest).",
      );
      process.exit(1);
    }

    const args = this.ctx.test.watch ? [] : ["run"];
    args.push("--config", configPath);

    const result = spawnSync(process.execPath, [vitestCli, ...args], {
      stdio: "inherit",
    });

    await this.ctx.hooks.callHook("test:exit", this.ctx);
    process.exit(result.status ?? 1);
  }

  /** SIGINT etc. — the child vitest process is killed by the terminal. */
  exit = (): never => {
    process.exit(0);
  };
}
