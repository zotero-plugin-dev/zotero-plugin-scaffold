import type { BaseConfig, BaseContext, Manifest, UpdateJSON } from "@zotero-plugin/config";
import type { RecursivePartial } from "@zotero-plugin/utils";
import type { BuildOptions } from "esbuild";

export interface BuildConfig {
  /**
   * The static assets.
   *
   * - Typically includes icons, ftl files, 3rd party JavaScript files, CSS files, XHTML files, etc.
   * - is an array of `glob` modes and supports negation modes.
   * - Do not add an entire directory unless it has no files to exclude.
   *
   * 静态资源文件。
   *
   * - 通常包括图标、ftl 文件、第三方 JavaScript 文件、CSS 文件、XHTML 文件等。
   * - 是一个 `glob` 模式数组，支持否定模式。
   * - 除非一个目录没有需要排除的文件，否则不要添加整个目录。
   *
   * @see {@link https://github.com/sindresorhus/globby?tab=readme-ov-file#globbing-patterns | Pattern syntax | 语法说明 }
   *
   * @example `["src/**\/*.*", "!src/**\/*.ts"]` (no `\`)
   *
   * @default "addon/**\/*.*" (no `\`)
   */
  assets: string | string[];
  /**
   * The placeholders to replace in static assets.
   *
   * - At build time, scaffolding uses the key of the placeholder to build the regular pattern `/__${key}__/g` and replaces matches with `value`.
   * - Replacement happens for all files under `assets`.
   *
   * 静态资源文本占位符。
   *
   * - 在构建时，脚手架使用占位符的 key 建立正则模式 `/__${key}__/g`，并将匹配到的内容替换为 `value`。
   * - 替换发生在 `assets` 下的所有文件。
   */
  define: {
    [key: string]: string;
  };
  fluent: {
    /**
     * Add plugin namespace prefixes to all FTL files to avoid conflicts.
     *
     * The default prefix is `${namespace}-`.
     *
     * 为所有 FTL 文件添加插件前缀以避免冲突。
     *
     * 默认前缀为 `${namespace}-`。
     *
     * @default true
     */
    prefixLocaleFiles: boolean;
    /**
     * Add plugin namespace prefixes to all FTL messages to avoid conflicts.
     *
     * The default prefix is `${namespace}-`.
     *
     * 为所有 FTL message 添加插件前缀以避免冲突。
     *
     * 默认前缀为 `${namespace}-`。
     *
     * @default true
     */
    prefixFluentMessages: boolean;
    /**
     * Messages to ignore.
     *
     * 需要忽略的 Fluent Messages。
     *
     * @default []
     */
    ignore: string[];
    /**
     * Generate i10n.d.ts form fluent messages.
     *
     * - false: disable
     * - string: path of dts file
     *
     * 为 Fluent messages 生成类型声明文件。
     *
     * - false: 禁用
     * - string：dts 文件路径
     *
     * @default 'typings/i10n.d.ts'
     */
    dts: string | false;
  };
  prefs: {
    /**
     * Prefixes the keys of preferences in `prefs.js` and
     * the value of the `preference` attribute in XHTML files.
     *
     * 为 `prefs.js` 中的首选项键和 XHTML 文件中的 `preference` 属性的值
     * 添加前缀。
     *
     * @default true
     */
    prefixPrefKeys: boolean;
    /**
     * Prefixes for Preference Keys, no dot at the end.
     *
     * 首选项键的前缀，结尾不需要加点号。
     *
     * @default 'extensions.${namespace}'
     */
    prefix: string;
    /**
     * Generate prefs.d.ts form prefs.js.
     *
     * - false: disable
     * - string: path of dts file
     *
     * 为首选项生成类型声明文件。
     *
     * - false: 禁用
     * - string：dts 文件路径
     *
     * @default 'typings/prefs.d.ts'
     */
    dts: false | string;
  };
  /**
   * Configurations of esbuild.
   *
   * Paths should be relative to the root directory of the project.
   * And if `outfile` and `outdir` not start with `dist`,
   * `dist/` will be automatically added as a prefix.
   *
   * esbuild 配置。
   *
   * 路径应相对于项目根目录。
   * 其中 `outfile` 和 `outdir` 若不以 `dist` 开头，
   * 则会自动添加 `dist/` 前缀。
   *
   * @default []
   */
  esbuildOptions: BuildOptions[];
  /**
   * Make manifest.json.
   *
   * 生成 `manifest.json`。
   */
  makeManifest: {
    /**
     * Whether to manage manifest.json automatically.
     *
     * If false, the developer is expected to provide `manifest.json` themselves.
     *
     * 是否自动管理 `manifest.json`。
     *
     * 如果此项为 false，则开发者应自行准备 `manifest.json`。
     *
     * @default true
     */
    enable: boolean;
    /**
     * Template of manifest.
     *
     * manifest 模板。
     *
     * @deprecated
     */
    template: Manifest;
  };
  /**
   * Make update manifest.
   *
   * 生成 `update.json`。
   */
  makeUpdateJson: {
    /**
     * Historical update data.
     *
     * This can be useful if you need to distribute different plugin versions
     * for different versions of Zotero.
     *
     * 已有的更新数据。
     *
     * 如果你需要为不同版本的 Zotero 分发不同的插件版本，这可能会很有用。
     *
     * @see {@link https://www.zotero.org/support/dev/zotero_7_for_developers#updaterdf_updatesjson | Zotero 7 for developers}
     * @see {@link https://extensionworkshop.com/documentation/manage/updating-your-extension/ | Updating your extension}
     * @see {@link https://zotero-chinese.com/plugin-dev-guide/reference/update | 更新清单 (In chinese)}
     *
     * @default []
     */
    updates: UpdateJSON["addons"][string]["updates"];
    /**
     * Whether or not to write the hash of the xpi file to update.json.
     *
     * 是否向 `update.json` 中写入 xpi 文件的 hash。
     *
     * @default true
     */
    hash: boolean;
  };
  /**
   * The lifecycle hooks.
   *
   * 生命周期钩子。
   */
  hooks: Partial<BuildHooks>;
}

