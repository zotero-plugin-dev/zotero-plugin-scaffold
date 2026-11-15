import type { ConfigTransform } from "@zotero-plugin/config";
import type { TestConfig } from "./types.js";
import { relative, resolve } from "node:path";
import process from "node:process";
import { logger, toArray, toPosix } from "@zotero-plugin/utils";
import { TEST_FILE_GLOB, toTestFileGlob } from "./entries.js";

export const testDefaults: TestConfig = {
  // Empty on purpose: the config engine concatenates the arrays of two sources,
  // so a default here would be added to whatever the user selects. The default
  // is filled in by `testTransform()` once every source is merged.
  include: [],
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
};

export const testTransform: ConfigTransform = (config) => {
  if (!config.test)
    return;

  const test = config.test as TestConfig;

  if (test.entries !== undefined) {
    logger.warn("The `test.entries` option is deprecated. Use `test.include` instead.");
    // `entries` named directories, which its successor only accepts as globs.
    test.include = [
      ...test.include,
      ...toArray(test.entries).map(toTestFileGlob),
    ];
    delete test.entries;
  }

  if (!test.include?.length)
    test.include = [TEST_FILE_GLOB];

  // The build output holds a copy of the plugin and is written while watching:
  // it never belongs to a test run, and must not trigger a rebuild either.
  if (config.dist) {
    const dist = toPosix(relative(process.cwd(), resolve(config.dist)));

    test.exclude = [
      ...(test.exclude ?? []),
      `${dist}/**`,
    ];
    config.watchIgnore = [
      ...toArray(config.watchIgnore ?? []),
      config.dist,
    ];
  }
};
