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

  vitest: {
    /**
     * The timeout of the test.
     *
     * @default 10000
     */
    timeout: number;
  };

  /**
   * Vitest reporters to use for the test run.
   * Passed through to vitest's `reporters` option, e.g. "default", "verbose",
   * "junit" or "json".
   *
   * 测试报告器，原样传递给 vitest 的 `reporters` 选项
   * （如 "default"、"verbose"、"junit"、"json"）。
   */
  reporter?: string | string[];

  /**
   * Write the test report to a file. Passed through to vitest's `outputFile`
   * option (e.g. `test-results/junit.xml`, `test-results/report.json`).
   *
   * 测试报告输出文件路径，原样传递给 vitest 的 `outputFile` 选项。
   */
  outputFile?: string;

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
  /**
   * Called at the very start of `zotero-plugin test`, right after the stale
   * profile/data dirs are cleaned and before the plugin is built.
   */
  "test:init": (ctx: TestContext) => void | Promise<void>;
  /**
   * Called after the user's plugin is prebuilt, before the run is prepared.
   */
  "test:prebuild": (ctx: TestContext) => void | Promise<void>;
  /**
   * Called after the temporary vitest config is generated, right before the
   * vitest process starts. The pool bundles the test files immediately after
   * vitest starts (inside the child process), so this is the last CLI-side
   * chance to prepare the bundle.
   */
  "test:bundleTests": (ctx: TestContext) => void | Promise<void>;
  /**
   * Called right before the vitest process starts; the pool then boots
   * Zotero and runs the tests inside it.
   */
  "test:run": (ctx: TestContext) => void | Promise<void>;
  /**
   * Called after the vitest run finishes (success or failure), before the
   * CLI exits with vitest's exit code.
   */
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
