import type { TestConfig } from "./types.js";

export const testDefaults: TestConfig = {
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
  devtools: true,
  startArgs: [],
  hooks: {},
};
