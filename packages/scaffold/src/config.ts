import type { ConfigTransform, OverrideConfig } from "@zotero-plugin/config";
import type { Context, UserConfig } from "./types.js";
import { baseDefaults, loadConfig as loadConfigBase } from "@zotero-plugin/config";
import { buildDefaults, buildTransform, devServerTransform } from "@zotero-plugin/core";
import { releaseDefaults, releaseTransform } from "@zotero-plugin/releaser";
import { testDefaults, testTransform } from "@zotero-plugin/tester";

/**
 * Default values of all command configs.
 *
 * `devServer` is intentionally absent: its defaults are applied by
 * `devServerTransform` after the deprecated `server` key has been migrated.
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
  buildTransform,
  devServerTransform,
  testTransform,
  releaseTransform,
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
