import type { BaseConfig, BaseContext, BaseUserConfig } from "@zotero-plugin/config";
import type {
  BuildConfig,
  BuildHooks,
  BuildUserConfig,
  DevServerConfig,
  DevServerUserConfig,
  ServeHooks,
} from "@zotero-plugin/core";
import type { ReleaseConfig, ReleaseHooks, ReleaseUserConfig } from "@zotero-plugin/releaser";
import type { TestConfig, TestHooks, TestUserConfig } from "@zotero-plugin/tester";
import type { Hookable } from "hookable";

/**
 * The user-facing configuration of scaffold.
 *
 * It is the composition of the base configuration and all command slices, and
 * every field is deeply optional.
 */
export interface UserConfig extends BaseUserConfig, BuildUserConfig, DevServerUserConfig, TestUserConfig, ReleaseUserConfig {}

/**
 * All hook events exposed by scaffold.
 */
export interface Hooks extends BuildHooks, ServeHooks, TestHooks, ReleaseHooks {}

/**
 * The fully resolved configuration, i.e. the base configuration plus every
 * command slice.
 */
export interface ResolvedConfig extends BaseConfig {
  build: BuildConfig;
  devServer: DevServerConfig;
  test: TestConfig;
  release: ReleaseConfig;
}

/**
 * The fully resolved context handed to every command.
 */
export type Context = Omit<BaseContext, "config" | "hooks"> & {
  config: ResolvedConfig;
  hooks: Hookable<Hooks>;
};
