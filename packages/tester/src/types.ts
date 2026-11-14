import type { BaseContext } from "@zotero-plugin/config";
import type { BuildConfig } from "@zotero-plugin/core";
import type { RecursivePartial } from "@zotero-plugin/utils";

export interface TestConfig {
  /**
   * The test source code directories, starting from the root directory of the project.
   * All `*.spec.js` files in these directories will be executed.
   * The files will be sorted by alphabetical order.
   *
   * @default "test"
   */
  entries: string | string[];

  /**
   * The default preferences for the test.
   * These preferences will be set before the test starts.
   */
  prefs: Record<string, string | boolean | number>;

  mocha: {
    /**
     * The timeout of the test.
     *
     * @default 10000
     */
    timeout: number;
  };

  /**
   * Abort the test when the first test fails.
   *
   * @default false
   */
  abortOnFail: boolean;

  /**
   * Watch source and test file changes,
   * and re-run tests when files change.
   *
   * If this set to false, Zotero will exit
   * when test completed.
   *
   * @default true (false in ci or AI agents)
   */
  watch: boolean;

  /**
   * Run Zotero in headless mode.
   *
   * - Supported for Linux only.
   * - Default to true when in CI environments.
   *
   * @default false (true in ci)
   */
  headless: boolean;

  /**
   * The delay time before running the test. Make sure the plugin is fully loaded before running the test.
   *
   * @default 1000
   */
  startupDelay: number;

  /**
   * Function string that returns the initialization status of the plugin.
   *
   * If set, the test will wait until the function returns true before running the test.
   *
   * @default "() => true"
   */
  waitForPlugin: string;

  /**
   * Open devtool on Zotero start.
   *
   * Falls back to `devServer.devtools` when not set.
   *
   * @default true
   */
  devtools: boolean;

  /**
   * Additional command line arguments when starting Zotero.
   *
   * Falls back to `devServer.startArgs` when not set.
   *
   * @default []
   */
  startArgs: string[];

  hooks: Partial<TestHooks>;
}

export interface TestHooks {
  "test:init": (ctx: TestContext) => void | Promise<void>;
  "test:prebuild": (ctx: TestContext) => void | Promise<void>;
  "test:bundleTests": (ctx: TestContext) => void | Promise<void>;
  "test:run": (ctx: TestContext) => void | Promise<void>;
  "test:exit": (ctx: TestContext) => void;
}

export interface TestUserConfig {
  test?: RecursivePartial<TestConfig>;
}

/**
 * The context of the test command.
 *
 * It only takes `build` and `test`, so the test command is decoupled from the
 * dev-server configuration.
 */
export interface TestContext extends BaseContext {
  build: BuildConfig;
  test: TestConfig;
}
