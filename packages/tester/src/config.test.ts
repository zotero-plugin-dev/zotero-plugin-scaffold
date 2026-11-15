import { describe, expect, it } from "vitest";
import { testDefaults, testTransform } from "./config.js";

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
  it("runs the tests below `test`", () => {
    expect(testDefaults.entries).toBe("test");
  });

  it("skips node_modules and the VCS directory, like Vitest and Rstest", () => {
    expect(testDefaults.exclude).toEqual(["**/node_modules/**", "**/.git/**"]);
  });

  it("starts without a filter, which the CLI positional arguments fill", () => {
    expect(testDefaults.filter).toEqual([]);
  });
});

describe("testTransform", () => {
  it("keeps what the user configured", () => {
    expect(transform({
      entries: ["test", "integration"],
    }).test.entries).toEqual([
      "test",
      "integration",
    ]);
    expect(transform({
      exclude: ["test/legacy/**"],
    }).test.exclude).toEqual(["test/legacy/**"]);
  });

  it("adds the build output to the exclusion", () => {
    expect(transform({}, { dist: "build" }).test.exclude).toContain("build/**");
    // The default is a hidden directory, which the exclusion also covers.
    expect(transform({}, { dist: ".scaffold/build" }).test.exclude).toContain(".scaffold/build/**");
    // Contributed by the user, so it stays.
    expect(transform({
      exclude: ["dist/**"],
    }, { dist: "dist" }).test.exclude).toEqual([
      "dist/**",
      "dist/**",
    ]);
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
