import type { Zo } from "./zo.js";
import * as chai from "chai";
import { afterEach, describe, expect, it } from "vitest";
import { createExpect } from "./expect.js";
import { createZoSpy } from "./zo-spy.js";
import { createZoTimers } from "./zo-timers.js";

/**
 * The `zo` namespace exercised through the public facade — the path a test file
 * takes (`zotero-plugin-scaffold/test` → shim → the object the runtime installs).
 * The runtime itself is covered by `test-runtime.test.ts` in a VM; here only the
 * globals it would install are stubbed, before the dynamic facade import.
 */
const jestExpect = createExpect();
const g = globalThis as unknown as Record<string, unknown>;
g.Zotero ??= {};
// Real chai and real assemblies, so the fixture cannot drift from the shim's
// contract; the timers get a throwaway target rather than `globalThis`, or a
// leaked clock would freeze the Vitest worker.
g.chai ??= chai;
g.expect ??= jestExpect;
g.assert ??= chai.assert;
g.__TEST_ZO__ ??= {
  ...createZoSpy(),
  ...createZoTimers({}),
} satisfies Zo;

const { zo } = await import("../api/index.js");

/**
 * Nothing resets these mocks automatically (see `docs/src/test.md`), so the
 * suite does what it asks of its users.
 */
afterEach(() => {
  zo.restoreAllMocks();
  zo.resetAllMocks();
});

describe("zo.fn", () => {
  it("creates a callable spy", () => {
    const mock = zo.fn();

    expect(zo.isMockFunction(mock)).toBe(true);
    mock("a", 1);

    expect(mock.mock.calls).toEqual([
      ["a", 1],
    ]);
    jestExpect(mock).toHaveBeenCalled();
    jestExpect(mock).toHaveBeenCalledTimes(1);
    jestExpect(mock).toHaveBeenCalledOnce();
    jestExpect(mock).toHaveBeenCalledWith("a", 1);
    jestExpect(mock).toHaveBeenLastCalledWith("a", 1);
    jestExpect(mock).toHaveBeenNthCalledWith(1, "a", 1);
    jestExpect(mock).toHaveBeenCalledExactlyOnceWith("a", 1);
  });

  it("keeps the implementation passed to it", () => {
    const mock = zo.fn((n: number) => n + 1);

    expect(mock(1)).toBe(2);
    expect(mock.mock.results[0]).toEqual({ type: "return", value: 2 });
  });

  it("names mocks like vitest does by default", () => {
    // `vi.fn()` is the name `getMockName` falls back to, i.e. the string the
    // library prints for an unnamed mock.
    expect(zo.fn().getMockName()).toBe("vi.fn()");
    expect(zo.fn().mockName("greet").getMockName()).toBe("greet");
  });

  it("rejects non-spies", () => {
    expect(() => jestExpect(() => {}).toHaveBeenCalled()).toThrow(/is not a spy or a call to a spy/);
  });

  it("orders spies with invocationCallOrder", () => {
    const first = zo.fn();
    const second = zo.fn();

    first();
    second();

    jestExpect(first).toHaveBeenCalledBefore(second);
    jestExpect(second).toHaveBeenCalledAfter(first);
  });
});

describe("zo.spyOn", () => {
  it("replaces an existing method and keeps delegating to it", () => {
    const greeter = {
      greet: (name: string) => `hi ${name}`,
    };
    const mock = zo.spyOn(greeter, "greet");

    expect(greeter.greet("a")).toBe("hi a");
    expect(mock.mock.calls).toEqual([
      ["a"],
    ]);
    expect(mock.mock.results[0]).toEqual({ type: "return", value: "hi a" });
    jestExpect(mock).toHaveBeenCalledWith("a");
  });

  it("does not restore the method by itself", () => {
    const greeter = {
      greet: (name: string) => `hi ${name}`,
    };
    const mock = zo.spyOn(greeter, "greet");

    // Nothing in the test runtime restores mocks: the spied method stays a spy
    // (and leaks into every later test) until `zo.restoreAllMocks()` is called.
    // This is why the documentation asks for `afterEach(zo.restoreAllMocks)`.
    expect(zo.isMockFunction(mock)).toBe(true);
    expect(zo.isMockFunction(greeter.greet)).toBe(true);

    zo.restoreAllMocks();

    expect(zo.isMockFunction(greeter.greet)).toBe(false);
    expect(greeter.greet("b")).toBe("hi b");
  });
});

describe("zo mock bookkeeping", () => {
  it("clears the call history without touching the implementation", () => {
    const mock = zo.fn(() => 1);

    mock();
    zo.clearAllMocks();
    expect(mock.mock.calls).toEqual([]);
    expect(mock()).toBe(1);
  });

  it("resets the implementation as well", () => {
    const mock = zo.fn();
    mock.mockReturnValue(1);
    expect(mock()).toBe(1);

    zo.resetAllMocks();
    // `fn()` without an implementation resets to a function returning undefined;
    // `fn(impl)` would reset to `impl`, which is what the library documents.
    expect(mock()).toBeUndefined();
  });
});
