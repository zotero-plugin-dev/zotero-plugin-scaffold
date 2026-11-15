/**
 * The API registry of the test runtime.
 *
 * It is the single source of truth for two things that used to be spread over
 * the code base:
 *
 * 1. the export set of the public facade (`src/api/index.ts`) and of the
 *    bundler shim (`src/shim/index.ts`),
 * 2. the specifier set intercepted by the esbuild `onResolve` plugin in
 *    `test-bundler.ts`.
 *
 * The facade and the shim are published static files, so "derived from the
 * registry" means *hand written, guarded by a consistency unit test*
 * (`src/apis.test.ts`) rather than generated at build time.
 *
 * The globals the runtime installs are **not** listed here: `window.expect` /
 * `window.assert` / `window.chai` in `test-runtime-setup.ts` are three plain
 * assignments whose types come from `@types/chai`, and deriving them from the
 * registry buys nothing while costing a lookup table that can disagree with
 * itself.
 *
 * Adding a new library (e.g. `@vitest/expect`, `sinon`) should cost one
 * dependency, one registry entry and one line each in the shim and the
 * runtime.
 */
export interface TestApiModule {
  /** The module specifier intercepted by the onResolve plugin */
  id: string;
  /** The export names of the shim, i.e. the test API surface */
  exports: string[];
}

export const TEST_API_MODULES: TestApiModule[] = [
  {
    id: "mocha",
    // The globals injected by mocha's `bdd` interface,
    // see mocha/lib/interfaces/bdd.js.
    exports: [
      "describe",
      "context",
      "xdescribe",
      "xcontext",
      "it",
      "specify",
      "xit",
      "xspecify",
      "before",
      "after",
      "beforeEach",
      "afterEach",
    ],
  },
  {
    id: "chai",
    // `assert` is also mounted on `globalThis` to keep bare globals of existing
    // tests working; `use` / `config` / `chai` / `default` expose the chai
    // namespace so that `chai.use(plugin)` keeps working.
    exports: [
      "assert",
      "use",
      "config",
      "chai",
      "default",
    ],
  },
  {
    id: "@vitest/expect",
    // Jest-style `expect`, created from `@vitest/expect` on top of chai by
    // `src/expect.ts` and mounted on `globalThis` by the test runtime. It
    // replaces chai's plain `expect` in the test API surface.
    exports: [
      "expect",
    ],
  },
];

/** All module ids intercepted by the onResolve plugin. */
export const TEST_API_IDS: string[] = TEST_API_MODULES.map(m => m.id);

/** The union of all export names, i.e. the expected shim surface. */
export const TEST_API_EXPORTS: string[] = [
  ...new Set(TEST_API_MODULES.flatMap(m => m.exports)),
];
