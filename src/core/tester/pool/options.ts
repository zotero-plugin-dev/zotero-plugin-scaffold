/**
 * Options for the Zotero test pool.
 */
import process from "node:process";

export interface ZoteroPoolOptions {
  /** Path to the Zotero executable. Defaults to `ZOTERO_PLUGIN_ZOTERO_BIN_PATH`. */
  zoteroBin?: string;
  /** Profile directory. Defaults to `<cwd>/.scaffold/tester-profile`. */
  profileDir?: string;
  /** Zotero data directory. Defaults to `<cwd>/.scaffold/tester-data`. */
  dataDir?: string;
  /**
   * Source directory of the user's plugin (as a proxy addon, loaded alongside
   * the tester plugin). Optional.
   */
  pluginDir?: string;
  /** ID of the user's plugin (used for the proxy file). */
  pluginId?: string;
  /** ID of the generated tester plugin. */
  testerPluginId?: string;
  /** Additional Zotero command-line arguments. */
  args?: string[];
  /** Milliseconds to wait after Zotero startup before opening the test window. */
  startupDelay?: number;
  /** Abort the run on the first failing test. */
  abortOnFail?: boolean;
  /** Extra preferences written to the profile's prefs.js. */
  extraPrefs?: Record<string, string | number | boolean>;
}

export interface ResolvedZoteroPoolOptions {
  zoteroBin: string;
  profileDir: string;
  dataDir: string;
  pluginDir?: string;
  pluginId?: string;
  testerPluginId: string;
  args?: string[];
  startupDelay: number;
  abortOnFail: boolean;
  extraPrefs: Record<string, string | number | boolean>;
}

export const TESTER_PLUGIN_ID = "zotero-plugin-tester@scaffold.local";

export function resolveOptions(options: ZoteroPoolOptions = {}): ResolvedZoteroPoolOptions {
  const bin = options.zoteroBin ?? process.env.ZOTERO_PLUGIN_ZOTERO_BIN_PATH;
  if (!bin) {
    throw new Error(
      "Zotero binary not found: pass `zoteroBin` or set ZOTERO_PLUGIN_ZOTERO_BIN_PATH",
    );
  }
  return {
    zoteroBin: bin,
    profileDir: options.profileDir ?? ".scaffold/tester-profile",
    dataDir: options.dataDir ?? ".scaffold/tester-data",
    pluginDir: options.pluginDir,
    pluginId: options.pluginId,
    testerPluginId: options.testerPluginId ?? TESTER_PLUGIN_ID,
    args: options.args,
    startupDelay: options.startupDelay ?? 1000,
    abortOnFail: options.abortOnFail ?? false,
    extraPrefs: options.extraPrefs ?? {},
  };
}
