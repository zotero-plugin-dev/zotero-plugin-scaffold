/**
 * Normalize a path to POSIX separators.
 *
 * Glob patterns and the comparisons built on them are written with `/` on every
 * platform, while `node:path` returns the separator of the platform.
 *
 * @param path a path of either separator flavour.
 */
export function toPosix(path: string): string {
  return path.replaceAll("\\", "/");
}
