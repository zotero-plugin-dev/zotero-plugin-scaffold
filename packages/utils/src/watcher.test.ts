import { describe, expect, it } from "vitest";
import { toPosix } from "./path.js";
import { toWatchPath, toWatchPaths } from "./watcher.js";

describe("toPosix", () => {
  it("normalizes the separators of every platform", () => {
    expect(toPosix("test\\unit\\a.spec.ts")).toBe("test/unit/a.spec.ts");
    expect(toPosix("test/unit/a.spec.ts")).toBe("test/unit/a.spec.ts");
  });
});

describe("toWatchPath", () => {
  it("keeps a path that is not a glob as it is", () => {
    expect(toWatchPath("test")).toBe("test");
    expect(toWatchPath("test/unit")).toBe("test/unit");
    expect(toWatchPath("test/unit/prefs.spec.ts")).toBe("test/unit/prefs.spec.ts");
  });

  it("reduces a glob to the directory it starts in", () => {
    expect(toWatchPath("test/unit/**/*.spec.ts")).toBe("test/unit");
    expect(toWatchPath("test/*.spec.ts")).toBe("test");
    expect(toWatchPath("test/**/*.spec.ts")).toBe("test");
  });

  it("handles other glob syntaxes", () => {
    expect(toWatchPath("test/{a,b}/*.spec.ts")).toBe("test");
    expect(toWatchPath("test/[ab]/*.spec.ts")).toBe("test");
  });

  it("falls back to the working directory", () => {
    expect(toWatchPath("**/*.spec.ts")).toBe(".");
  });

  it("keeps an absolute prefix absolute", () => {
    expect(toWatchPath("/home/me/plugin/test/**/*.spec.ts")).toBe("/home/me/plugin/test");
  });

  it("de-duplicates the directories of several targets", () => {
    expect(toWatchPaths(["test/unit/**/*.spec.ts", "test/unit/*.test.ts", "src"])).toEqual([
      "test/unit",
      "src",
    ]);
  });

  it("drops a target another one already covers", () => {
    // Watching the project root makes the source directory redundant, and
    // chokidar would report its changes twice.
    expect(toWatchPaths(["src", "**/*.spec.ts"])).toEqual(["."]);
    expect(toWatchPaths(["test", "test/unit/**/*.spec.ts"])).toEqual(["test"]);
  });
});
