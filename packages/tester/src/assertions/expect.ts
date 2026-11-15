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

export { chai };

/**
 * Chai's assertion API, same as `chai.assert` in a plain Chai setup.
 */
export const assert: Chai.AssertStatic = chai.assert;

/**
 * Chai's `should` interface, same as `chai.should` in a plain Chai setup.
 */
export const should: typeof chai.should = chai.should;

/**
 * The Jest-style `expect` API, Chai's own assertions are still available
 * on it (`expect(1).to.equal(1)`).
 *
 * @see https://vitest.dev/api/expect
 */
export interface Expect extends ExpectStatic {
  /**
   * Chai's `assert` interface, the same object as the exported `assert`.
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

/**
 * Creates a Jest-style `expect` instance on top of Chai.
 *
 * This is the same recipe Vitest uses for its own `expect`: Chai plus
 * `@vitest/expect`'s Chai plugins.
 */
export function createExpect(): Expect {
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

  return expect;
}

chai.use(JestExtend);
chai.use(JestChaiExpect);
chai.use(ChaiStyleAssertions);
chai.use(JestAsymmetricMatchers);

/**
 * The `expect` instance shared by the whole test page.
 *
 * `defineConfig({ test: ... })` cannot create a per-test instance
 * because Mocha has no Vitest-like per-test context, so a single instance
 * is used for every test file.
 */
export const expect: Expect = createExpect();

if (!Object.hasOwn(globalThis, GLOBAL_EXPECT)) {
  Object.defineProperty(globalThis, GLOBAL_EXPECT, {
    value: expect,
    writable: true,
    configurable: true,
  });
}
