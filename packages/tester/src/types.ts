import type { BaseConfig, BaseContext } from "@zotero-plugin/config";
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
   * 测试源码目录，从项目的根目录开始。
   * 这些目录中的所有 `*.spec.*` 和 `*.test.*` 文件将被执行。
   * 文件将按字母顺序排序。
   *
   * `test.exclude` 用于再次排除其中部分文件，`zotero-plugin test` 的
   * 位置参数则用于缩小单次运行的范围。
   *
   * @default "test"
   */
  entries: string | string[];

  /**
   * The glob patterns to skip after `entries` selected the test files, like
   * `exclude` in Vitest and Rstest.
   *
   * 在 `entries` 选出测试文件后需要跳过的 `glob` 模式，类似 Vitest 与
   * Rstest 中的 `exclude`。
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
   * 仅运行路径中包含任一过滤字符串的测试文件，类似 `vitest run [...filters]`
   * 与 `rstest [...filters]` 的位置参数。
   *
   * 通常由 `zotero-plugin test` 的位置参数来填充此列表，因此一般留空。
   *
   * @default []
   */
  filter: string[];

  /**
   * The default preferences for the test.
   * These preferences will be set before the test starts.
   *
   * 测试的默认首选项。
   * 这些首选项将在测试开始前设置。
   */
  prefs: Record<string, string | boolean | number>;

  mocha: {
    /**
     * The timeout of the test.
     *
     * 测试的超时时间。
     *
     * @default 10000
     */
    timeout: number;
  };

  /**
   * Abort the test when the first test fails.
   *
   * 当第一个测试失败时中止测试。
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
   * 当源码或测试代码变更时自动重新运行测试。
   *
   * 若此选项设置为 false，Zotero 将在测试结束后立即退出。
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
   * 使用无头模式运行 Zotero。
   *
   * - 仅支持 Linux
   * - 在 CI 模式下，默认为 true
   *
   * @default false (true in ci)
   */
  headless: boolean;

  /**
   * The delay time before running the test. Make sure the plugin is fully loaded before running the test.
   *
   * 运行测试前的延迟时间。确保插件在运行测试前完全加载。
   *
   * @default 1000
   */
  startupDelay: number;

  /**
   * Function string that returns the initialization status of the plugin.
   *
   * If set, the test will wait until the function returns true before running the test.
   *
   * 返回插件初始化状态的函数字符串。
   *
   * 如果设置，测试将等待函数返回 true 后再运行测试。
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
   * 在 Zotero 启动时打开 devtool。
   *
   * 与 `devServer.devtools` 不同，此项默认为 `false`，以便测试保持对无头
   * 环境的友好性；调试测试时请显式开启。
   *
   * @default false
   */
  devtools: boolean;

  /**
   * Additional command line arguments when starting Zotero.
   *
   * 启动 Zotero 时附加的命令行参数。
   *
   * @default []
   */
  startArgs: string[];

  /**
   * The lifecycle hooks.
   *
   * 生命周期钩子。
   */
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
  /**
   * Configurations required to run the test.
   *
   * 测试相关配置。
   */
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
  config: BaseConfig & {
    build: BuildConfig;
    test: TestConfig;
  };
}
