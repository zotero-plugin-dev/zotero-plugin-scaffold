/**
 * The bundler shim: the target of the esbuild `onResolve` plugin.
 *
 * It must not import any runtime value from mocha/chai — it only reads the
 * globals that the test runtime (`src/test-runtime-setup.ts`) installed, so
 * that a test bundle never inlines (nor re-instantiates) a test library.
 *
 * The types come from mocha/chai through type-only namespace imports, which
 * also keeps `@types/mocha` / `@types/chai` inside the compile program: without
 * the import, `@types/mocha`'s globals are not part of the program at all and
 * `globalThis.describe` is a TS7017 error.
 *
 * Rules this file obeys (enforced by `isolatedDeclarations`):
 *
 * - the type-only imports are aliased, otherwise they merge with the local
 *   declarations (TS2440 / TS2395);
 * - every `export const` carries an explicit type annotation (TS9010);
 * - `@types/chai` does not declare global `expect` / `assert` (TS7017), so
 *   they are read through an assertion on `globalThis`;
 * - the chai side is annotated with type queries (`typeof ChaiTypes.assert`)
 *   and the Jest-style `expect` with the `Expect` interface of
 *   `src/expect.ts`, while the mocha side uses interface types
 *   (`MochaTypes.SuiteFunction`): `@types/chai` only exports those members as
 *   values, it has no `AssertStatic` / `Config` interface to name.
 */

import type * as ChaiTypes from "chai";
import type * as MochaTypes from "mocha";
import type { Expect } from "../expect.js";

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

// The type of the Jest-style `expect`, for consumers which declare the bare
// globals themselves (`const expect: Expect`).
export type { Expect } from "../expect.js";
