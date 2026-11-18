import { defineConfig, loadConfig } from "./config.js";

export type { AllConfig, Context, Hooks, ResolvedConfig, UserConfig } from "./types.js";

// Configuration engine
export type {
  BaseConfig,
  BaseContextFields,
  BaseUserConfig,
  Command,
  CommandFactory,
  ConfigTransform,
  ContextOf,
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
  buildTransform,
  createBuilder,
  createDevServer,
  DEFAULT_DIST_TEMP_DIR,
  devServerDefaults,
  replace,
  replaceInFile,
} from "@zotero-plugin/core";
export type {
  BuildConfig,
  Builder,
  BuilderContext,
  BuildHooks,
  BuildRunOptions,
  DevServer,
  DevServerConfig,
  DevServerContext,
  ResolvedBuildConfig,
  ResolvedDevServerConfig,
  ServeHooks,
} from "@zotero-plugin/core";

// Release
export { createReleaser, releaseDefaults, releaseProviders, releaseTransform } from "@zotero-plugin/releaser";
export type {
  GitHubConfig,
  ReleaseConfig,
  ReleaseContext,
  ReleaseHooks,
  ReleaseProvider,
  Releaser,
  ResolvedReleaseConfig,
  VersionBumpRelease,
} from "@zotero-plugin/releaser";

// Test
export { createTester, testDefaults } from "@zotero-plugin/tester";
export type {
  ResolvedTestConfig,
  TestConfig,
  TestContext,
  Tester,
  TestHooks,
} from "@zotero-plugin/tester";

export { defineConfig, loadConfig };
