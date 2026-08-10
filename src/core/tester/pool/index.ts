/**
 * Zotero test pool for vitest — the public entry point.
 *
 * Usage (user project's vitest.config.ts):
 *
 * ```ts
 * import { defineConfig } from "vitest/config";
 * import { zoteroPool } from "zotero-plugin-scaffold/vitest";
 *
 * export default defineConfig({
 *   test: {
 *     projects: [
 *       { test: { name: "unit", include: ["test/unit/**"], pool: "forks" } },
 *       { test: { name: "zotero", include: ["test/zotero/**"], pool: zoteroPool() } },
 *     ],
 *   },
 * });
 * ```
 */
import type { PoolOptions, PoolRunnerInitializer } from "vitest/node";
import type { ZoteroPoolOptions } from "./options.js";
import { ZoteroPoolWorker } from "./pool-worker.js";

export function zoteroPool(options: ZoteroPoolOptions = {}): PoolRunnerInitializer {
  return {
    name: "zotero",
    createPoolWorker: (poolOptions: PoolOptions) => new ZoteroPoolWorker(poolOptions, options),
  };
}

export type { ZoteroPoolOptions };
export { TESTER_PLUGIN_ID } from "./options.js";
