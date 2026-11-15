import { isAbsolute, relative, resolve } from "node:path";
import process from "node:process";
import { toPosix } from "@zotero-plugin/utils";
import { glob } from "tinyglobby";

/**
 * Resolution of `test.include` and `test.exclude`, and of the positional
 * arguments of the `test` command.
 *
 * `include` and `exclude` are lists of globs relative to the project root, like
 * in Vitest and Rstest. The positional arguments are filters applied on top of
 * them, with the matching rules of the same engines: a case-insensitive
 * substring of the root-relative path, or an absolute path used as a prefix.
 */

/**
 * The glob of a directory: its test files, i.e. `*.spec.*` and `*.test.*`.
 *
 * `expandDirectories` of tinyglobby is not used for this, because it would also
 * return fixtures and helpers living next to the tests.
 */
export const TEST_FILE_GLOB = "**/*.{spec,test}.[jt]s";

/**
 * Whether a pattern names files itself, i.e. is a glob or a path ending in a
 * script file, instead of a directory.
 *
 * @param entry one entry of `test.include` or `test.exclude`.
 */
export function isFilePattern(entry: string): boolean {
  // `[` starts a character class in a glob, hence the escaped class below.
  return /[*?[\]{}!]/.test(entry) || /\.[cm]?[jt]sx?$/.test(entry);
}

/**
 * Turn a directory into the glob that matches its test files.
 *
 * `test.include` takes globs, while the deprecated `test.entries` named
 * directories; the migration uses this to keep such a configuration running the
 * same files.
 *
 * @param entry a directory, a test file or a glob.
 * @returns The glob to run.
 */
export function toTestFileGlob(entry: string): string {
  return isFilePattern(entry)
    ? entry
    : `${entry.replace(/\/+$/, "")}/${TEST_FILE_GLOB}`;
}

/**
 * Resolve `test.include` and `test.exclude` into the paths of the test files
 * to run.
 *
 * The result is sorted and de-duplicated, so that overlapping patterns bundle
 * every file exactly once.
 *
 * @param include `test.include` as configured, or the positional CLI arguments.
 * @param exclude `test.exclude` as configured.
 * @param root the directory the patterns are relative to, the project root.
 * @returns The paths of the matched test files, relative to `root`.
 */
export async function resolveTestEntries(
  include: string[],
  exclude: string[] = [],
  root?: string,
): Promise<string[]> {
  const files = await glob(include, {
    absolute: false,
    cwd: root,
    // A pattern that names a directory must not pull in every file below it.
    expandDirectories: false,
    ignore: exclude,
  });

  return [
    ...new Set(files.map(file => file.replaceAll(/\\/g, "/"))),
  ].sort();
}

/**
 * Whether a filter is wrapped in quotes, which makes it an exact path filter.
 *
 * It is the convention of Rstest: `"test/prefs.spec.ts"` (quotes included in the
 * argument) matches that file only, while the unquoted `prefs` is a substring
 * and would also match `prefs-extra.spec.ts`.
 *
 * @param filter one positional argument of the `test` command.
 */
export function isQuotedFilter(filter: string): boolean {
  return filter.length >= 2
    && (filter[0] === "\"" || filter[0] === "'")
    && filter.at(-1) === filter[0];
}

/**
 * Strip the quotes of an exact path filter.
 *
 * @param filter one positional argument of the `test` command.
 */
export function unquoteFilter(filter: string): string {
  return isQuotedFilter(filter)
    ? filter.slice(1, -1)
    : filter;
}

/**
 * The form an exact path filter is compared with.
 *
 * Like Rstest, the comparison stays case-sensitive on POSIX systems: an exact
 * filter asks for a path, and two paths that only differ in case are two files.
 *
 * @param path a file path.
 */
function normalizeExactPathMatch(path: string): string {
  const normalized = toPosix(path);
  return process.platform === "win32"
    ? normalized.toLowerCase()
    : normalized;
}

/**
 * Build the predicate of the positional arguments of `zotero-plugin test`.
 *
 * The rules are the ones of Rstest's `filterFiles()` (a superset of Vitest's):
 *
 * - a quoted filter is an exact path, matched against the absolute and the
 *   root-relative path of the test file;
 * - an absolute filter is matched as a prefix of the absolute path;
 * - any other filter is compared with the root-relative path as a
 *   case-insensitive substring, so `prefs` and `test/unit` both work. The filter
 *   is also tried rewritten relative to the root, and a trailing slash is kept,
 *   so that `test/unit/` does not also match `test/unit2/`.
 *
 * A filter is *not* a glob: `test/**\/*.spec.ts` matches nothing, exactly like in
 * Vitest and Rstest, where narrowing by pattern is done by `include`.
 *
 * @param filters the positional arguments of the `test` command.
 * @param root the directory the filters are relative to, the project root.
 * @returns A predicate over a test file path, absolute or relative to `root`.
 */
export function createTestFileFilter(
  filters: string[],
  root: string = process.cwd(),
): (file: string) => boolean {
  if (filters.length === 0)
    return () => true;

  const exactPaths = new Set<string>();
  const absolutePrefixes: string[] = [];
  const fragments = new Set<string>();

  for (const filter of filters) {
    if (isQuotedFilter(filter)) {
      exactPaths.add(normalizeExactPathMatch(unquoteFilter(filter)));
      continue;
    }

    if (isAbsolute(filter))
      absolutePrefixes.push(normalizeExactPathMatch(filter));

    const relativeFilter = toPosix(relative(root, resolve(root, filter)));
    fragments.add(toPosix(filter).toLowerCase());
    fragments.add((filter.endsWith("/")
      ? `${relativeFilter}/`
      : relativeFilter).toLowerCase());
  }

  return (file: string): boolean => {
    const absolute = toPosix(resolve(root, file));

    if (absolutePrefixes.some(prefix => normalizeExactPathMatch(absolute).startsWith(prefix)))
      return true;

    const relativePath = toPosix(relative(root, absolute));

    if (
      exactPaths.size > 0
      && (exactPaths.has(normalizeExactPathMatch(absolute)) || exactPaths.has(normalizeExactPathMatch(relativePath)))
    ) {
      return true;
    }

    const testFile = relativePath.toLowerCase();
    return [...fragments].some(fragment => testFile.includes(fragment));
  };
}

/**
 * Keep the test files selected by the positional arguments of the `test`
 * command, see `createTestFileFilter()`.
 *
 * @param files the test files `include` and `exclude` selected.
 * @param filters the positional arguments of the `test` command.
 * @param root the directory the filters are relative to, the project root.
 */
export function filterTestFiles(
  files: string[],
  filters: string[],
  root: string = process.cwd(),
): string[] {
  return files.filter(createTestFileFilter(filters, root));
}
