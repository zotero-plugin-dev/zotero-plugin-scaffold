import type { OverrideConfig } from "@zotero-plugin/config";
import type { Context, UserConfig } from "./types.js";
import { loadConfig as loadConfigBase } from "@zotero-plugin/config";
import { defaults, slices } from "./types.js";

/**
 * Helper for user define configuration.
 */
export function defineConfig(userConfig: UserConfig): UserConfig {
  return userConfig;
}

/**
 * Loads config.
 *
 * @param overrides Highest priority configuration.
 * @returns Context with user-defined and default configuration merged and resolved.
 */
export function loadConfig(overrides?: OverrideConfig<UserConfig>): Promise<Context> {
  return loadConfigBase<UserConfig, Context>({
    defaults,
    overrides,
    slices,
  });
}
