/**
 * Options for the Zotero test pool.
 */
import process from "node:process";
import { TESTER_DATA_DIR, TESTER_PROFILE_DIR } from "../../../constant.js";

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
  /** Extra preferences written to the profile's prefs.js. */
  extraPrefs?: Record<string, string | number | boolean>;
  /**
   * Function body (as a string) that returns whether the user plugin is
   * ready, e.g. `() => Zotero.MyPlugin.initialized`. The page polls it
   * (30s deadline) before the run starts — a replacement for the legacy
   * mocha-era `test.waitForPlugin`.
   */
  waitForPlugin?: string;
}

export interface ResolvedZoteroPoolOptions {
  zoteroBin: string;
  profileDir: string;
  dataDir: string;
  pluginDir?: string;
  pluginId?: string;
  testerPluginId: string;
  args?: string[];
  extraPrefs: Record<string, string | number | boolean>;
  waitForPlugin?: string;
}

export const TESTER_PLUGIN_ID = "zotero-plugin-tester@scaffold.local";

export function resolveOptions(
  options: ZoteroPoolOptions = {},
  projectName?: string,
): ResolvedZoteroPoolOptions {
  const bin = options.zoteroBin ?? process.env.ZOTERO_PLUGIN_ZOTERO_BIN_PATH;
  if (!bin) {
    throw new Error(
      "Zotero binary not found: pass `zoteroBin` or set ZOTERO_PLUGIN_ZOTERO_BIN_PATH",
    );
  }
  // Multiple projects may each run their own Zotero in parallel; derive the
  // resource dirs from the project name so they never collide by default.
  // Zotero allows any number of instances — only a shared profile/database
  // is mutually exclusive. Explicit options still override the derivation.
  const suffix = projectName ? `-${projectName}` : "";
  return {
    zoteroBin: bin,
    // Single source of truth with the `zotero-plugin test` CLI (constant.ts):
    // the CLI wipes these dirs before each run, so a mismatch would leave
    // stale profiles behind.
    profileDir: options.profileDir ?? `${TESTER_PROFILE_DIR}${suffix}`,
    dataDir: options.dataDir ?? `${TESTER_DATA_DIR}${suffix}`,
    pluginDir: options.pluginDir,
    pluginId: options.pluginId,
    testerPluginId: options.testerPluginId ?? TESTER_PLUGIN_ID,
    args: options.args,
    extraPrefs: options.extraPrefs ?? {},
    waitForPlugin: options.waitForPlugin,
  };
}
