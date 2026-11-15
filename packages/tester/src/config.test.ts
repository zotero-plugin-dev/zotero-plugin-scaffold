import { describe, expect, it } from "vitest";
import { testDefaults, testTransform } from "./config.js";
import { TEST_FILE_GLOB } from "./entries.js";

/**
 * The resolved configuration after the transform ran on the given user values.
 *
 * The defaults are already merged by the config engine when the transform runs,
 * so the helper merges them the same way.
 */
function transform(
  test?: Record<string, unknown>,
  base: Record<string, unknown> = {},
): Record<string, any> {
  const config: Record<string, any> = {
    ...base,
    test: {
      ...testDefaults,
      ...test,
    },
  };
  testTransform(config as any, {} as any, {} as any);
  return config;
}

describe("testDefaults", () => {
  it("leaves include empty, so the default glob is filled in after the merge", () => {
    expect(testDefaults.include).toEqual([]);
  });

  it("skips node_modules and the VCS directory, like Vitest and Rstest", () => {
    expect(testDefaults.exclude).toEqual(["**/node_modules/**", "**/.git/**"]);
  });
});

describe("testTransform", () => {
  it("includes every test file of the project when nothing selects a test", () => {
    expect(transform({}).test.include).toEqual([TEST_FILE_GLOB]);
    expect(transform({ include: [] }).test.include).toEqual([TEST_FILE_GLOB]);
  });

  it("keeps what the user configured", () => {
    expect(transform({
      include: ["test/**/*.spec.ts"],
    }).test.include).toEqual(["test/**/*.spec.ts"]);
    expect(transform({
      exclude: ["test/legacy/**"],
    }).test.exclude).toEqual(["test/legacy/**"]);
  });

  it("migrates the former `entries` key to `include`", () => {
    // `entries` named directories, which `include` only takes as globs.
    expect(transform({ entries: "test" }).test.include).toEqual([`test/${TEST_FILE_GLOB}`]);
    expect(transform({
      entries: ["test/api"],
    }).test.include).toEqual([`test/api/${TEST_FILE_GLOB}`]);
    // A glob and a file are kept as they are.
    expect(transform({
      entries: ["test/**/*.spec.ts"],
    }).test.include).toEqual(["test/**/*.spec.ts"]);
    expect(transform({
      entries: ["test/prefs.spec.ts"],
    }).test.include).toEqual(["test/prefs.spec.ts"]);
  });

  it("keeps both keys when a configuration is half migrated", () => {
    expect(transform({
      include: ["test/unit/**"],
      entries: ["test/api"],
    }).test.include).toEqual([
      "test/unit/**",
      `test/api/${TEST_FILE_GLOB}`,
    ]);
  });

  it("falls back to the default when `entries` was emptied", () => {
    expect(transform({ entries: [] }).test.include).toEqual([TEST_FILE_GLOB]);
  });

  it("drops the migrated key", () => {
    expect(transform({
      entries: ["test/api"],
    }).test).not.toHaveProperty("entries");
  });

  it("excludes the build output", () => {
    expect(transform({}, { dist: "build" }).test.exclude).toContain("build/**");
    // The default is a hidden directory, which the exclusion also covers.
    expect(transform({}, { dist: ".scaffold/build" }).test.exclude).toContain(".scaffold/build/**");
  });

  it("keeps the build output out of the watch ignore list", () => {
    expect(transform({}, { dist: ".scaffold/build" }).watchIgnore).toEqual([".scaffold/build"]);
    expect(transform({}, {
      dist: "build",
      watchIgnore: ["tmp"],
    }).watchIgnore).toEqual(["tmp", "build"]);
  });

  it("leaves a configuration without a test slice alone", () => {
    const config: Record<string, any> = {};
    testTransform(config as any, {} as any, {} as any);
    expect(config).toEqual({});
  });
});
