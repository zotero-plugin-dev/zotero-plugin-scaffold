/**
 * Shared types for the in-page test runner (page/).
 *
 * These mirror the shapes of vitest's own message structures so the page
 * can be checked against the same contracts as the host. All imports are
 * type-only — the bundler erases them from the shipped setup.js/runtime.js.
 */
import type {
  RunnerTestFile,
  SerializedConfig,
  RunnerTaskEventPack as TaskEventPack,
  RunnerTaskResultPack as TaskResultPack,
} from "vitest";
import type { FileSpecification } from "vitest/internal/browser";

/**
 * The run/collect context the host sends, plus the tester manifest we attach
 * on watch rebuilds (source path → bundled artifact for the current run).
 * (Fields mirror vitest's WorkerExecuteContext; the extra `unknown` fields
 * cover the rest of the context the page does not consume.)
 */
export interface RunContext {
  files: FileSpecification[];
  invalidates?: string[];
  testerManifest?: Record<string, string>;
  providedContext?: Record<string, unknown>;
  environment?: unknown;
  workerId?: number;
  [key: string]: unknown;
}

/**
 * The page's worker-state `ctx`: the most recent request context (a start
 * context merged with the latest run/collect context). Only stored for later
 * requests to merge onto; the actual run uses the RunContext snapshot.
 */
export interface PageCtx {
  config?: SerializedConfig;
  files?: FileSpecification[];
  environment?: unknown;
  pool?: string;
  invalidates?: string[];
  testerManifest?: Record<string, string>;
}

export type { FileSpecification, RunnerTestFile, SerializedConfig, TaskEventPack, TaskResultPack };

/**
 * The host-side rpc methods the page calls (a subset of vitest's
 * `createMethodsRPC`). The page's birpc proxy is typed by this interface.
 *
 * Snapshot RPCs (`read/save/removeSnapshotFile`) are intentionally NOT wired:
 * `toMatchSnapshot` is unsupported in the pool (no snapshot environment in
 * the chrome:// page) — see docs/src/design/vitest-pool.md §3.
 */
export interface PageHostRpc {
  onQueued: (file: RunnerTestFile) => unknown;
  onCollected: (files: RunnerTestFile[]) => unknown;
  onTaskUpdate: (packs: TaskResultPack[], events: TaskEventPack[]) => unknown;
  /** Host → page cancel notification (birpc event, no response). */
  onCancel: (reason: unknown) => unknown;
}
