import type { OverrideConfig, SliceDescriptor } from "@zotero-plugin/config";
import type { Context, UserConfig } from "./types.js";
import { baseDefaults, loadConfig as loadConfigBase } from "@zotero-plugin/config";
import { buildDefaults, buildSlice, devServerSlice } from "@zotero-plugin/core";
import { releaseDefaults, releaseSlice } from "@zotero-plugin/releaser";
import { testDefaults, testSlice } from "@zotero-plugin/tester";

/**
 * Default values of all slices.
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
 * Slice descriptors injected into the configuration engine.
 */
export const slices: SliceDescriptor[] = [
  buildSlice,
  devServerSlice,
  testSlice,
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
    slices,
  });
}
