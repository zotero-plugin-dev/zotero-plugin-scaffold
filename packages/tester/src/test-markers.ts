/**
 * Strings that only a test library itself contains.
 *
 * The bundle purity tests use them to tell "the library is in this bundle" from
 * "the library is not": a matcher or mock *name* would not do, because a sample
 * test is free to call `toHaveBeenCalled()` or `vi.fn()` in an assertion, and
 * the check would then pass on a bundle that contains no library code at all.
 *
 * They are shared because three test files check the same libraries from
 * opposite sides: the purity test of the test bundles, the purity test of the
 * prebuilt runtime, and the runtime test which evaluates it.
 */

/**
 * The symbol key `@vitest/expect` registers its matcher state under,
 * i.e. `Symbol.for("$$jest-matchers-object")`.
 */
export const VITEST_EXPECT_MARKER: string = "$$jest-matchers-object";

/**
 * The module-private registry of mocks to restore inside `@vitest/spy`.
 * `@vitest/expect` does not contain it.
 */
export const VITEST_SPY_MARKER: string = "MOCK_FINALIZER";

/**
 * A field of the `Clock` state of `@sinonjs/fake-timers`, which only exists for
 * running under Node's `timers` modules. Nothing a test writes contains it.
 */
export const FAKE_TIMERS_MARKER: string = "timersPromisesModuleMethods";
