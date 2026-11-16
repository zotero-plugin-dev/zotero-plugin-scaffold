/**
 * The Jest-style `expect`: Vitest's `@vitest/expect` Chai plugins on top of Chai,
 * so that both matcher styles work in the test page (`expect(1).toBe(1)`,
 * `expect(1).to.equal(1)`).
 *
 * `src/test-runtime-setup.ts` installs the instance on the page, `src/shim/index.ts`
 * only reads it back, so no test bundle contains a second copy. Bundled into
 * `content/test-runtime.js`, not a published entry point on its own.
 */
import type { ExpectStatic, MatchersObject, Tester } from "@vitest/expect";
import {
  addCustomEqualityTesters,
  ASYMMETRIC_MATCHERS_OBJECT,
  chai,
  ChaiStyleAssertions,
  customMatchers,
  getState,
  GLOBAL_EXPECT,
  JestAsymmetricMatchers,
  JestChaiExpect,
  JestExtend,
  setState,
} from "@vitest/expect";

/**
 * The Jest-style `expect` API, Chai's own assertions are still available
 * on it (`expect(1).to.equal(1)`).
 *
 * @see https://vitest.dev/api/expect
 */
export interface Expect extends ExpectStatic {
  /**
   * Chai's `assert` interface, the same object as the `assert` global.
   */
  assert: Chai.AssertStatic;
  /**
   * Register custom equality testers, same as `expect.addEqualityTesters` in Vitest.
   *
   * @see https://vitest.dev/api/expect#addequalitytesters
   */
  addEqualityTesters: (testers: Tester[]) => void;
  /**
   * Asserts that the current test has made exactly `count` assertions.
   *
   * @see https://vitest.dev/api/expect#assertions
   */
  assertions: (count: number) => void;
  /**
   * Asserts that the current test has made at least one assertion.
   *
   * @see https://vitest.dev/api/expect#hasassertions
   */
  hasAssertions: () => void;
  /**
   * Fails the test with the given message.
   *
   * @see https://vitest.dev/api/expect#unreachable
   */
  unreachable: (message?: string) => never;
  /**
   * Not supported: soft assertions need a test runner that can collect them,
   * which Mocha cannot do here.
   */
  soft: (...args: unknown[]) => never;
  /**
   * Not supported: `expect.poll` relies on Vitest's runner state.
   */
  poll: (...args: unknown[]) => never;
}

// `JestExtend` adds `extend` on `chai.expect` at runtime,
// Chai's own type definition does not know about it.
function chaiExtend(expect: ExpectStatic, matchers: MatchersObject): void {
  (chai.expect as unknown as {
    extend: (expect: ExpectStatic, matchers: MatchersObject) => void;
  }).extend(expect, matchers);
}

function unsupported(name: string, hint: string): never {
  throw new Error(`${name}() is not supported by zotero-plugin-scaffold: ${hint}`);
}

let chaiPluginsInstalled = false;

/**
 * Creates a Jest-style `expect` instance on top of Chai.
 *
 * The test runtime creates a single instance for the whole page and installs
 * it as the bare `expect` global; the Chai plugins are registered on the first
 * call only.
 */
