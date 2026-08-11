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
 *       { test: { name: "unit", include: ["test/unit/**"], pool: "forks",
 *                 sequence: { groupOrder: 1 } } },
 *       { test: { name: "zotero", include: ["test/zotero/**"],
 *                 isolate: false, fileParallelism: false, pool: zoteroPool() } },
 *     ],
 *   },
 * });
 * ```
 *
 * Multiple projects may configure zoteroPool() — e.g. one project per module,
 * run individually with `vitest --project=<name>`. What must not happen is
 * two of them booting a Zotero against the *same* profile/data dir at the
 * same time; that race is guarded at runtime in the pool worker.
 *
 * Notes on running all projects together (`vitest run`):
 * - Vitest groups projects by `sequence.groupOrder` and requires the same
 *   `maxWorkers` within a group. zoteroPool() pins maxWorkers to 1 via
 *   `fileParallelism: false`, so plain parallel projects must get a distinct
 *   `sequence.groupOrder` (as above) or vitest aborts with a
 *   "different 'maxWorkers'" error.
 * - Several zotero projects in one run boot their Zoteros one at a time
 *   (maxWorkers is 1 for the whole group); each uses its own derived
 *   profile/data dir, so they never contend for resources.
 */
import type { PoolRunnerInitializer } from "vitest/node";
import type { ZoteroPoolOptions } from "./options.js";
import { ZoteroPoolWorker } from "./pool-worker.js";

/**
 * The pool object passed to vitest's `pool` option.
 *
 * createPoolWorker is typed via vitest's PoolRunnerInitializer. The
 * declaration file imports the type instead of inlining it, so the user's
 * own vitest version (a peer dependency) provides the definition.
 */
export interface ZoteroPool {
  readonly name: string;
  createPoolWorker: PoolRunnerInitializer["createPoolWorker"];
}

export function zoteroPool(options: ZoteroPoolOptions = {}): ZoteroPool {
  return {
    name: "zotero",
    createPoolWorker: poolOptions => new ZoteroPoolWorker(poolOptions, options),
  };
}

export type { ZoteroPoolOptions };
export { TESTER_PLUGIN_ID } from "./options.js";
