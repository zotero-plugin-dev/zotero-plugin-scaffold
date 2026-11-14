import type { BaseContext, BaseUserConfig } from "@zotero-plugin/config";
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
