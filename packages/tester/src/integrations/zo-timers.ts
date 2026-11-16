/**
 * The timer members of `zo`, built on `@sinonjs/fake-timers`: a trimmed version of
 * Vitest's `FakeTimers` (state on top of `withGlobal()`), not an implementation.
 *
 * The clock target is a parameter rather than `globalThis` on purpose: the
 * runtime passes the page's `window`, while a unit test must pass its own object
 * — faking `globalThis` inside a test fakes the Vitest runner's timers and hangs
 * the run.
 *
 * @see https://vitest.dev/api/vi#vi-usefaketimers
 */
import type { Clock, Config, FakeMethod, FakeTimers, GlobalObject } from "@sinonjs/fake-timers";
import { withGlobal } from "@sinonjs/fake-timers";

/**
 * The options of `zo.useFakeTimers()`: the `@sinonjs/fake-timers` config plus the
 * object the clock is installed on.
 */
export interface ZoTimersConfig extends Config {
  /**
   * The object whose timers are faked, instead of the test page's `window`: pass
   * the window the code under test schedules on (e.g. a Zotero progress window),
   * since a clock installed on the page does not affect any other window.
   *
   * @default window (the test page)
   */
  global?: object;
}

/**
 * The timer members of `zo`, i.e. what this module contributes to the
 * namespace. `Zo` (`./zo.ts`) extends it.
 */
export interface ZoTimers {
  /**
   * Fake the timers of the page, same as `vi.useFakeTimers()`. Time only moves
   * when the test moves it with one of the `advance*` / `run*` members.
   *
   * `config` is passed through to `@sinonjs/fake-timers`, plus `global` to clock
   * another window than the test page; the defaults match Vitest (all timers the
   * environment has, except `nextTick` and `queueMicrotask`; missing timers
   * ignored; native timers cleared on uninstall; a loop limit of 10000).
   *
   * Unlike spies, fake timers are **not** left installed: the test runtime
   * uninstalls them after every test, see `test-runtime-setup.ts`.
   *
   * @see https://vitest.dev/api/vi#vi-usefaketimers
   */
  useFakeTimers: (config?: ZoTimersConfig) => void;
  /**
   * Restore the real timers, same as `vi.useRealTimers()`. It does nothing when
   * timers were not faked, and the test runtime calls it after every test.
   *
   * @see https://vitest.dev/api/vi#vi-userealtimers
   */
  useRealTimers: () => void;
  /**
   * Move the clock forward by `ms` and run the timers scheduled within, same as
   * `vi.advanceTimersByTime()`. Throws when timers are not faked.
   *
   * @see https://vitest.dev/api/vi#vi-advancetimersbytime
   */
  advanceTimersByTime: (ms: number) => void;
  /**
   * The async variant of `advanceTimersByTime()`, same as
   * `vi.advanceTimersByTimeAsync()`: it also awaits the promises the timers
   * resolve, so `await` inside a timer callback is settled before it returns.
   *
   * @see https://vitest.dev/api/vi#vi-advancetimersbytimeasync
   */
  advanceTimersByTimeAsync: (ms: number) => Promise<void>;
  /**
   * Run every timer which is scheduled, same as `vi.runAllTimers()`. Throws an
   * infinite loop error when a timer keeps scheduling itself (the library's
   * `loopLimit`), and when timers are not faked.
   *
   * @see https://vitest.dev/api/vi#vi-runalltimers
   */
  runAllTimers: () => void;
  /**
   * The async variant of `runAllTimers()`, same as `vi.runAllTimersAsync()`.
   *
   * @see https://vitest.dev/api/vi#vi-runalltimersasync
   */
  runAllTimersAsync: () => Promise<void>;
  /**
   * How many timers are waiting on the clock, same as `vi.getTimerCount()`
   * (Sinon calls it `clock.countTimers()`). Throws when timers are not faked.
   *
   * @see https://vitest.dev/api/vi#vi-gettimercount
   */
  getTimerCount: () => number;
}

/**
 * The `loopLimit` Vitest installs with: the number of timers `runAllTimers()`
 * runs before it decides the suite is looping forever.
 */
const DEFAULT_LOOP_LIMIT = 10000;

/**
 * The error Vitest throws when a test advances a clock it never installed. The
 * message names the call to make, because that is the only way out.
 */
const NOT_FAKING_MESSAGE = "A function to advance timers was called but the timers APIs are not mocked.\n"
  + "Call `zo.useFakeTimers()` in the test file first.";

/**
 * Create the timer members of `zo` for one global object.
 *
 * @param global the object whose timers are faked, i.e. `window` on the test
 * page. Its timers are read once, here, so that `useRealTimers()` restores the
 * real ones rather than whatever a previous `install()` left behind.
 */
export function createZoTimers(global: object): ZoTimers {
  // One `withGlobal()` per faked object, created before its first `install()`:
  // `timers` is the snapshot of the real implementations, and `install()`
  // patches the object in place. Cached, so that a second `install()` on the
  // same object restores the same real timers.
  const contexts = new Map<object, FakeTimers>();

  function contextFor(target: object): FakeTimers {
    let context = contexts.get(target);
    if (!context) {
      context = withGlobal(target as GlobalObject);
      contexts.set(target, context);
    }
    return context;
  }

  let clock: Clock | undefined;

  /**
   * The installed clock, or a thrown error naming the missing
   * `useFakeTimers()` call. Only `useRealTimers()` returns without a clock: it
   * has to be a no-op, because the runtime calls it after every test whether
   * the test faked timers or not.
   */
  function fakingClock(): Clock {
    if (!clock)
      throw new Error(NOT_FAKING_MESSAGE);
    return clock;
  }

  return {
    useFakeTimers(config: ZoTimersConfig = {}): void {
      // A second install would overwrite the patched globals with the fakes of
      // the first one, and the real timers would be lost for good.
      clock?.uninstall();

      const { global: target = global, ...installConfig } = config;
      const context = contextFor(target);

      // Vitest's dynamic default: every timer this environment has, except the
      // two microtask schedulers (faking them breaks the promise queue the test
      // itself runs on). The browser has neither, the filter keeps the default
      // correct if one ever appears.
      const toFake: FakeMethod[] = installConfig.toFake
        ?? (Object.keys(context.timers) as FakeMethod[])
          .filter(name => name !== "nextTick" && name !== "queueMicrotask");

      clock = context.install({
        now: Date.now(),
        loopLimit: DEFAULT_LOOP_LIMIT,
        shouldClearNativeTimers: true,
        // A page is not guaranteed to have every timer (no `setImmediate` in
        // Gecko), and a fake timers suite should not depend on that.
        ignoreMissingTimers: true,
        ...installConfig,
        toFake,
      });
    },

    useRealTimers(): void {
      clock?.uninstall();
      clock = undefined;
    },

    advanceTimersByTime(ms: number): void {
      fakingClock().tick(ms);
    },

    async advanceTimersByTimeAsync(ms: number): Promise<void> {
      await fakingClock().tickAsync(ms);
    },

    runAllTimers(): void {
      fakingClock().runAll();
    },

    async runAllTimersAsync(): Promise<void> {
      await fakingClock().runAllAsync();
    },

    getTimerCount(): number {
      return fakingClock().countTimers();
    },
  };
}
