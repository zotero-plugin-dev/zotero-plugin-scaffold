import type { SliceDescriptor } from "@zotero-plugin/config";

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
