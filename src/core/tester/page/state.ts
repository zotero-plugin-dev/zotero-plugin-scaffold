/**
 * Worker state simulation for the in-page test runner.
 *
 * Mirrors the subset of vitest's `WorkerGlobalState` that the runner and
 * protocol consume. In the final integration this is provided by the official
 * `init()` from `vitest/worker`; here it is built by hand because `init()`
 * depends on node-specific APIs (`process`, `node:module`).
 *
 * The published state also backs `vi` members that read `getWorkerState()`
 * (fake timers, setConfig, stubEnv, resetModules) — the page publishes it
 * under `globalThis.__vitest_worker__`.
 */
import type { WorkerGlobalState } from "vitest";

export interface WorkerStateLike {
  ctx: any;
  config: any;
  rpc: any;
  evaluatedModules: Map<string, unknown>;
  resolvingModules: Set<unknown>;
  moduleExecutionInfo: Map<string, unknown>;
  environment: unknown;
  durations: { environment: number; prepare: number };
  onCancel: () => void;
  onCleanup: (cb: () => unknown) => void;
  providedContext: Record<string, unknown>;
  onFilterStackTrace: (stack: string) => string;
  metaEnv: Record<string, unknown>;
  filepath?: string;
  current?: { type: string; name: string };
}

// Compile-time contract with vitest: every key this state publishes must
// exist on vitest's official WorkerGlobalState. A future vitest that renames
// or removes a field breaks this line instead of silently publishing a dead
// field. (The values are our own subset; only the key names are checked.)
type _WorkerStateKeysSubset = keyof WorkerStateLike extends keyof WorkerGlobalState ? true : never;
const _workerStateKeysCheck: _WorkerStateKeysSubset = true;

export function createWorkerState(rpc: any, config: any): WorkerStateLike {
  return {
    ctx: null,
    config,
    rpc,
    evaluatedModules: new Map(),
    resolvingModules: new Set(),
    moduleExecutionInfo: new Map(),
    environment: null,
    durations: { environment: 0, prepare: 0 },
    onCancel: () => {},
    onCleanup: () => {},
    providedContext: {},
    onFilterStackTrace: (stack: string) => stack,
    metaEnv: {},
  };
}
