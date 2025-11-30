import type { Stats } from "node:fs";
import chokidar from "chokidar";
import { debounce } from "es-toolkit";
import { logger } from "./logger.js";
import { toArray } from "./string.js";

export function watch(
  source: string | string[],
  ignore: string | string[] | RegExp | RegExp[],
  event: {
    onReady?: () => any;
    onChange: (path: string) => any | Promise<any>;
    onAdd?: (path: string, stats: Stats) => any | Promise<any>;
    onError?: (err: unknown) => any;
  },
): void {
  const watcher = chokidar.watch(source, {
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
