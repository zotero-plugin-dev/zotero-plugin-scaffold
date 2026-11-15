import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestFileFilter, filterTestFiles, isFilePattern, isQuotedFilter, isTestFileName, resolveTestEntries, TEST_FILE_GLOB, toTestFileGlob, unquoteFilter } from "./entries.js";

describe("isFilePattern", () => {
  it("treats a glob as a file pattern", () => {
    expect(isFilePattern("test/**/*.spec.ts")).toBe(true);
    expect(isFilePattern("test/*.spec.ts")).toBe(true);
    expect(isFilePattern("test/[ab].spec.ts")).toBe(true);
    expect(isFilePattern("test/{a,b}/*.ts")).toBe(true);
    expect(isFilePattern("!test/legacy/**")).toBe(true);
  });

  it("treats a path naming a script file as a file pattern", () => {
    expect(isFilePattern("test/prefs.spec.ts")).toBe(true);
    expect(isFilePattern("test/prefs.spec.js")).toBe(true);
    expect(isFilePattern("test/prefs.test.mjs")).toBe(true);
    expect(isFilePattern("/abs/test/prefs.spec.tsx")).toBe(true);
  });

  it("treats a directory as a directory", () => {
    expect(isFilePattern("test")).toBe(false);
    expect(isFilePattern("test/")).toBe(false);
    expect(isFilePattern("src/test/unit")).toBe(false);
  });
});

describe("toTestFileGlob", () => {
  it("expands a directory to its test files", () => {
    expect(toTestFileGlob("test")).toBe(`test/${TEST_FILE_GLOB}`);
    expect(toTestFileGlob("test/unit/")).toBe(`test/unit/${TEST_FILE_GLOB}`);
  });

  it("keeps a glob and a file as they are", () => {
    expect(toTestFileGlob("test/unit/**/*.spec.ts")).toBe("test/unit/**/*.spec.ts");
    expect(toTestFileGlob("test/prefs.spec.ts")).toBe("test/prefs.spec.ts");
  });

  it("normalizes the separators of a Windows path", () => {
    // A glob is written with `/` everywhere; a `\` would be an escape.
    expect(toTestFileGlob(String.raw`test\unit`)).toBe(`test/unit/${TEST_FILE_GLOB}`);
    expect(toTestFileGlob("test\\unit\\")).toBe(`test/unit/${TEST_FILE_GLOB}`);
    expect(toTestFileGlob(String.raw`test\unit\*.spec.ts`)).toBe("test/unit/*.spec.ts");
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
    // Like Vitest and Rstest, which filter by substring and leave globs to `include`.
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

describe("resolveTestEntries", () => { // Relative to the package, so the expectations do not depend on the cwd of
  // the test runner.
  const root = fileURLToPath(new URL("..", import.meta.url));

  it("matches the test files of a glob", async () => {
    const files = await resolveTestEntries(["src/*.test.ts"], [], root);

    expect(files).toContain("src/test-bundler.test.ts");
    // Only the test files: the sources next to them are not part of the run.
    expect(files.every(file => /\.test\.[jt]s$/.test(file))).toBe(true);
    // Paths are normalized to posix, so a bundle path is stable on every platform.
    expect(files.every(file => !file.includes("\\"))).toBe(true);
  });

  it("matches every test file of the project", async () => {
    const files = await resolveTestEntries([TEST_FILE_GLOB], [], root);

    expect(files).toContain("src/test-bundler.test.ts");
    expect(files).toContain("src/config.test.ts");
  });

  it("drops the files that exclude matches", async () => {
    const files = await resolveTestEntries(["src/*.test.ts"], ["src/test-bundler.test.ts"], root);

    expect(files).not.toContain("src/test-bundler.test.ts");
    expect(files).toContain("src/config.test.ts");
  });

  it("de-duplicates overlapping include patterns and sorts them", async () => {
    const files = await resolveTestEntries(["src/*.test.ts", "src/test-bundler.test.ts"], [], root);

    expect(files).toEqual([
      ...new Set(files),
    ].sort());
    expect(new Set(files).size).toBe(files.length);
  });

  it("does not expand a directory pattern into every file below it", async () => {
    // Aligned with Vitest and Rstest: `include` takes globs, not directories.
    expect(await resolveTestEntries(["src"], [], root)).toEqual([]);
  });

  it("returns an empty list when nothing matches", async () => {
    expect(await resolveTestEntries(["src/nothing-here.spec.ts"], [], root)).toEqual([]);
    expect(await resolveTestEntries(["src/*.test.ts"], ["src/**"], root)).toEqual([]);
  });
});

describe("resolveTestEntries on a fixture", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "scaffold-test-entries-"));
    await mkdir(join(dir, "test"), { recursive: true });
    await mkdir(join(dir, ".hidden"), { recursive: true });
    await writeFile(join(dir, "test", "a.spec.ts"), "");
    await writeFile(join(dir, ".hidden", "b.spec.ts"), "");
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("skips hidden directories, like the globs of Vitest and Rstest", async () => {
    const files = await resolveTestEntries([TEST_FILE_GLOB], [], dir);

    expect(files).toEqual(["test/a.spec.ts"]);
  });

  it("accepts the separators of a Windows path", async () => {
    // A `\\` in a glob is an escape, so the separators are normalized first.
    expect(await resolveTestEntries([String.raw`test\*.spec.ts`], [], dir)).toEqual(["test/a.spec.ts"]);
    expect(await resolveTestEntries([TEST_FILE_GLOB], [String.raw`test\**`], dir)).toEqual([]);
  });
});

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
