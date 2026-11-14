/**
 * The assertions and the test interface of `zotero-plugin test`, exposed as
 * `zotero-plugin-scaffold/test`.
 *
 * Everything the public entry exposes lives here: Vitest's `expect`, the Chai
 * interfaces, Mocha's BDD functions and the types. `./page.ts` is the browser
 * build of this module, `src/test.ts` is the package entry
 * (`zotero-plugin-scaffold/test`) which re-exports it.
 */
export { assert, chai, expect, should } from "./expect.js";
export type { Expect } from "./expect.js";
export {
  after,
  afterEach,
  before,
  beforeEach,
  context,
  describe,
  it,
  specify,
  xcontext,
  xdescribe,
  xit,
  xspecify,
} from "./mocha.js";
export type {
  AsymmetricMatchersContaining,
  AsyncExpectationResult,
  ExpectationResult,
  ExpectStatic,
  JestAssertion,
  Matchers,
  MatchersObject,
  MatcherState,
  RawMatcherFn,
  SyncExpectationResult,
  Tester,
} from "@vitest/expect";
