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
 *       { test: { name: "unit", include: ["test/unit/**"], pool: "forks" } },
 *       { test: { name: "zotero", include: ["test/zotero/**"], pool: zoteroPool() } },
 *     ],
 *   },
 * });
 * ```
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

// Only one project may use the pool: every project would otherwise boot its
// own Zotero against the same profile/data dir and tester plugin output,
// racing on shared resources. Multiple groups of tests belong in one project
// (a single include list) instead.
let poolCount = 0;

export function zoteroPool(options: ZoteroPoolOptions = {}): ZoteroPool {
  poolCount++;
  if (poolCount > 1) {
    throw new Error(
      "[zotero-pool] Only one project may use zoteroPool(). Multiple zotero "
      + "projects would each boot a Zotero against the same profile, data dir "
      + "and tester plugin output. Put all Zotero tests in one project and "
      + "extend its include list instead.",
    );
  }
  return {
    name: "zotero",
    createPoolWorker: poolOptions => new ZoteroPoolWorker(poolOptions, options),
  };
}

export type { ZoteroPoolOptions };
export { TESTER_PLUGIN_ID } from "./options.js";
