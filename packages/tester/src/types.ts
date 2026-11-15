import type { BaseContext } from "@zotero-plugin/config";
import type { BuildConfig } from "@zotero-plugin/core";
import type { RecursivePartial } from "@zotero-plugin/utils";

export interface TestConfig {
  /**
   * The test source code directories, starting from the root directory of the
   * project. All `*.spec.*` and `*.test.*` files below these directories are
   * bundled and executed, in alphabetical order.
   *
   * `test.exclude` drops some of the files again, and the positional arguments
   * of `zotero-plugin test` narrow a single run down.
   *
   * @default "test"
   */
  entries: string | string[];

  /**
   * The glob patterns to skip after `entries` selected the test files, like
   * `exclude` in Vitest and Rstest.
   *
   * @default ["**\/node_modules/**", "**\/.git/**"]
   */
  exclude: string[];

  /**
   * Only run the test files whose path contains one of the filters, like the
   * positional arguments of `vitest run [...filters]` and `rstest [...filters]`.
   *
   * The positional arguments of `zotero-plugin test` are what normally fills
   * this list, so it is usually left empty.
   *
   * @default []
   */
  filter: string[];

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
   * Unlike `devServer.devtools`, this defaults to `false` so that test runs
   * stay headless-friendly; enable it explicitly when debugging tests.
   *
   * @default false
   */
  devtools: boolean;

  /**
   * Additional command line arguments when starting Zotero.
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
 * The options handed to the prebuilt test runtime (`test-runtime.js`).
 *
 * They are generated on every test run and injected into `index.xhtml` as
 * `window.__TEST_OPTIONS__`, so that the prebuilt runtime stays independent
 * of the resolved configuration.
 */
export interface TestRuntimeOptions {
  /** The timeout of a single test, in milliseconds. */
  timeout: number;
  /** The port of the local HTTP server that receives the test results. */
  port: number;
  /** Abort the run on the first failure. */
  abortOnFail: boolean;
  /** Quit Zotero when the run finished. */
  exitOnFinish: boolean;
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
