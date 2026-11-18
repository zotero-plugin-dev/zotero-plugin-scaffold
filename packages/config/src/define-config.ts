import type { BaseUserConfig } from "./types.js";

/**
 * Helper for user define configuration.
 */
export function defineConfig<T extends BaseUserConfig>(userConfig: T): T {
  return userConfig;
}
