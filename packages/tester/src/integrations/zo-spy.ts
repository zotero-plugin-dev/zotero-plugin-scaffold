/**
 * The spy members of `zo`: the `@vitest/spy` part, declared next to the
 * assembly which contributes them (the counterpart of `./zo-timers.ts`).
 */
import type * as SpyTypes from "@vitest/spy";
import * as spy from "@vitest/spy";

/**
 * The spy members of `zo`. `Zo` (`./zo.ts`) extends it.
 */
export interface ZoSpy {
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

/**
 * Create the spy members of `zo`. `@vitest/spy` keeps its registry globally, so
 * there is no per-instance state.
 */
export function createZoSpy(): ZoSpy {
  return {
    fn: spy.fn,
    spyOn: spy.spyOn,
    isMockFunction: spy.isMockFunction,
    clearAllMocks: spy.clearAllMocks,
    resetAllMocks: spy.resetAllMocks,
    restoreAllMocks: spy.restoreAllMocks,
  };
}
