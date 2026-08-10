import type { WorkerStateLike } from "./state.js";
/**
 * birpc client for the in-page worker, mirroring vitest's `createRuntimeRpc`
 * (packages/vitest/src/runtime/rpc.ts).
 *
 * Task trees contain cyclic references (`file.file`), so the wire format is
 * flatted — JSON.stringify would throw on cyclic values. Note that flatted's
 * output is a JSON *array*, so both ends must flatted-parse it back.
 */
import { createBirpc } from "birpc";
import { parse as flattedParse, stringify as flattedStringify } from "flatted";

/** Errors don't survive JSON serialization; convert them explicitly. */
export function errorReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: value.cause instanceof Error ? errorReplacer("", value.cause) : value.cause,
      ...Object.fromEntries(Object.entries(value)),
    };
  }
  return value;
}

export interface PageRpc {
  rpc: any;
  /** Callbacks registered by birpc; feed non-request messages here. */
  onMessageCallbacks: Array<(message: unknown) => void>;
}

/**
 * @param post sends a raw birpc message to the host (no response marker).
 */
export function createPageRpc(
  post: (message: unknown) => void,
  state: WorkerStateLike,
): PageRpc {
  const onMessageCallbacks: Array<(message: unknown) => void> = [];
  const rpc = createBirpc(
    {
      async onCancel(reason: unknown) {
        state.current = undefined;
        void reason;
      },
    },
    {
      eventNames: ["onCancel"],
      timeout: -1,
      post,
      on: cb => onMessageCallbacks.push(cb),
      serialize: value => flattedStringify(value, errorReplacer),
      // dispatch() already flatted-parses request messages; birpc messages
      // arrive as strings here (or as objects from a wrapping layer).
      deserialize: value => (typeof value === "string" ? flattedParse(value) : value),
    },
  );
  return { rpc, onMessageCallbacks };
}
