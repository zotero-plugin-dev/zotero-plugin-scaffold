import type { Command } from "@zotero-plugin/config";
import type { Builder } from "@zotero-plugin/core";
import type { TestContext } from "./types.js";
import { join, resolve } from "node:path";
import process from "node:process";
import { createBuilder } from "@zotero-plugin/core";
import { watch } from "@zotero-plugin/utils";
import { ZoteroRunner } from "@zotero-plugin/zotero-runner";
import { emptyDir } from "fs-extra/esm";
import { TESTER_DATA_DIR, TESTER_PLUGIN_DIR, TESTER_PLUGIN_ID, TESTER_PROFILE_DIR } from "./constant.js";
import { isTestFileName } from "./entries.js";
import { prepareHeadless } from "./headless.js";
import { TestHttpReporter } from "./http-reporter.js";
import { TestBundler } from "./test-bundler.js";

export interface Tester extends Command {
  run: () => Promise<void>;
  dispose: () => Promise<void>;
}

export async function createTester(ctx: TestContext): Promise<Tester> {
  const { logger } = ctx;
  const builder: Builder = await createBuilder(ctx);

  const reporter = new TestHttpReporter();
  await reporter.start();

  const testBundler = new TestBundler(ctx, reporter.port);

  const zotero = new ZoteroRunner({
    binary: {
      devtools: ctx.config.test.devtools,
      args: [...ctx.config.test.startArgs],
    },
    profile: {
      path: TESTER_PROFILE_DIR,
      dataDir: TESTER_DATA_DIR,
      customPrefs: {
        // eslint-disable-next-line ts/no-use-before-define -- the Zotero defaults are listed at the end of the file
        ...DEFAULT_TEST_PREFS,
        ...ctx.config.test.prefs,
      },
    },
    plugins: {
      list: [
        {
          id: ctx.config.id,
          sourceDir: join(ctx.config.dist, "addon"),
        },
        {
          id: TESTER_PLUGIN_ID,
          sourceDir: TESTER_PLUGIN_DIR,
        },
      ],
    },
  });

  let watcher: ReturnType<typeof watch> | undefined;
  let disposing: Promise<void> | undefined;
  let settleRun!: () => void;
  const settled = new Promise<void>((resolve) => {
    settleRun = resolve;
  });

  async function dispose(): Promise<void> {
    disposing ??= (async () => {
      await watcher?.close();
      watcher = undefined;

      reporter.stop();

      await testBundler.dispose();

      zotero.exit();

      await builder.dispose();
      settleRun();
    })();

    return disposing;
  }

  function isSourceFile(path: string): boolean {
    if (isTestFileName(path))
      return false;

    const absolute = resolve(path);
    return ctx.config.source
      .map(p => resolve(p))
      .some(s => absolute === s || absolute.startsWith(`${s}/`) || absolute.startsWith(`${s}\\`));
  }

  async function run(): Promise<void> {
    await emptyDir(TESTER_PROFILE_DIR);
    await emptyDir(TESTER_DATA_DIR);
    await emptyDir(TESTER_PLUGIN_DIR);
    await ctx.hooks.callHook("test:init", ctx);

    await builder.run({ pack: false });
    await ctx.hooks.callHook("test:prebuild", ctx);

    await testBundler.generate();
    await ctx.hooks.callHook("test:bundleTests", ctx);

    if (ctx.config.test.headless && !process.env.ZOTERO_SETUP_COMPLETE)
      await prepareHeadless();

    await zotero.run();

    zotero.process?.on("close", () => {
      logger.info("Zotero terminated.");
      void dispose();
    });

    await ctx.hooks.callHook("test:run", ctx);

    if (ctx.config.test.watch) {
      watcher = watch(
        [
          ...ctx.config.source,
          ...ctx.config.test.entries,
        ],
        [
          ...ctx.config.watchIgnore,
        ],
        {
          onChange: async (path) => {
            if (isSourceFile(path)) {
              await builder.run({ pack: false });
              await testBundler.regenerate(path);
              await zotero.reloadAllPlugins();
            }
            else {
              await testBundler.regenerate(path);
              await zotero.reloadTemporaryPluginBySourceDir(TESTER_PLUGIN_DIR);
            }
          },
          onAdd: async (path) => {
            if (isSourceFile(path)) {
              await builder.run({ pack: false });
              await testBundler.regenerate(path);
              await zotero.reloadAllPlugins();
            }
            else {
              await testBundler.generate();
              await zotero.reloadTemporaryPluginBySourceDir(TESTER_PLUGIN_DIR);
            }
          },
        },
      );
    }

    await settled;

    process.exitCode = reporter.failed ? 1 : 0;
  }

  return { run, dispose };
}

const DEFAULT_TEST_PREFS: Record<string, string | number | boolean> = {
  "extensions.experiments.enabled": true,
  "extensions.autoDisableScopes": 0,
  "devtools.debugger.remote-enabled": true,
  "devtools.debugger.remote-websocket": true,
  "devtools.debugger.prompt-connection": false,
  "app.update.enabled": false,
  "extensions.zotero.sync.server.compressData": false,
  "extensions.zotero.automaticScraperUpdates": false,
  "extensions.zotero.debug.log": 5,
  "extensions.zotero.debug.level": 5,
  "extensions.zotero.debug.time": 5,
  "extensions.zotero.firstRun.skipFirefoxProfileAccessCheck": true,
  "extensions.zotero.firstRunGuidance": false,
  "extensions.zotero.firstRun2": false,
  "extensions.zotero.reportTranslationFailure": false,
  "extensions.zotero.httpServer.enabled": true,
  "extensions.zotero.httpServer.port": 23124,
  "extensions.zotero.httpServer.localAPI.enabled": true,
  "extensions.zotero.backup.numBackups": 0,
  "extensions.zotero.sync.autoSync": false,
  "extensions.zoteroMacWordIntegration.installed": true,
  "extensions.zoteroMacWordIntegration.skipInstallation": true,
  "extensions.zoteroWinWordIntegration.skipInstallation": true,
  "extensions.zoteroOpenOfficeIntegration.skipInstallation": true,
};

export { testDefaults, testTransform } from "./config.js";
export { TESTER_BASE_PATH, TESTER_DATA_DIR, TESTER_PLUGIN_DIR, TESTER_PLUGIN_ID, TESTER_PLUGIN_REF, TESTER_PROFILE_DIR } from "./constant.js";
export { prepareHeadless } from "./headless.js";
export { TestHttpReporter } from "./http-reporter.js";
export { TestBundler } from "./test-bundler.js";
export type {
  ResolvedTestConfig,
  TestConfig,
  TestContext,
  TestHooks,
  TestRuntimeOptions,
} from "./types.js";