export interface BuildHooks {
  "build:init": (ctx: CoreContext) => void | Promise<void>;
  "build:mkdir": (ctx: CoreContext) => void | Promise<void>;
  "build:copyAssets": (ctx: CoreContext) => void | Promise<void>;
  "build:makeManifest": (ctx: CoreContext) => void | Promise<void>;
  "build:fluent": (ctx: CoreContext) => void | Promise<void>;
  "build:bundle": (ctx: CoreContext) => void | Promise<void>;
  "build:pack": (ctx: CoreContext) => void | Promise<void>;
  "build:makeUpdateJSON": (ctx: CoreContext) => void | Promise<void>;
  "build:done": (ctx: CoreContext) => void | Promise<void>;
}

export interface BuildUserConfig {
  /**
   * Configurations required to run the build.
   *
   * 构建所需的配置。
   */
  build?: RecursivePartial<BuildConfig>;
}

export interface DevServerConfig {
  /**
   * Open devtool on Zotero start.
   *
   * 在 Zotero 启动时打开 devtool。
   *
   * @default true
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
   * Whether to open the Zotero Debug Output window on startup
   * (appends `-ZoteroDebug`).
   *
   * This only controls the window. Debug output is always recorded when
   * `debugOutputFile` is enabled: scaffold then appends `-ZoteroDebugText`,
   * so `Zotero.debug()` / `dump()` output goes to stdout and is captured into
   * the log file regardless of this option.
   *
   * 是否在启动时打开 Zotero 的 Debug Output 窗口（追加 `-ZoteroDebug`）。
   *
   * 此项仅控制窗口。调试输出在 {@link DevServerConfig.debugOutputFile}
   * 启用时被记录到日志文件：此时脚手架追加 `-ZoteroDebugText`，
   * `Zotero.debug()` / `dump()` 输出进 stdout 并被捕获到日志文件，
   * 与本选项无关。
   *
   * @default false
   */
  debugOutputWindow: boolean;

  /**
   * Whether to record the Zotero process debug output (stdout/stderr) to
   * log files under `.scaffold/logs/`.
   *
   * - stdout → `.scaffold/logs/zotero-<starttime>.log`
   * - stderr → `.scaffold/logs/zotero-<starttime>-stderr.log`
   *
   * 是否把 Zotero 进程的调试输出（stdout/stderr）写入 `.scaffold/logs/` 下的日志文件。
   *
   * - stdout → `.scaffold/logs/zotero-<启动时间>.log`
   * - stderr → `.scaffold/logs/zotero-<启动时间>-stderr.log`
   *
   * @default true
   */
  debugOutputFile: boolean;

  /**
   * The default preferences for the dev server.
   * These preferences will be set before Zotero starts.
   *
   * 开发服务器的默认首选项。
   * 这些首选项将在 Zotero 启动前设置。
   */
  prefs: Record<string, string | number | boolean>;
  /**
   * Install the plugin as a Proxy File mode.
   *
   * 以 Proxy File 方式载入插件
   *
   * @default false
   */
  asProxy: boolean;

  /**
   * Whether to run the build once before starting Zotero.
   *
   * 启动 Zotero 前是否先执行一次构建。
   *
   * @default true
   */
  prebuild: boolean;
  // keepProfileChanges: boolean;

  /**
   * Whether to create the development profile when it does not exist.
   *
   * 开发用的 profile 不存在时是否创建它。
   *
   * @default true
   */
  createProfileIfMissing: boolean;

  /**
   * The lifecycle hooks.
   *
   * 生命周期钩子。
   */
  hooks: Partial<ServeHooks>;
}

export interface ServeHooks {
  "serve:init": (ctx: CoreContext) => void | Promise<void>;
  "serve:prebuild": (ctx: CoreContext) => void | Promise<void>;
  "serve:ready": (ctx: CoreContext) => void | Promise<void>;
  "serve:onChanged": (ctx: CoreContext, path: string) => void | Promise<void>;
  "serve:onReloaded": (ctx: CoreContext) => void | Promise<void>;
  "serve:exit": (ctx: CoreContext) => void;
}

export interface DevServerUserConfig {
  /**
   * Configurations required to run the dev server.
   *
   * devServer 所需的配置。
   */
  devServer?: RecursivePartial<DevServerConfig>;

  /**
   * Configurations required to run the dev server.
   *
   * devServer 所需的配置。
   *
   * @deprecated Use devServer instead.
   */
  server?: RecursivePartial<DevServerConfig>;
}

/**
 * The context shared by the build and dev-server commands.
 */
export interface CoreContext extends BaseContext {
  config: BaseConfig & {
    build: BuildConfig;
    devServer: DevServerConfig;
  };
}
