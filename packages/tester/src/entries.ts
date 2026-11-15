import { isAbsolute, normalize, relative, resolve } from "node:path";
import process from "node:process";
import { toArray, toPosix } from "@zotero-plugin/utils";
import { glob } from "tinyglobby";

/**
 * Resolution of `test.entries`, `test.exclude` and the positional arguments of
 * the `test` command.
 *
 * `entries` names the directories that hold the test files, `exclude` drops
 * some of the files they select. The positional arguments are filters applied
 * on top of that, with the matching rules of Vitest and Rstest: a
 * case-insensitive substring of the root-relative path, or an absolute path
 * used as a prefix.
 */

/**
 * The glob of a directory: its test files, i.e. `*.spec.*` and `*.test.*`.
 *
 * `expandDirectories` of tinyglobby is not used for this, because it would also
 * return fixtures and helpers living next to the tests.
 */
export const TEST_FILE_GLOB = "**/*.{spec,test}.[jt]s";

/**
 * Whether a file name follows the convention of a test file, i.e. ends in
 * `.spec.` or `.test.` with a script extension.
 *
 * The watch mode uses it to decide whether a file below `source` can be a test;
 * `test.entries` still decides which tests a run selects.
 *
 * @param file a file name or a path.
 */
export function isTestFileName(file: string): boolean {
  return /\.(?:spec|test)\.[cm]?[jt]sx?$/.test(file);
}

/**
 * The glob that selects the test files of one entry.
 *
 * @param entry a directory of `test.entries`.
 */
function toTestFileGlob(entry: string): string {
  // A glob is written with `/` on every platform, and Windows accepts `\` in a
  // path, so the separators are normalized before the pattern is built.
  return `${toPosix(entry).replace(/\/+$/, "")}/${TEST_FILE_GLOB}`;
}

/**
 * Resolve `test.entries` and `test.exclude` into the paths of the test files to
 * run.
 *
 * The result is sorted and de-duplicated, so that overlapping directories bundle
 * every file exactly once. Globs skip hidden entries, like in tinyglobby, so a
 * test file inside a dot directory is only selected by an entry that starts
 * inside it.
 *
 * @param entries `test.entries` as configured.
 * @param exclude `test.exclude` as configured.
 * @param root the directory the entries are relative to, the project root.
 * @returns The paths of the matched test files, relative to `root`.
 */
export async function resolveTestEntries(
  entries: string | string[],
  exclude: string[] = [],
  root?: string,
): Promise<string[]> {
  const files = await glob(toArray(entries).map(toTestFileGlob), {
    absolute: false,
    cwd: root,
    ignore: exclude.map(toPosix),
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
 * `node:path` folds the same segments `pathe` would (`./`, `//`, `..`), so the
 * quoting rule needs no extra dependency; the separators are made POSIX, which
 * `pathe` does implicitly.
 *
 * @param path a file path.
 */
function normalizeExactPathMatch(path: string): string {
  const normalized = toPosix(normalize(path));
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
 * Vitest and Rstest, where narrowing by pattern is done by the configuration.
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
 * @param files the test files `entries` and `exclude` selected.
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
