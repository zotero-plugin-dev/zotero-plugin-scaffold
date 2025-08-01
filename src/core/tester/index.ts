import type { Context } from "../../types/index.js";
import { join, resolve } from "node:path";
import process from "node:process";
import { emptyDir } from "fs-extra/esm";
import { isCI } from "std-env";
import { TESTER_DATA_DIR, TESTER_PLUGIN_DIR, TESTER_PLUGIN_ID, TESTER_PROFILE_DIR } from "../../constant.js";
import { toArray } from "../../utils/string.js";
import { watch } from "../../utils/watcher.js";
import { ZoteroRunner } from "../../utils/zotero-runner.js";
import { Base } from "../base.js";
import Build from "../builder/index.js";
import { prepareHeadless } from "./headless.js";
import { TestHttpReporter } from "./http-reporter.js";
import { TestBundler } from "./test-bundler.js";

export default class Test extends Base {
  private builder: Build;
  private zotero?: ZoteroRunner;
  private reporter: TestHttpReporter = new TestHttpReporter();
  private testBundler?: TestBundler;

  constructor(ctx: Context) {
    super(ctx);
    process.env.NODE_ENV ??= "test";

    this.builder = new Build(ctx);

    if (isCI) {
      this.ctx.test.headless = true;
      this.ctx.test.watch = false;
    }
  }

  async run() {
    // Empty dirs
    await emptyDir(TESTER_PROFILE_DIR);
    await emptyDir(TESTER_DATA_DIR);
    await emptyDir(TESTER_PLUGIN_DIR);
    await this.ctx.hooks.callHook("test:init", this.ctx);

    // prebuild
    await this.builder.run();
    await this.ctx.hooks.callHook("test:prebuild", this.ctx);

    // Start a HTTP server to receive test results
    // This is useful for CI/CD environments
    await this.reporter.start();

    // Create proxy plugin to run tests
    this.testBundler = new TestBundler(
      this.ctx,
      this.reporter.port,
    );
    await this.testBundler.generate();
    await this.ctx.hooks.callHook("test:bundleTests", this.ctx);

    // Start Zotero
    await this.startZotero();
    await this.ctx.hooks.callHook("test:run", this.ctx);

    // Watch mode
    if (this.ctx.test.watch) {
      this.watch();
    }
  }

  async watch() {
    const source = toArray(this.ctx.source).map(p => resolve(p));
    const tests = toArray(this.ctx.test.entries).map(p => resolve(p));
    function isSource(_path: string) {
      const path = resolve(_path);
      const isSource = source.find(s => path.match(s)) || false;
      const _isTests = tests.find(t => path.match(t)) || false;
      return isSource;
    }

    watch(
      [this.ctx.source, this.ctx.test.entries].flat(),
      this.ctx.watchIgnore,
      {
        onChange: async (path) => {
          if (isSource(path)) {
            await this.builder.run();
            await this.testBundler?.regenerate(path);
            await this.zotero?.reloadAllPlugins();
          }
          else {
            await this.testBundler?.regenerate(path);
            await this.zotero?.reloadTemporaryPluginBySourceDir(TESTER_PLUGIN_DIR);
          }
        },
        onAdd: async (path) => {
          if (isSource(path)) {
            await this.builder.run();
            await this.testBundler?.regenerate(path);
            await this.zotero?.reloadAllPlugins();
          }
          else {
            await this.testBundler?.generate();
            await this.zotero?.reloadTemporaryPluginBySourceDir(TESTER_PLUGIN_DIR);
          }
        },
      },
    );
  }

  async startZotero() {
    if (this.ctx.test.headless) {
      await prepareHeadless();
    }

    this.zotero = new ZoteroRunner({
      binary: {
        path: this.zoteroBinPath,
        devtools: this.ctx.server.devtools,
        args: this.ctx.server.startArgs,
      },
      profile: {
        path: TESTER_PROFILE_DIR,
        dataDir: TESTER_DATA_DIR,
        customPrefs: this.prefs,
      },
      plugins: {
        list: [{
          id: this.ctx.id,
          sourceDir: join(this.ctx.dist, "addon"),
        }, {
          id: TESTER_PLUGIN_ID,
          sourceDir: TESTER_PLUGIN_DIR,
        }],
      },
    });

    await this.zotero.run();

    this.zotero.zotero?.on("close", () => this.onZoteroExit());
  }

  private onZoteroExit = () => {
    this.reporter.stop();
    this.ctx.hooks.callHook("test:exit", this.ctx);

    if (this.reporter.failed)
      process.exit(1);
    else
      process.exit(0);
  };

  exit = (code?: string | number) => {
    if (code === "SIGINT") {
      this.logger.info("Tester shutdown by user request");
    }

    this.reporter.stop();
    this.zotero?.exit();
    this.ctx.hooks.callHook("test:exit", this.ctx);
    process.exit();
  };

  private get zoteroBinPath() {
    if (!process.env.ZOTERO_PLUGIN_ZOTERO_BIN_PATH)
      throw new Error("No Zotero Found.");
    return process.env.ZOTERO_PLUGIN_ZOTERO_BIN_PATH;
  }

  private get prefs() {
    const defaultPref = {
      "extensions.experiments.enabled": true,
      "extensions.autoDisableScopes": 0,
      // Enable remote-debugging
      "devtools.debugger.remote-enabled": true,
      "devtools.debugger.remote-websocket": true,
      "devtools.debugger.prompt-connection": false,
      // Inherit the default test settings from Zotero
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

    return Object.assign(defaultPref, this.ctx.test.prefs || {});
  }
}
