import type { BaseContext, BaseUserConfig, SliceDescriptor } from "@zotero-plugin/config";
import type {
  BuildHooks,
  BuildUserConfig,
  CoreContext,
  DevServerUserConfig,
  ServeHooks,
} from "@zotero-plugin/core";
import type { ReleaseContext, ReleaseHooks, ReleaseUserConfig } from "@zotero-plugin/releaser";
import type { TestContext, TestHooks, TestUserConfig } from "@zotero-plugin/tester";
import type { Hookable } from "hookable";
import { baseDefaults } from "@zotero-plugin/config";
import { buildDefaults, buildSlice, devServerSlice } from "@zotero-plugin/core";
import { releaseDefaults, releaseSlice } from "@zotero-plugin/releaser";
import { testDefaults, testSlice } from "@zotero-plugin/tester";

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
 * The fully resolved context handed to every command.
 *
 * Every slice context extends `BaseContext`, whose `hooks` member is
 * `Hookable<any>`. Intersecting the contexts directly would keep that member's
 * type wide, so `hooks` is stripped from each part and added back explicitly:
 * downstream `callHook` / `addHook` then keep their precise signatures.
 */
type ContextParts = Omit<BaseContext, "hooks">
  & Omit<CoreContext, "hooks">
  & Omit<TestContext, "hooks">
  & Omit<ReleaseContext, "hooks">;

export type Context = ContextParts & { hooks: Hookable<Hooks> };

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
