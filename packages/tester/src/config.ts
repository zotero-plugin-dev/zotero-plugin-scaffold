import type { SliceDescriptor } from "@zotero-plugin/config";
import type { TestConfig } from "./types.js";

/**
 * `devtools` and `startArgs` deliberately have no default here: they are
 * resolved by {@link testSlice} from `devServer` so that the test command keeps
 * inheriting the dev-server settings until the user sets them explicitly.
 */
export type TestDefaults = Omit<TestConfig, "devtools" | "startArgs"> & Partial<Pick<TestConfig, "devtools" | "startArgs">>;

export const testDefaults: TestDefaults = {
  entries: "test",
  prefs: {},
  mocha: {
    timeout: 10000,
  },
  abortOnFail: false,
  headless: false,
  startupDelay: 1000,
  waitForPlugin: "() => true",
  watch: true,
  hooks: {},
};

/**
 * Patches the test slice.
 *
 * `test.devtools` and `test.startArgs` fall back to the dev-server settings, so
 * that the test command keeps its historic behavior while no longer reading
 * `devServer` at runtime.
 */
export const testSlice: SliceDescriptor = {
  resolve(config) {
    if (!config.test)
      return;

    config.test.devtools ??= config.devServer?.devtools ?? true;
    config.test.startArgs ??= config.devServer?.startArgs ?? [];
  },
  hooksOf: config => [config.test?.hooks ?? {}],
};
