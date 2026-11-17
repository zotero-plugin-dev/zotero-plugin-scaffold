import type { ConfigTransform } from "@zotero-plugin/config";
import type { AllConfig, Context, UserConfig } from "./types.js";
import { baseDefaults, loadConfig as loadConfigBase } from "@zotero-plugin/config";
import { buildDefaults, buildTransform, devServerDefaults } from "@zotero-plugin/core";
import { releaseDefaults, releaseTransform } from "@zotero-plugin/releaser";
import { testDefaults, testTransform } from "@zotero-plugin/tester";

/**
 * Default values of all command configs.
 */
export const defaults: AllConfig = {
  ...baseDefaults,
  ...buildDefaults,
  ...devServerDefaults,
  ...testDefaults,
  ...releaseDefaults,
};

/**
 * Configuration transforms injected into the engine.
 */
export const transforms: ConfigTransform<AllConfig>[] = [
  buildTransform,
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
export function loadConfig(overrides?: UserConfig): Promise<Context> {
  return loadConfigBase<UserConfig, Context>({
    defaults,
    overrides,
    transforms,
  });
}
