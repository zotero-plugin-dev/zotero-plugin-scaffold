/**
 * Reports unhandled page errors over the rpc channel — a port of vitest
 * browser's `error-catcher.js` to our transport. The chrome:// page has no
 * `process` event bus, so unlike the node worker (`listenForErrors` +
 * `process.on("uncaughtException")`) the listeners hang off the window:
 *   window "error"             → onUnhandledError(err, "Error")
 *   window "unhandledrejection" → onUnhandledError(err, "Unhandled Rejection")
 *
 * The host side (`vitest.state.catchError`) records the error in the run
 * state, so a page crash fails the run (summary + exit code) instead of only
 * producing a warn log line via the template's inline /debug catcher.
 */

import type { WorkerStateLike } from "./state.js";

/**
 * Errors raised before the "start" handshake (host not listening for rpc
 * messages yet) are buffered and flushed by `flushUnhandledErrors()`.
 */
let pending: Array<{ type: string; error: unknown }> = [];
let ready = false;
let stateRef: WorkerStateLike | null = null;

/** Error → plain object, with test attribution from the worker state. */
export function serializeError(unhandledError: unknown, state: WorkerStateLike): unknown {
  const VITEST_TEST_NAME = state.current && state.current.type === "test"
    ? state.current.name
    : undefined;
  const VITEST_TEST_PATH = state.filepath;
  if (typeof unhandledError !== "object" || !unhandledError) {
    return { message: String(unhandledError), VITEST_TEST_NAME, VITEST_TEST_PATH };
  }
  const e = unhandledError as { name?: unknown; message?: unknown; stack?: unknown };
  return {
    name: e.name,
    message: e.message,
    stack: String(e.stack),
    VITEST_TEST_NAME,
    VITEST_TEST_PATH,
  };
}

/**
 * Installs window error listeners. Mirrors vitest's `catchWindowErrors`:
 * once user code adds its own listener for the same event, the page defers
 * to it (the error is assumed handled) and only falls back to a console
 * error. Returns a function that removes both listeners.
 */
function catchWindowErrors(
  errorEvent: "error" | "unhandledrejection",
  prop: "error" | "reason",
  cb: (event: { [key: string]: unknown }) => void,
): () => void {
  let userErrorListenerCount = 0;
  function throwUnhandlerError(e: unknown): void {
    const value = (e as { [key: string]: unknown })[prop];
    if (userErrorListenerCount === 0 && value != null) {
      cb(e as { [key: string]: unknown });
    }
    else {
      // ErrorEvent doesn't necessarily have `.error` (e.g. ResizeObserver);
      // some only carry `.message`.
      const message = (e as { message?: unknown }).message;
      console.error(message ? new Error(String(message)) : e);
    }
  }
  const add = window.addEventListener as unknown as (
    type: string,
    listener: (e: never) => void,
    options?: unknown,
  ) => void;
  const remove = window.removeEventListener as unknown as (
    type: string,
    listener: (e: never) => void,
    options?: unknown,
  ) => void;
  add(errorEvent, throwUnhandlerError);
  window.addEventListener = ((type: string, listener: unknown, options?: unknown) => {
    if (type === errorEvent) {
      userErrorListenerCount++;
    }
    return add(type, listener as (e: unknown) => void, options);
  }) as typeof window.addEventListener;
  window.removeEventListener = ((type: string, listener: unknown, options?: unknown) => {
    if (type === errorEvent && userErrorListenerCount) {
      userErrorListenerCount--;
    }
    return remove(type, listener as (e: unknown) => void, options);
  }) as typeof window.removeEventListener;
  return () => {
    remove(errorEvent, throwUnhandlerError);
  };
}

/** Serializes and sends one unhandled error; buffers until the handshake. */
function report(type: string, error: unknown): void {
  const state = stateRef;
  if (!state) {
    return;
  }
  if (!ready) {
    pending.push({ type, error });
    return;
  }
  // Errors don't survive the flatted wire as objects with name/message/stack
  // getters intact; serialize explicitly like vitest's error-catcher.
  state.rpc.onUnhandledError(serializeError(error, state), type).catch(() => {});
}

/**
 * Wires the page's unhandled errors into the rpc channel. Call once after
 * the worker state exists (page load); errors raised before the "start"
 * handshake are flushed by `flushUnhandledErrors()` once the host listens.
 * Returns a function that disposes both listeners.
 */
export function registerUnexpectedErrors(state: WorkerStateLike): () => void {
  stateRef = state;
  const offError = catchWindowErrors("error", "error", e => report("Error", e.error));
  const offRejection = catchWindowErrors("unhandledrejection", "reason", e => report("Unhandled Rejection", e.reason));
  return () => {
    offError();
    offRejection();
  };
}

/** Marks the channel open and delivers any buffered pre-handshake errors. */
export function flushUnhandledErrors(): void {
  ready = true;
  const queued = pending;
  pending = [];
  for (const { type, error } of queued) {
    report(type, error);
  }
}
