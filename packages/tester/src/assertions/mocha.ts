/**
 * Mocha's BDD interface, exposed by `zotero-plugin-scaffold/test` the same way
 * Vitest exposes `describe`/`it` from `vitest`.
 *
 * `mocha.setup({ ui: "bdd" })` installs these as globals of the test page, so
 * the module forwards to them (`mocha.ts` is part of the page bundle) instead of
 * importing Mocha, whose Node entry pulls in Node.js APIs.
 *
 * Only the BDD interface is provided, because that is the interface the test
 * page uses. Test files bundled for the page get the globals themselves, so
 * `it.only` / `describe.skip` keep working there.
 */
import type { HookFunction, PendingSuiteFunction, PendingTestFunction, SuiteFunction, TestFunction } from "mocha";

/** Names installed by `mocha.setup({ ui: "bdd" })`. */
export const MOCHA_BDD_NAMES = [
  "after",
  "afterEach",
  "before",
  "beforeEach",
  "context",
  "describe",
  "it",
  "specify",
  "xcontext",
  "xdescribe",
  "xit",
  "xspecify",
] as const;

/**
 * Forwards a call to the global Mocha installs on the test page.
 *
 * Kept lazy (the global is looked up per call) so that the module can be
 * imported anywhere, e.g. by the type checker or by a unit test.
 */
function bdd<T>(name: string): T {
  return function (this: unknown, ...args: unknown[]) {
    const fn = (globalThis as unknown as Record<string, unknown>)[name];

    if (typeof fn !== "function") {
      throw new TypeError(
        `\`${name}()\` is only available inside \`zotero-plugin test\`, `
        + "where Mocha installs it on the test page.",
      );
    }

    return fn.apply(this, args);
  } as unknown as T;
}

export const after: HookFunction = bdd("after");
export const afterEach: HookFunction = bdd("afterEach");
export const before: HookFunction = bdd("before");
export const beforeEach: HookFunction = bdd("beforeEach");
export const context: SuiteFunction = bdd("context");
export const describe: SuiteFunction = bdd("describe");
export const it: TestFunction = bdd("it");
export const specify: TestFunction = bdd("specify");
export const xcontext: PendingSuiteFunction = bdd("xcontext");
export const xdescribe: PendingSuiteFunction = bdd("xdescribe");
export const xit: PendingTestFunction = bdd("xit");
export const xspecify: PendingTestFunction = bdd("xspecify");
