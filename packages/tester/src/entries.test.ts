import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestFileFilter, filterTestFiles, isQuotedFilter, isTestFileName, resolveTestEntries, unquoteFilter } from "./entries.js";

describe("isTestFileName", () => {
  it("recognizes the two conventions", () => {
    expect(isTestFileName("test/prefs.spec.ts")).toBe(true);
    expect(isTestFileName("src/prefs.test.js")).toBe(true);
    expect(isTestFileName("src/a.spec.tsx")).toBe(true);
    expect(isTestFileName("src/a.test.mts")).toBe(true);
  });

  it("requires the suffix to end the name", () => {
    expect(isTestFileName("src/testing.ts")).toBe(false);
    expect(isTestFileName("src/spec.ts")).toBe(false);
    expect(isTestFileName("src/prefs.spec.ts.md")).toBe(false);
    expect(isTestFileName("src/prefs.ts")).toBe(false);
  });
});

describe("createTestFileFilter", () => {
  const matches = (file: string, filters: string[]): boolean =>
    createTestFileFilter(filters, "/project")(file);

  it("matches everything without a filter", () => {
    expect(matches("test/prefs.spec.ts", [])).toBe(true);
  });

  it("matches a path fragment, case-insensitively", () => {
    // Same behaviour as `vitest run prefs` / `rstest prefs`.
    expect(matches("test/prefs.spec.ts", ["prefs"])).toBe(true);
    expect(matches("test/PREFS.spec.ts", ["prefs"])).toBe(true);
    expect(matches("test/builder.spec.ts", ["prefs"])).toBe(false);
  });

  it("matches a directory, which is what makes `test/unit` work", () => {
    expect(matches("test/unit/zotero.spec.ts", ["test/unit"])).toBe(true);
    // A fragment also matches a longer directory name, exactly like in Vitest;
    // the trailing slash is what makes the filter a directory.
    expect(matches("test/unit2/zotero.spec.ts", ["test/unit"])).toBe(true);
    expect(matches("test/unit2/zotero.spec.ts", ["test/unit/"])).toBe(false);
    expect(matches("test/unit/zotero.spec.ts", ["test/unit/"])).toBe(true);
  });

  it("matches an absolute path as a prefix", () => {
    const absolute = resolve("/project", "test/unit/a.spec.ts");

    expect(matches(absolute, [
      resolve("/project", "test/unit"),
    ])).toBe(true);
    expect(matches(absolute, [
      resolve("/project", "test/api"),
    ])).toBe(false);
  });

  it("normalizes the path separators of every platform", () => {
    expect(matches(String.raw`test\unit\a.spec.ts`, ["test/unit"])).toBe(true);
  });

  it("selects a file when any filter matches", () => {
    expect(matches("test/prefs.spec.ts", ["prefs", "api"])).toBe(true);
    expect(matches("test/api.spec.ts", ["prefs", "api"])).toBe(true);
    expect(matches("test/builder.spec.ts", ["prefs", "api"])).toBe(false);
  });

  it("treats a quoted filter as an exact path", () => {
    // The convention of Rstest; the shell removes one layer of quotes.
    expect(matches("test/prefs.spec.ts", [`"test/prefs.spec.ts"`])).toBe(true);
    // An absolute path works too, spelled the way the platform resolves it.
    expect(matches("test/prefs.spec.ts", [`"${resolve("/project", "test/prefs.spec.ts")}"`])).toBe(true);
    // A substring would also match, but an exact path must not.
    expect(matches("test/prefs-extra.spec.ts", [`"test/prefs.spec.ts"`])).toBe(false);
    expect(matches("test/prefs-extra.spec.ts", [`"prefs"`])).toBe(false);
    expect(matches("test/prefs-extra.spec.ts", ["prefs"])).toBe(true);
  });

  it("matches an exact path however it is spelled", () => {
    // `node:path` folds `./`, `//` and `..` before the comparison.
    for (const filter of [
      `"test/prefs.spec.ts"`,
      `"./test/prefs.spec.ts"`,
      `"test//prefs.spec.ts"`,
      `"test/unit/../prefs.spec.ts"`,
    ]) {
      expect(matches("test/prefs.spec.ts", [filter])).toBe(true);
    }
  });

  it("does not treat a filter as a glob", () => {
    // Like Vitest and Rstest, which filter by substring and leave globs to the
    // configuration.
    expect(matches("test/prefs.spec.ts", ["test/**/*.spec.ts"])).toBe(false);
    expect(matches("test/prefs.spec.ts", ["^test/"])).toBe(false);
  });
});

