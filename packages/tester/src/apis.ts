/**
 * The API registry: the single source of truth for the export set of the facade
 * (`src/api/index.ts`) and the shim (`src/shim/index.ts`), and for the specifiers
 * intercepted by the `onResolve` plugin in `test-bundler.ts`.
 *
 * Both are published static files, so "derived from the registry" means *hand
 * written and guarded by `apis.test.ts`*, not generated at build time. The
 * globals the runtime installs are not listed here: they are plain assignments
 * in `test-runtime-setup.ts` whose types come from `@types/chai`.
 *
 * A module whose exports are collected into the `zo` namespace
 * (`src/integrations/zo.ts`) names it in `namespace`: the facade then exposes one
 * `zo`, and its members are reached as `zo.<name>`.
 *
 * Adding a library costs one dependency, one registry entry and one line each in
 * the shim and the runtime — `@sinonjs/fake-timers` joined that way, needing no
 * shim line at all because `zo` is a single object there.
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
    // `src/integrations/expect.ts` and mounted on `globalThis` by the test runtime. It
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
