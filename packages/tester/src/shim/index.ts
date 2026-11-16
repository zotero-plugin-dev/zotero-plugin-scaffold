/**
 * The bundler shim: the target of the esbuild `onResolve` plugin. It re-exports
 * what the test runtime (`src/test-runtime-setup.ts`) installed as globals, so a
 * test bundle never inlines nor re-instantiates a test library.
 *
 * The type-only imports of `mocha` / `chai` also keep `@types/mocha` and
 * `@types/chai` in the compile program (without them `globalThis.describe` is
 * TS7017). `isolatedDeclarations` forces the rest: aliased type imports (else
 * TS2440 / TS2395), an explicit type on every `export const` (TS9010), and reads
 * of undeclared chai globals through an assertion on `globalThis`. A namespace
 * library only changes its `integrations/*.ts` interface, never this file.
 */

import type * as ChaiTypes from "chai";
import type * as MochaTypes from "mocha";
import type { Expect } from "../integrations/expect.js";
import type { Zo } from "../integrations/zo.js";

if (typeof (globalThis as { Zotero?: unknown }).Zotero === "undefined") {
  throw new Error(
    "The zotero-plugin-scaffold test API is only available inside the Zotero"
    + " test environment (import it from a *.spec.ts / *.test.ts test file).",
  );
}

type TestGlobals = typeof globalThis & {
  chai: typeof ChaiTypes;
  expect: Expect;
  assert: typeof ChaiTypes.assert;
  /**
   * The `zo` namespace object, installed by the test runtime and read back under
   * the `Zo` interface of `integrations/zo.ts`.
   */
  __TEST_ZO__: Zo;
};
const g = globalThis as TestGlobals;

export const describe: MochaTypes.SuiteFunction = globalThis.describe;
export const context: MochaTypes.SuiteFunction = globalThis.context;
export const xdescribe: MochaTypes.PendingSuiteFunction = globalThis.xdescribe;
export const xcontext: MochaTypes.PendingSuiteFunction = globalThis.xcontext;
export const it: MochaTypes.TestFunction = globalThis.it;
export const specify: MochaTypes.TestFunction = globalThis.specify;
export const xit: MochaTypes.PendingTestFunction = globalThis.xit;
export const xspecify: MochaTypes.PendingTestFunction = globalThis.xspecify;
export const before: MochaTypes.HookFunction<MochaTypes.Hook> = globalThis.before;
export const after: MochaTypes.HookFunction<MochaTypes.Hook> = globalThis.after;
export const beforeEach: MochaTypes.HookFunction<MochaTypes.Hook> = globalThis.beforeEach;
export const afterEach: MochaTypes.HookFunction<MochaTypes.Hook> = globalThis.afterEach;

export const expect: Expect = g.expect;
export const assert: typeof ChaiTypes.assert = g.assert;
// chai namespace re-export, so that `chai.use(plugin)` keeps working.
// It is exposed both as a named export (in line with the facade) and as the
// default export (in line with `import chai from "chai"`).
export const use: typeof ChaiTypes.use = g.chai.use;
export const config: typeof ChaiTypes.config = g.chai.config;
// NOTE: `export default g.chai` is an error under isolatedDeclarations
// (TS9039, private name), so it goes through an annotated constant.
export const chai: typeof ChaiTypes = g.chai;
export default chai;

/**
 * The `zo` namespace, the stand-in for Vitest's `vi`.
 *
 * A single object instead of one export per factory: `zo.fn()`,
 * `zo.spyOn()` and the timer members (`zo.useFakeTimers()`, …) are one
 * discoverable surface, and they cannot collide with the names of the plugin
 * under test.
 *
 * @see ../integrations/zo.js
 */
export const zo: Zo = g.__TEST_ZO__;

// The type of the Jest-style `expect`, for consumers which declare the bare
// globals themselves (`const expect: Expect`).
export type { Expect } from "../integrations/expect.js";
// The type of the `zo` namespace, for consumers which declare it themselves.
export type { Zo } from "../integrations/zo.js";