export function createExpect(): Expect {
  // The plugins are registered on chai itself, not on the instance: `chai.use`
  // is process wide, which is how Vitest sets it up as well. They patch
  // `chai.Assertion`, so the `chai` namespace exported for `chai.use(plugin)`
  // gains the Jest matchers too — intended, and the reason this is gated on a
  // module level flag instead of running once per instance.
  if (!chaiPluginsInstalled) {
    chaiPluginsInstalled = true;
    chai.use(JestExtend);
    chai.use(JestChaiExpect);
    chai.use(ChaiStyleAssertions);
    chai.use(JestAsymmetricMatchers);
  }

  const expect = ((value: unknown, message?: string) => {
    const { assertionCalls } = getState(expect);
    setState({ assertionCalls: assertionCalls + 1 }, expect);
    return chai.expect(value, message);
  }) as unknown as Expect;

  // `chai.expect` carries Chai's own assertions (`expect(1).to.equal(1)`),
  // the asymmetric matchers have to be copied as well so that
  // `expect.any()` / `expect.objectContaining()` are available.
  Object.assign(expect, chai.expect);
  Object.assign(expect, (globalThis as unknown as Record<symbol, object>)[ASYMMETRIC_MATCHERS_OBJECT]);

  expect.getState = () => getState(expect);
  expect.setState = state => setState(state, expect);

  setState({
    assertionCalls: 0,
    isExpectingAssertions: false,
    isExpectingAssertionsError: null,
    expectedAssertionsNumber: null,
    expectedAssertionsNumberErrorGen: null,
  }, expect);

  expect.assert = chai.assert;
  expect.extend = matchers => chaiExtend(expect, matchers);
  expect.addEqualityTesters = testers => addCustomEqualityTesters(testers);

  expect.soft = () => unsupported("expect.soft", "it needs Vitest's test runner to collect the failures, use a regular assertion instead.");
  expect.poll = () => unsupported("expect.poll", "it relies on Vitest's runner state, use `await` with your own retry loop instead.");

  expect.unreachable = (message) => {
    const detail = message
      ? ` "${message}" `
      : " ";
    chai.assert.fail(`expected${detail}not to be reached`);
  };

  expect.assertions = (count) => {
    const errorGen = () => new Error(
      `expected number of assertions to be ${count}, but got ${expect.getState().assertionCalls}`,
    );
    if (Error.captureStackTrace)
      Error.captureStackTrace(errorGen(), expect.assertions);

    expect.setState({
      expectedAssertionsNumber: count,
      expectedAssertionsNumberErrorGen: errorGen,
    });
  };

  expect.hasAssertions = () => {
    const error = new Error("expected any number of assertion, but got none");
    if (Error.captureStackTrace)
      Error.captureStackTrace(error, expect.hasAssertions);

    expect.setState({
      isExpectingAssertions: true,
      isExpectingAssertionsError: error,
    });
  };

  // `toHaveBeenCalled*` and friends, available once mocks (`@vitest/spy`) are used.
  expect.extend(customMatchers);

  // Some matchers look the current instance up through this symbol, see
  // `GLOBAL_EXPECT` in `@vitest/expect`.
  if (!Object.hasOwn(globalThis, GLOBAL_EXPECT)) {
    Object.defineProperty(globalThis, GLOBAL_EXPECT, {
      value: expect,
      writable: true,
      configurable: true,
    });
  }

  return expect;
}

/**
 * The `expect.assertions()` / `expect.hasAssertions()` bookkeeping Mocha
 * cannot do by itself.
 *
 * Vitest's runner resets the expect state before every test and verifies the
 * declared assertion count afterwards; the test runtime plugs these two
 * functions into Mocha's root hooks instead.
 */
export function createAssertionStateChecks(target: Expect): {
  reset: () => void;
  verify: () => void;
} {
  return {
    reset(): void {
      setState({
        assertionCalls: 0,
        expectedAssertionsNumber: null,
        expectedAssertionsNumberErrorGen: null,
        isExpectingAssertions: false,
        isExpectingAssertionsError: null,
      }, target);
    },
    verify(): void {
      const state = getState(target);

      if (state.expectedAssertionsNumber != null && state.assertionCalls !== state.expectedAssertionsNumber) {
        throw state.expectedAssertionsNumberErrorGen
          ? state.expectedAssertionsNumberErrorGen()
          : new Error(`expected number of assertions to be ${state.expectedAssertionsNumber}, but got ${state.assertionCalls}`);
      }

      if (state.isExpectingAssertions && state.assertionCalls === 0) {
        throw state.isExpectingAssertionsError
          ?? new Error("expected any number of assertion, but got none");
      }
    },
  };
}
