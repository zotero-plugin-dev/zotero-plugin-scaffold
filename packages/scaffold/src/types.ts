import type { BaseConfig, ContextOf, ResolvedBaseConfig } from "@zotero-plugin/config";
import type {
  BuildConfig,
  BuildHooks,
  DevServerConfig,
  ResolvedBuildConfig,
  ResolvedDevServerConfig,
  ServeHooks,
} from "@zotero-plugin/core";
import type { ReleaseConfig, ReleaseContext, ReleaseHooks, ResolvedReleaseConfig } from "@zotero-plugin/releaser";
import type { ResolvedTestConfig, TestConfig, TestHooks } from "@zotero-plugin/tester";
import type { DeepPartial } from "@zotero-plugin/utils";
import type { Hookable } from "hookable";

export type AllConfig = BaseConfig
  & BuildConfig
  & DevServerConfig
  & TestConfig
  & ReleaseConfig;

/**
 * The user-facing configuration of scaffold.
 *
 * It is the composition of the base configuration and all command slices, and
 * every field is deeply optional.
 */
export type UserConfig = DeepPartial<AllConfig>;

/**
 * All hook events exposed by scaffold.
 */
export interface Hooks extends BuildHooks, ServeHooks, TestHooks, ReleaseHooks {}

/**
 * The fully resolved configuration, i.e. the base configuration plus every
 * command slice.
 */
export type ResolvedConfig = ResolvedBaseConfig
  & ResolvedBuildConfig
  & ResolvedDevServerConfig
  & ResolvedTestConfig
  & ResolvedReleaseConfig;

/**
 * The fully resolved context handed to every command.
 */
export type Context = ContextOf<
  ResolvedConfig,
  Pick<ReleaseContext, "tag" | "commitMessage" | "changelog">
> & {
  hooks: Hookable<Hooks>;
};
