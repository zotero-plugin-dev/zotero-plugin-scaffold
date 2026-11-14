import type { BaseContext, Manifest, UpdateJSON } from "@zotero-plugin/config";
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
   */
  define: {
    [key: string]: string;
  };
  fluent: {
    /**
     * Add plugin namespace prefixes to all FTL files to avoid conflicts.
     *
     * @default true
     */
    prefixLocaleFiles: boolean;
    /**
     * Add plugin namespace prefixes to all FTL messages to avoid conflicts.
     *
     * @default true
     */
    prefixFluentMessages: boolean;
    /**
     * Messages to ignore.
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
     * @default 'typings/i10n.d.ts'
     */
    dts: string | false;
  };
  prefs: {
    /**
     * Prefixes the keys of preferences in `prefs.js` and
     * the value of the `preference` attribute in XHTML files.
     *
     * @default true
     */
    prefixPrefKeys: boolean;
    /**
     * Prefixes for Preference Keys, no dot at the end.
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
   * @default []
   */
  esbuildOptions: BuildOptions[];
  /**
   * Make manifest.json.
   */
  makeManifest: {
    /**
     * Whether to manage manifest.json automatically.
     *
     * @default true
     */
    enable: boolean;
    /**
     * Template of manifest.
     *
     * @deprecated
     */
    template: Manifest;
  };
  /**
   * Make update manifest.
   */
  makeUpdateJson: {
    /**
     * Historical update data.
     *
     * This can be useful if you need to distribute different plugin versions
     * for different versions of Zotero.
     *
     * @default []
     */
    updates: UpdateJSON["addons"][string]["updates"];
    /**
     * Whether or not to write the hash of the xpi file to update.json.
     *
     * @default true
     */
    hash: boolean;
  };
  /**
   * The lifecycle hooks.
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
  build?: RecursivePartial<BuildConfig>;
}

export interface DevServerConfig {
  /**
   * Open devtool on Zotero start.
   *
   * @default true
   */
  devtools: boolean;
  /**
   * Additional command line arguments when starting Zotero.
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
   * @default true
   */
  debugOutputFile: boolean;

  /**
   * The default preferences for the dev server.
   * These preferences will be set before Zotero starts.
   */
  prefs: Record<string, string | number | boolean>;
  /**
   * Install the plugin as a Proxy File mode.
   *
   * @default false
   */
  asProxy: boolean;

  prebuild: boolean;
  // keepProfileChanges: boolean;
  createProfileIfMissing: boolean;

  /**
   * The lifecycle hooks.
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
  devServer?: RecursivePartial<DevServerConfig>;
}

/**
 * The context shared by the build and dev-server commands.
 */
export interface CoreContext extends BaseContext {
  build: BuildConfig;
  devServer: DevServerConfig;
}
