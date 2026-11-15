import type { Stats } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import chokidar from "chokidar";
import { debounce } from "es-toolkit";
import { isDynamicPattern } from "tinyglobby";
import { logger } from "./logger.js";
import { toPosix } from "./path.js";
import { toArray } from "./string.js";

/**
 * The path to hand to chokidar for one watch target.
 *
 * Chokidar 4 dropped glob support and treats a string as an exact path, so a
 * glob is reduced to the directory it starts in. Anything else is returned as it
 * is, so a file is still watched as a file.
 *
 * @param target a file, a directory or a glob.
 */
export function toWatchPath(target: string): string {
  const pattern = toPosix(target);
  if (!isDynamicPattern(pattern))
    return target;

  // Everything before the first magic segment is the directory the glob starts
  // in: `test/unit/**\/*.spec.ts` is watched through `test/unit`.
  const segments = pattern.split("/");
  const staticPrefix = segments.slice(0, segments.findIndex(segment => isDynamicPattern(segment))).join("/");
  return staticPrefix || ".";
}

/**
 * The paths to hand to chokidar for a set of watch targets.
 *
 * Duplicates are removed, and so is a target that another one already covers:
 * watching the project root makes the source directory redundant, and chokidar
 * would report its changes twice.
 *
 * The duplicate is decided on the absolute path, so `src`, `./src`, `src/` and
 * the absolute spelling of either are one target. Deciding it on the string
 * would let two such targets cover each other and both be dropped, leaving the
 * watcher with nothing to watch.
 *
 * @param targets files, directories or globs.
 */
export function toWatchPaths(targets: string | string[]): string[] {
  // The key decides identity, the value is what chokidar receives.
  const byKey = new Map<string, string>();
  for (const target of toArray(targets)) {
    const path = toWatchPath(target);
    const key = resolve(path);
    if (!byKey.has(key))
      byKey.set(key, path);
  }

  const paths = [
    ...byKey.values(),
  ];
  return paths.filter(path =>
    !paths.some(other => other !== path && isInside(resolve(path), resolve(other))),
  );
}

/**
 * Whether a path lies strictly inside a directory.
 *
 * The directory itself is not inside itself: `toWatchPaths()` has already
 * collapsed two targets that name the same path, so a remaining equality would
 * mean a pair that covers each other, and both would be dropped.
 *
 * @param path the path to test.
 * @param directory the directory that may contain it.
 */
function isInside(path: string, directory: string): boolean {
  const relativePath = relative(directory, path);
  return relativePath !== ""
    && !relativePath.startsWith("..")
    && !isAbsolute(relativePath);
}

export function watch(
  source: string | string[],
  ignore: string | RegExp | (string | RegExp)[],
  event: {
    onReady?: () => any;
    onChange: (path: string) => any | Promise<any>;
    onAdd?: (path: string, stats: Stats) => any | Promise<any>;
    onError?: (err: unknown) => any;
  },
): void {
  const watcher = chokidar.watch(toWatchPaths(source), {
    ignored: [
      /(^|[/\\])\../, // ignore dotfiles
      /[\\/]\.git[\\/]/,
      /[\\/]node_modules[\\/]/,
      ...toArray(ignore),
    ],
    ignoreInitial: true,
    ignorePermissionErrors: true,
    persistent: true,
  });

  const onChangeDebounced = safeDebounce(event.onChange);
  const onAddDebounced = safeDebounce(event.onAdd);

  watcher
    .on("ready", async () => {
      if (event.onReady)
        await event.onReady();
      logger.clear();
      logger.ready("Server Ready!");
    })
    .on("change", async (path) => {
      logger.clear();
      logger.info(`${path} changed`);
      // Do not abort the watcher when errors occur
      // in builds triggered by the watcher.
      await onChangeDebounced(path);
    })
    .on("add", async (path, stats) => {
      if (event.onAdd)
        await onAddDebounced(path, stats);
    })
    .on("error", async (err) => {
      if (event.onError)
        await event.onError(err);
      logger.fail("Server start failed!");
      logger.error(err);
    });

  // return watcher;
}

function safeDebounce(fn?: (...args: any[]) => void) {
  if (!fn)
    return () => {};

  return debounce(async (...args) => {
    try {
      await fn(...args);
    }
    catch (error) {
      logger.error(error);
    }
  }, 500);
}
