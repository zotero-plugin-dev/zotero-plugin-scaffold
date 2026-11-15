/**
 * The `zo` namespace: the stand-in for Vitest's `vi`.
 *
 * `vi` collects everything a test needs to fake something under one name. The
 * same is true here but more so: the flat surface would grow past twenty generic
 * names (`fn`, `spyOn`, `useFakeTimers`, `advanceTimersByTime`, …) next to
 * `describe` / `expect` / `assert`, where none of them is discoverable and any
 * of them can collide with a name of the plugin under test.
 *
 * It is also the seam for the libraries behind it: this interface is the single
 * place which says that `@vitest/spy` contributes the mock members, and that a
 * future `@sinonjs/fake-timers` contributes the timer members. The test runtime
 * builds the object from those libraries, the shim only reads it back off
 * `globalThis.__TEST_ZO__`, so no test bundle inlines any of them.
 *
 * There is deliberately no `mock` / `unmock`: module mocking needs a runner and
 * an ESM module graph to patch, neither of which exists inside a Zotero page.
 *
 * @see https://vitest.dev/api/vi
 */
import type * as SpyTypes from "@vitest/spy";

export interface Zo {
  /**
   * Create a spy, same as `vi.fn()`.
   *
   * @see https://vitest.dev/api/vi#vi-fn
   */
  fn: typeof SpyTypes.fn;
  /**
   * Wrap an existing method, same as `vi.spyOn()`. It works on existing object
   * methods only, so it usually cannot replace a binding of an imported module.
   *
   * @see https://vitest.dev/api/vi#vi-spyon
   */
  spyOn: typeof SpyTypes.spyOn;
  /**
   * Whether a value is a mock, same as `vi.isMockFunction()`.
   *
   * @see https://vitest.dev/api/vi#vi-ismockfunction
   */
  isMockFunction: typeof SpyTypes.isMockFunction;
  /**
   * Reset the call history of every spy, same as `vi.clearAllMocks()`. It keeps
   * the implementations.
   *
   * @see https://vitest.dev/api/vi#vi-clearallmocks
   */
  clearAllMocks: typeof SpyTypes.clearAllMocks;
  /**
   * Clear and reset the implementation of every spy, same as
   * `vi.resetAllMocks()`.
   *
   * @see https://vitest.dev/api/vi#vi-resetallmocks
   */
  resetAllMocks: typeof SpyTypes.resetAllMocks;
  /**
   * Undo every `spyOn()`, same as `vi.restoreAllMocks()`. Unlike Vitest, the
   * test runtime does not call it for you: suites which spy need their own
   * `afterEach(() => zo.restoreAllMocks())`.
   *
   * @see https://vitest.dev/api/vi#vi-restoreallmocks
   */
  restoreAllMocks: typeof SpyTypes.restoreAllMocks;
}
