import type { ZoteroPoolOptions } from "./options.js";
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
import { ZoteroPoolWorker } from "./pool-worker.js";

/**
 * The pool object passed to vitest's `pool` option.
 *
 * The signature intentionally avoids referencing vitest's own types: the
 * declaration bundler (rolldown-plugin-dts) inlines dependency types, and an
 * inlined `PoolRunnerInitializer` copy would be nominally incompatible with
 * the type the user's `vitest/config` resolves. `createPoolWorker: any` stays
 * structurally assignable to vitest's `PoolRunnerInitializer`.
 */
export interface ZoteroPool {
  readonly name: string;
  createPoolWorker: (options: any) => any;
}

export function zoteroPool(options: ZoteroPoolOptions = {}): ZoteroPool {
  return {
    name: "zotero",
    createPoolWorker: poolOptions => new ZoteroPoolWorker(poolOptions, options),
  };
}

export type { ZoteroPoolOptions };
export { TESTER_PLUGIN_ID } from "./options.js";
