import type { ConfigTransform, OverrideConfig } from "@zotero-plugin/config";
import type { Context, UserConfig } from "./types.js";
import { baseDefaults, loadConfig as loadConfigBase } from "@zotero-plugin/config";
import { buildDefaults, buildSlice, devServerSlice } from "@zotero-plugin/core";
import { releaseDefaults, releaseSlice } from "@zotero-plugin/releaser";
import { testDefaults } from "@zotero-plugin/tester";

/**
 * Default values of all command configs.
 *
 * `devServer` is intentionally absent: its defaults are applied by
 * `devServerSlice` after the deprecated `server` key has been migrated.
 */
export const defaults: UserConfig = {
  ...baseDefaults,
  build: buildDefaults,
  test: testDefaults,
  release: releaseDefaults,
};

/**
 * Configuration transforms injected into the engine.
 */
export const transforms: ConfigTransform[] = [
  buildSlice,
  devServerSlice,
  releaseSlice,
];

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
    transforms,
  });
}
