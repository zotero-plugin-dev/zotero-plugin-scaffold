import type { Logger, LogLevelType, Merge, RecursivePartial } from "@zotero-plugin/utils";
import type { Hookable } from "hookable";

/**
 * Placeholder type for the not-yet-implemented lint command.
 *
 * It is defined in the config package instead of `@zotero-plugin/linter`
 * because the published d.ts files must not reference a private package.
 */
export interface LintConfig {}

/**
 * The minimal shape of the user's package.json used by scaffold.
 */
export interface UserPackageJson {
  name: string;
  version: string;
  repository?: string | {
    url?: string;
  };
  config?: {
    /**
     * @deprecated Use `build.prefs.prefix` instead.
     */
    prefsPrefix?: string;
  };
}

/**
 * The identity fields of a plugin.
 */
export interface PluginIdentity {
  /**
   * The name of plugin.
   *
   * 插件名。
   *
   * @default package-json.name
   */
  name: string;
  /**
   * The ID of plugin.
   *
   * Usually in the form of an email address or UUID.
   *
   * 插件 ID。
   *
   * 通常是邮箱地址或 UUID 的形式。
   *
   * @default package-json.name
   */
  id: string;
  /**
   * Namespace of plugin.
   *
   * This attribute is also used to prevent plugin conflicts,
   * it may be used for plugin HTML element ids, preference prefixes,
   * fluent filename prefixes, fluent message prefixes, etc.
   *
   * Unlike the plugin id, this value should be HTML ID and Fluent Message
   * compliant, i.e. contain at least one character and only letters and dashes.
   *
   * 插件命名空间。
   *
   * 这个属性也用于防止插件冲突，它可能被用于插件的 HTML 元素 id，
   * 首选项前缀，Fluent 文件名前缀、Fluent message 前缀等。
   *
   * 与插件 ID 不同的是，这个值应是符合 HTML ID 和 Fluent Message 规范的，
   * 即：至少包含一个字符，仅包含字母和短横线。
   *
   * @default kebabCase(name)
   */
  namespace: string;
  /**
   * XPI filename.
   *
   * XPI 文件名。
   *
   * @default kebabCase(name)
   */
  xpiName: string;
}

/**
 * The resolved base configuration, i.e. all top-level keys that do not belong
 * to a command-specific slice.
 */
export interface BaseConfig extends PluginIdentity {
  /**
   * Source root directory or directories for the plugin.
   *
   * These paths are:
   * - Watched during development to trigger rebuilds on changes.
   * - Used to remove the top-level asset directory (e.g. `assets/`) during build,
   *   so that only its contents are copied directly to the output root.
   *
   * 插件的源码根目录（可为字符串或字符串数组）。
   *
   * 用于以下两个目的：
   * - 在开发模式下监听这些目录，以便在文件变更时触发重建；
   * - 在构建阶段中，用于识别 assets 所在的顶层目录，以移除该目录本身，仅将其内容复制到输出目录的根部。
   *
   * @example ["src", "addon"]
   *
   * @default "src"
   */
  source: string | string[];

  /**
   * The files to ignore when watching.
   *
   * 忽略的监听文件。
   *
   * @default []
   */
  watchIgnore: string | RegExp | (string | RegExp)[];

  /**
   * The build directories.
   *
   * Scaffold will store the code before packaging after the build at `${dist}/addon`.
   * Store the packaging results at `${dist}/${xpiName}.xpi`.
   *
   * 构建目录。
   *
   * 脚手架将在 `${dist}/addon` 存放构建后打包前的代码。
   * 在 `${dist}/${xpiName}.xpi` 存放打包结果。
   *
   * @default ".scaffold/build"
   */
  dist: string;

  /**
   * The download link of XPI.
   *
   * Some placeholders are available, see {@link TemplateData}.
   *
   * XPI 文件的地址。
   *
   * 一些可用的占位符请参阅 {@link TemplateData}。
   *
   * @default `https://github.com/{{owner}}/{{repo}}/releases/download/v{{version}}/{{xpiName}}.xpi`
   */
  xpiDownloadLink: string;

  /**
   * The uri of update.json.
   *
   * Some placeholders are available, see {@link TemplateData}.
   *
   * update.json 文件的地址。
   *
   * 一些可用的占位符请参阅 {@link TemplateData}。
   *
   * @default `https://github.com/{{owner}}/{{repo}}/releases/download/release/{{updateJson}}`
   */
  updateURL: string;

  /**
   * Level of the log.
   *
   * 日志等级。
   *
   * @default "INFO"
   */
  logLevel: LogLevelType;

  /**
   * Configurations of the (not-yet-implemented) lint command.
   *
   * （尚未实现的）lint 命令的配置。
   */
  lint: LintConfig;
}

/**
 * User-facing base configuration. All fields are deeply optional, matching the
 * historic `UserConfig extends RecursivePartial<Config>` shape.
 */
export type BaseUserConfig = RecursivePartial<BaseConfig>;

export type ResolvedBaseConfig = Merge<BaseConfig, {
  source: string[];
  watchIgnore: (string | RegExp)[];
}>;

export interface TemplateData {
  /**
   * `owner` and `repo` will be extracted from the `repository` property in `package.json`.
   */
  owner: string;
  repo: string;
  version: string;
  isPreRelease: boolean;
  updateJson: string;
  xpiName: string;
  buildTime: string;
}

/**
 * A transformation applied to the resolved configuration by a command package.
 *
 * The engine itself is agnostic of command-specific configuration; each
 * command package contributes one transform that patches its own defaults and
 * interpolates its templates.
 *
 * Hooks are discovered by convention instead of being declared here: after all
 * transforms are applied, the engine scans top-level config objects and
 * registers their `hooks` field, e.g. `build.hooks` or `devServer.hooks`.
 */
export type ConfigTransform<TConfig extends object = any> = (

  config: BaseConfig & TConfig,
  templateData: TemplateData,
  pkgUser: UserPackageJson,
) => void;

/**
 * The resolved base context: base configuration, runtime objects, and the
 * information collected from the user's package.json.
 */
export interface BaseContext {
  config: BaseConfig;
  pkgUser: UserPackageJson;
  version: string;
  templateData: TemplateData;
  logger: Logger;

  hooks: Hookable<any>;
}
