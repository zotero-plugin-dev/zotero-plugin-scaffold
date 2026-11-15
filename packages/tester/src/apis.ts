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
 * A module whose exports are collected into the `zo` namespace (`src/zo.ts`)
 * names that namespace in `namespace` instead of exporting the members flat: the
 * facade then exposes one `zo`, and every member a namespace module contributes
 * is reached as `zo.<name>`.
 *
 * Adding a new library costs one dependency, one registry entry and one line
 * each in the shim and the runtime: `@sinonjs/fake-timers` joined that way, and
 * needed no shim line at all because `zo` is a single object there.
 */
export interface TestApiModule {
  /** The module specifier intercepted by the onResolve plugin */
  id: string;
  /**
   * The namespace the exports are collected into, if any. `undefined` means the
   * exports are top-level members of the test API themselves.
   */
  namespace?: string;
  /** The export names, either of the test API surface or of the namespace */
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
  {
    id: "@vitest/spy",
    // The stand-in for Vitest's `vi`, which belongs to the Vitest runner and
    // stays unavailable. Its factories create the spies the `toHaveBeenCalled*`
    // matchers above assert on; the timers of `@sinonjs/fake-timers` below are
    // the second library to contribute to the same namespace.
    namespace: "zo",
    exports: [
      "fn",
      "spyOn",
      "isMockFunction",
      "clearAllMocks",
      "resetAllMocks",
      "restoreAllMocks",
    ],
  },
  {
    id: "@sinonjs/fake-timers",
    namespace: "zo",
    exports: [
      "useFakeTimers",
      "useRealTimers",
      "advanceTimersByTime",
      "advanceTimersByTimeAsync",
      "runAllTimers",
      "runAllTimersAsync",
      "getTimerCount",
    ],
  },
];

/** All module ids intercepted by the onResolve plugin. */
export const TEST_API_IDS: string[] = TEST_API_MODULES.map(m => m.id);

/**
 * The top-level members of the test API: the exports of every module which does
 * not belong to a namespace.
 */
export const TEST_API_EXPORTS: string[] = [
  ...new Set(
    TEST_API_MODULES.filter(m => !m.namespace).flatMap(m => m.exports),
  ),
];

/** The names of the namespaces the test API exposes, e.g. `zo`. */
export const TEST_API_NAMESPACES: string[] = [
  ...new Set(
    TEST_API_MODULES.map(m => m.namespace).filter(name => name !== undefined),
  ),
];

/**
 * The expected members of one namespace, keyed by namespace name.
 */
export function testApiNamespaceMembers(): Record<string, string[]> {
  const members: Record<string, string[]> = {};
  for (const api of TEST_API_MODULES) {
    if (!api.namespace)
      continue;
    members[api.namespace] = [
      ...new Set([
        ...(members[api.namespace] ?? []),
        ...api.exports,
      ]),
    ].sort();
  }
  return members;
}