describe("isQuotedFilter", () => {
  it("recognizes both quote styles", () => {
    expect(isQuotedFilter(`'"test/a.spec.ts"'`)).toBe(true);
    expect(isQuotedFilter("\"test/a.spec.ts\"")).toBe(true);
    expect(isQuotedFilter("'test/a.spec.ts'")).toBe(true);
  });

  it("requires matching quotes around the whole filter", () => {
    expect(isQuotedFilter("test/a.spec.ts")).toBe(false);
    expect(isQuotedFilter(`"test/a.spec.ts'`)).toBe(false);
    expect(isQuotedFilter(`"`)).toBe(false);
    expect(unquoteFilter(`"test/a.spec.ts"`)).toBe("test/a.spec.ts");
  });
});

describe("filterTestFiles", () => {
  it("keeps the input order and drops the files that do not match", () => {
    const files = ["test/b.spec.ts", "test/a.spec.ts", "test/api.spec.ts"];

    expect(filterTestFiles(files, ["api"], "/project")).toEqual(["test/api.spec.ts"]);
    expect(filterTestFiles(files, [], "/project")).toEqual(files);
  });
});

describe("resolveTestEntries", () => {
  // Relative to the package, so the expectations do not depend on the cwd of
  // the test runner.
  const root = fileURLToPath(new URL("..", import.meta.url));

  it("matches the test files of a directory", async () => {
    const files = await resolveTestEntries(["src"], [], root);

    expect(files).toContain("src/test-bundler.test.ts");
    expect(files).toContain("src/config.test.ts");
    // Only the test files: the sources next to them are not part of the run.
    expect(files.every(file => /\.test\.[jt]s$/.test(file))).toBe(true);
    // Paths are normalized to posix, so a bundle path is stable on every platform.
    expect(files.every(file => !file.includes("\\"))).toBe(true);
  });

  it("takes a single directory as well as a list", async () => {
    expect(await resolveTestEntries("src", [], root)).toEqual(await resolveTestEntries(["src"], [], root));
  });

  it("drops the files that exclude matches", async () => {
    const files = await resolveTestEntries(["src"], ["src/test-bundler.test.ts"], root);

    expect(files).not.toContain("src/test-bundler.test.ts");
    expect(files).toContain("src/config.test.ts");
  });

  it("de-duplicates overlapping directories and sorts them", async () => {
    const files = await resolveTestEntries(["src", "./src", "src/"], [], root);

    expect(files).toEqual([
      ...new Set(files),
    ].sort());
    expect(files).toEqual(await resolveTestEntries(["src"], [], root));
  });

  it("returns an empty list when nothing matches", async () => {
    expect(await resolveTestEntries(["nothing-here"], [], root)).toEqual([]);
    expect(await resolveTestEntries(["src"], ["src/**"], root)).toEqual([]);
  });
});

describe("resolveTestEntries on a fixture", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "scaffold-test-entries-"));
    await mkdir(join(dir, "test"), { recursive: true });
    await mkdir(join(dir, ".hidden"), { recursive: true });
    await mkdir(join(dir, "test", "legacy"), { recursive: true });
    await writeFile(join(dir, "test", "a.spec.ts"), "");
    await writeFile(join(dir, "test", "legacy", "b.spec.ts"), "");
    await writeFile(join(dir, ".hidden", "c.spec.ts"), "");
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("walks below the directories it is given", async () => {
    expect(await resolveTestEntries(["test"], [], dir)).toEqual([
      "test/a.spec.ts",
      "test/legacy/b.spec.ts",
    ]);
  });

  it("skips hidden directories, like the globs of tinyglobby", async () => {
    // The project root is a directory like any other, so the dot directory
    // below it stays out of the run.
    expect(await resolveTestEntries(["."], [], dir)).toEqual([
      "test/a.spec.ts",
      "test/legacy/b.spec.ts",
    ]);
  });

  it("accepts the separators of a Windows path", async () => {
    expect(await resolveTestEntries(["test\\"], [], dir)).toEqual([
      "test/a.spec.ts",
      "test/legacy/b.spec.ts",
    ]);
    expect(await resolveTestEntries(["test\\legacy"], [], dir)).toEqual([
      "test/legacy/b.spec.ts",
    ]);
  });
});
