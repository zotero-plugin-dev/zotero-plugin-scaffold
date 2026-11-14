import type { Logger, LogLevelType, RecursivePartial } from "@zotero-plugin/utils";
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
   * @default package-json.name
   */
  name: string;
  /**
   * The ID of plugin.
   *
   * Usually in the form of an email address or UUID.
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
   * @default kebabCase(name)
   */
  namespace: string;
  /**
   * XPI filename.
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
   * @default "src"
   */
  source: string | string[];

  /**
   * The files to ignore when watching.
   *
   * @default []
   */
  watchIgnore: string | string[] | RegExp | RegExp[];

  /**
   * The build directories.
   *
   * Scaffold will store the code before packaging after the build at `${dist}/addon`.
   * Store the packaging results at `${dist}/${xpiName}.xpi`.
   *
   * @default ".scaffold/build"
   */
  dist: string;

  /**
   * The download link of XPI.
   *
   * Some placeholders are available, see {@link TemplateData}.
   *
   * @default `https://github.com/{{owner}}/{{repo}}/releases/download/v{{version}}/{{xpiName}}.xpi`
   */
  xpiDownloadLink: string;

  /**
   * The uri of update.json.
   *
   * Some placeholders are available, see {@link TemplateData}.
   *
   * @default `https://github.com/{{owner}}/{{repo}}/releases/download/release/{{updateJson}}`
   */
  updateURL: string;

  /**
   * Level of the log.
   *
   * @default "INFO"
   */
  logLevel: LogLevelType;

  /**
   * Configurations of the (not-yet-implemented) lint command.
   */
  lint: LintConfig;
}

/**
 * User-facing base configuration. All fields are deeply optional, matching the
 * historic `UserConfig extends RecursivePartial<Config>` shape.
 */
export type BaseUserConfig = RecursivePartial<BaseConfig>;

export type OverrideConfig<T extends BaseUserConfig = BaseUserConfig> = RecursivePartial<T>;

export interface TemplateData {
  /**
   * `owner` and `repo` will be extracted from the `repository` property in `package.json`.
   */
  owner: string;
  repo: string;
  version: string;
  isPreRelease: boolean;
  updateJson: "update-beta.json" | "update.json" | string;
  xpiName: string;
  buildTime: string;
}

/**
 * A command slice descriptor injected into the configuration engine.
 *
 * The engine itself is agnostic of command-specific configuration; each
 * command package contributes its own default patching and template
 * interpolation through this descriptor.
 *
 * Hooks are discovered by convention instead of being declared here: after all
 * slices are resolved, the engine scans top-level config objects and registers
 * their `hooks` field, e.g. `build.hooks` or `devServer.hooks`.
 */
export interface SliceDescriptor {
  /**
   * Patch slice-specific defaults and interpolate templates.
   *
   * Receives the full (loosely typed) configuration and the resolved template data.
   */

  resolve?: (config: any, templateData: TemplateData, pkgUser: UserPackageJson) => void;
}

/**
 * The resolved base context: base configuration, runtime objects, and the
 * information collected from the user's package.json.
 */
export interface BaseContext extends BaseConfig {
  pkgUser: UserPackageJson;
  version: string;
  templateData: TemplateData;
  logger: Logger;

  hooks: Hookable<any>;
}
