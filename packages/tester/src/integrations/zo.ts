/**
 * The `zo` namespace: the stand-in for Vitest's `vi`, i.e. one object instead of
 * twenty generic flat globals (`fn`, `spyOn`, `useFakeTimers`, …) which would
 * collide with names of the plugin under test.
 *
 * The members come from two libraries, declared in `./zo-spy.ts` and
 * `./zo-timers.ts`. There is deliberately no `mock` / `unmock`: module mocking
 * needs a runner and an ESM module graph, neither of which a Zotero page has.
 *
 * @see https://vitest.dev/api/vi
 */
import type { ZoSpy } from "./zo-spy.js";
import type { ZoTimers } from "./zo-timers.js";

/** The whole namespace: the two library halves, merged for the shim and the runtime. */
export interface Zo extends ZoSpy, ZoTimers {}
