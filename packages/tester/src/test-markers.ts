/**
 * Strings that only a test library itself contains.
 *
 * The bundle purity tests use them to tell "the library is in this bundle" from
 * "the library is not": a matcher or mock *name* would not do, because a sample
 * test is free to call `toHaveBeenCalled()` or `vi.fn()` in an assertion, and
 * the check would then pass on a bundle that contains no library code at all.
 *
 * They are shared because two test files check the same pair of libraries from
 * opposite sides: the purity test of the test bundles, and the runtime test
 * which evaluates the real `test-runtime.js`.
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
