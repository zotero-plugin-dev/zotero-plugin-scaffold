import type { ConfigTransform } from "@zotero-plugin/config";
import type { TestConfig } from "./types.js";
import { relative, resolve } from "node:path";
import process from "node:process";
import { toArray, toPosix } from "@zotero-plugin/utils";

export const testDefaults: TestConfig = {
  test: {
    entries: "test",
    // Like Vitest and Rstest, which skip `node_modules` and the VCS directory by
    // default; a user excludes more on top of this.
    exclude: ["**/node_modules/**", "**/.git/**"],
    filter: [],
    prefs: {},
    mocha: {
      timeout: 10000,
    },
    abortOnFail: false,
    headless: false,
    startupDelay: 1000,
    waitForPlugin: "() => true",
    watch: true,
    devtools: false,
    startArgs: [],
    hooks: {},
  },
};

export const testTransform: ConfigTransform<TestConfig> = (config) => {
  if (!config.test)
    return;

  const { test } = config;

  // The build output holds a copy of the plugin and is written while watching:
  // it never belongs to a test run, and must not trigger a rebuild either.
  if (config.dist) {
    const dist = toPosix(relative(process.cwd(), resolve(config.dist)));

    test.exclude = [
      ...toArray(test.exclude ?? []),
      `${dist}/**`,
    ];
    config.watchIgnore = [
      ...toArray(config.watchIgnore ?? []),
      config.dist,
    ];
  }

  test.entries = toArray(test.entries);
};
