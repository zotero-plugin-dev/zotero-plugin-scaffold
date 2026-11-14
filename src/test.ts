/**
 * Jest-style assertions for `zotero-plugin test`.
 *
 * Mocha provides the test structure, Chai provides the classic assertion
 * styles, and this module provides all of it: Mocha's BDD interface
 * (`describe`, `it`, the hooks), Chai's `assert`/`should`, and Vitest's
 * `@vitest/expect` on top of them, so Jest matchers work too:
 *
 * ```ts
 * import { describe, expect, it } from "zotero-plugin-scaffold/test";
 *
 * describe("Example", () => {
 *   it("works", () => {
 *     expect(1 + 1).toBe(2);
 *     expect({ a: 1 }).toEqual({ a: 1 });
 *     expect(() => { throw new TypeError("boom"); }).toThrow(TypeError);
 *   });
 * });
 * ```
 *
 * In the test page the same values are exposed as globals, so `describe`,
 * `it`, `expect` and friends keep working without an import as well.
 *
 * @see https://vitest.dev/api/expect
 * @module
 */

export * from "./core/tester/assertions/index.js";
