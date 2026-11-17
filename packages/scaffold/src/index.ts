import { defineConfig, loadConfig } from "./config.js";

export type { AllConfig, Context, Hooks, ResolvedConfig, UserConfig } from "./types.js";

// Configuration engine
export type {
  BaseConfig,
  BaseContext,
  BaseUserConfig,
  ConfigTransform,
  LintConfig,
  Manifest,
  PluginIdentity,
  ResolvedBaseConfig,
  TemplateData,
  UpdateJSON,
  UserPackageJson,
} from "@zotero-plugin/config";
export { BASE_DIR, baseDefaults, CACHE_DIR } from "@zotero-plugin/config";

// Build & dev server
export {
  buildDefaults,
  Builder,
  buildTransform,
  DEFAULT_DIST_TEMP_DIR,
  DevServer,
  devServerDefaults,
  replace,
  replaceInFile,
} from "@zotero-plugin/core";
export type {
  BuildConfig,
  BuilderContext,
  BuildHooks,
  DevServerConfig,
  DevServerContext,
  ResolvedBuildConfig,
  ResolvedDevServerConfig,
  ServeHooks,
} from "@zotero-plugin/core";

/**
 * @deprecated Use {@link Builder} instead.
 */
export { Builder as Build } from "@zotero-plugin/core";
/**
 * @deprecated Use {@link DevServer} instead.
 */
export { DevServer as Serve } from "@zotero-plugin/core";

// Release
export { releaseDefaults, Releaser, releaseTransform } from "@zotero-plugin/releaser";
export type {
  ReleaseConfig,
  ReleaseContext,
  ReleaseHooks,
  ResolvedReleaseConfig,
  VersionBumpRelease,
} from "@zotero-plugin/releaser";

export { defineConfig, loadConfig };

/**
 * @deprecated Use {@link Releaser} instead.
 */
export { Releaser as Release } from "@zotero-plugin/releaser";
// Test
export { testDefaults, Tester } from "@zotero-plugin/tester";
export type {
  ResolvedTestConfig,
  TestConfig,
  TestContext,
  TestHooks,
} from "@zotero-plugin/tester";
/**
 * @deprecated Use {@link Tester} instead.
 */
export { Tester as Test } from "@zotero-plugin/tester";

/**
 * @deprecated Use `defineConfig` and `loadConfig` directly.
 */
export const Config: {
  defineConfig: typeof defineConfig;
  loadConfig: typeof loadConfig;
} = {
  defineConfig,
  loadConfig,
};
