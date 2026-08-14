import type { WorkerStateLike } from "./state.js";
import { describe, expect, it } from "vitest";
import { serializeError } from "./error-catcher.js";

/** Minimal WorkerStateLike for serializeError (type-only surface). */
function fakeState(current?: { type: string; name: string }, filepath?: string): WorkerStateLike {
  return {
    current,
    filepath,
  } as unknown as WorkerStateLike;
}

describe("serializeError", () => {
  it("stringifies non-object errors with attribution fields", () => {
    const serialized = serializeError("boom", fakeState()) as Record<string, unknown>;
    expect(serialized.message).toBe("boom");
    expect(serialized.VITEST_TEST_NAME).toBeUndefined();
    expect(serialized.VITEST_TEST_PATH).toBeUndefined();
  });

  it("keeps name/message/stack of Error objects", () => {
    const error = new Error("kaboom");
    error.name = "CustomError";
    const serialized = serializeError(error, fakeState()) as Record<string, unknown>;
    expect(serialized.name).toBe("CustomError");
    expect(serialized.message).toBe("kaboom");
    expect(serialized.stack).toContain("CustomError: kaboom");
  });

  it("attributes to the current test and file path", () => {
    const serialized = serializeError(
      new Error("x"),
      fakeState({ type: "test", name: "does a thing" }, "src/a.test.ts"),
    ) as Record<string, unknown>;
    expect(serialized.VITEST_TEST_NAME).toBe("does a thing");
    expect(serialized.VITEST_TEST_PATH).toBe("src/a.test.ts");
  });

  it("does not attribute when the current task is not a test", () => {
    const serialized = serializeError(
      new Error("x"),
      fakeState({ type: "suite", name: "root" }),
    ) as Record<string, unknown>;
    expect(serialized.VITEST_TEST_NAME).toBeUndefined();
  });
});
