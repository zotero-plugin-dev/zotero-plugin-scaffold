/**
 * Console interception for the in-page runner — a port of the vitest browser
 * tester's `setupConsoleLogSpy` (a hand-rolled wrapper; the node worker's
 * `createCustomConsole` builds on node:console/node:stream and cannot run in
 * the chrome:// page).
 *
 * Output is attributed to the current task (`state.current.id`) and sent via
 * `rpc.onUserConsoleLog`; the host's `_testRun.log` prints it as `stdout |`
 * lines and feeds the reporters. The original console methods still run, so
 * the Zotero console keeps seeing everything. Respects
 * `config.disableConsoleIntercept`.
 */

import type { UserConsoleLog } from "vitest";
import type { WorkerStateLike } from "./state.js";
import { format } from "vitest/internal/browser";

// Snapshot the originals at module load: vi fake timers swap Date/performance
// later, and sendLog timing must stay real.
const { Date: RealDate, performance: RealPerformance, console: consoleRef } = globalThis;

/** Patches once per page load; later "start" requests must not re-wrap. */
let installed = false;

function sendLog(
  state: WorkerStateLike,
  type: "stdout" | "stderr",
  content: string,
  disableStack = false,
): void {
  if (content.startsWith("[vite]")) {
    return;
  }
  const taskId = state.current?.id ?? "__vitest__unknown_test__";
  const origin = state.config?.printConsoleTrace && !disableStack
    ? (new Error("STACK_TRACE").stack ?? "").split("\n").slice(1).join("\n")
    : undefined;
  const log: UserConsoleLog = {
    type,
    content,
    taskId,
    time: RealDate.now(),
    size: content.length,
    origin,
    browser: true,
  };
  state.rpc.onUserConsoleLog(log).catch(() => {});
}

function stdout(state: WorkerStateLike, base: (...args: unknown[]) => void) {
  return (...args: unknown[]): void => {
    base(...args);
    sendLog(state, "stdout", format(args, { multiline: true }));
  };
}

function stderr(state: WorkerStateLike, base: (...args: unknown[]) => void) {
  return (...args: unknown[]): void => {
    base(...args);
    sendLog(state, "stderr", format(args, { multiline: true }));
  };
}

/**
 * Wraps every console method so output reaches the host. The originals are
 * destructured once (not read through `console` at call time), so nested
 * wrappers or later patches cannot recurse through this one.
 */
export function setupConsoleLogSpy(state: WorkerStateLike): void {
  if (installed) {
    return;
  }
  installed = true;
  // Snapshot the custom-method originals at install time: nested wrappers or
  // later patches cannot recurse through this one.
  const { dir, dirxml, trace, time, timeEnd, timeLog, count, countReset } = consoleRef;

  // The simple pass-through methods only differ by their stream.
  for (const method of ["log", "debug", "info"] as const) {
    consoleRef[method] = stdout(state, consoleRef[method]);
  }
  for (const method of ["error", "warn"] as const) {
    consoleRef[method] = stderr(state, consoleRef[method]);
  }

  consoleRef.dir = (item: unknown, options?: unknown) => {
    dir(item, options);
    sendLog(state, "stdout", format([item], { multiline: true }));
  };
  consoleRef.dirxml = (...args: unknown[]) => {
    dirxml(...args);
    sendLog(state, "stdout", format(args, { multiline: true }));
  };
  consoleRef.trace = (...args: unknown[]) => {
    trace(...args);
    const content = format(args, { multiline: true });
    const error = new Error("$$Trace");
    sendLog(state, "stderr", `${content}\n${state.onFilterStackTrace(error.stack ?? "")}`, true);
  };

  const timeLabels: Record<string, number> = {};
  consoleRef.time = (label = "default") => {
    time(label);
    timeLabels[label] = RealPerformance.now();
  };
  consoleRef.timeLog = (label = "default") => {
    timeLog(label);
    if (!(label in timeLabels)) {
      sendLog(state, "stderr", `Timer "${label}" does not exist`);
    }
    else {
      sendLog(state, "stdout", `${label}: ${timeLabels[label]} ms`);
    }
  };
  consoleRef.timeEnd = (label = "default") => {
    timeEnd(label);
    const end = RealPerformance.now();
    const start = timeLabels[label];
    if (!(label in timeLabels)) {
      sendLog(state, "stderr", `Timer "${label}" does not exist`);
    }
    else if (typeof start !== "undefined") {
      sendLog(state, "stdout", `${label}: ${end - start} ms`);
    }
  };

  const countLabels: Record<string, number> = {};
  consoleRef.count = (label = "default") => {
    count(label);
    const counter = (countLabels[label] ?? 0) + 1;
    countLabels[label] = counter;
    sendLog(state, "stdout", `${label}: ${counter}`);
  };
  consoleRef.countReset = (label = "default") => {
    countReset(label);
    countLabels[label] = 0;
  };
}
