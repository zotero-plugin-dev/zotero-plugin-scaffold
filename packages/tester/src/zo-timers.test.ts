import type { ZoTimers } from "./zo-timers.js";
import { afterEach, describe, expect, it } from "vitest";
import { createZoTimers } from "./zo-timers.js";

/**
 * `src/zo-timers.ts` is a wrapper, so this suite covers the wrapper: which
 * clock is installed where, what `useRealTimers()` restores, the defaults, and
 * the error the members throw without a clock. That a fake clock freezes time
 * and that `tickAsync()` awaits async timers is `@sinonjs/fake-timers`' job, and
 * `test-runtime.test.ts` exercises it once through the path a user takes.
 *
 * `createZoTimers(global)` takes the object whose timers are faked, so this
 * suite never hands it `globalThis`: installing a clock there fakes the timers
 * of the Vitest runner itself and the run hangs.
 */

/** A plain object with the timers a page has, and no `process` / microtasks. */
function createHost(): Record<string, unknown> & {
  setTimeout: typeof setTimeout;
  Date: DateConstructor;
} {
  return {
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    // The library only creates its `*Async` clock members on a global which has
    // a promise constructor.
    Promise,
  };
}

let zoTimers: ZoTimers | undefined;

function setup(): { host: ReturnType<typeof createHost>; timers: ZoTimers } {
  const host = createHost();
  const timers = createZoTimers(host);
  zoTimers = timers;
  return { host, timers };
}

/** A clock left installed would leak into the harness itself. */
afterEach(() => {
  zoTimers?.useRealTimers();
  zoTimers = undefined;
});

const notFaking = /timers APIs are not mocked[\s\S]*zo\.useFakeTimers\(\)/;

describe("zo.useFakeTimers", () => {
  it("passes the config through, over the defaults", () => {
    const { host, timers } = setup();

    // `now` wins over the `Date.now()` the wrapper would install by default.
    timers.useFakeTimers({ now: 1_000 });

    expect(host.Date.now()).toBe(1_000);
  });

  it("keeps Vitest's loop limit", () => {
    const { host, timers } = setup();
    const reschedule = (): void => {
      host.setTimeout(reschedule, 1);
    };

    timers.useFakeTimers();
    host.setTimeout(reschedule, 1);

    expect(() => timers.runAllTimers()).toThrow(/Aborting after running 10000 timers/);
  });

  it("fakes the given object instead of the page", () => {
    const { host, timers } = setup();
    const other = createHost();

    timers.useFakeTimers({
      global: other,
      toFake: ["setTimeout"],
    });

    expect(other.setTimeout).not.toBe(setTimeout);
    // `toFake` reached the library: the other host keeps its real `Date`.
    expect(other.Date).toBe(Date);
    expect(host.setTimeout).toBe(setTimeout);
    expect(host.Date).toBe(Date);
  });

  it("can be installed twice and still restore the real timers", () => {
    const { host, timers } = setup();

    timers.useFakeTimers();
    timers.useFakeTimers();
    timers.useRealTimers();

    expect(host.setTimeout).toBe(setTimeout);
    expect(host.Date).toBe(Date);
  });
});

describe("zo.useRealTimers", () => {
  it("restores what it replaced", () => {
    const { host, timers } = setup();
    const other = createHost();

    timers.useFakeTimers();
    timers.useRealTimers();
    expect(host.setTimeout).toBe(setTimeout);

    timers.useFakeTimers({ global: other });
    timers.useRealTimers();
    expect(other.setTimeout).toBe(setTimeout);
  });

  it("does nothing when timers were not faked", () => {
    const { host, timers } = setup();

    // The test runtime calls it after every test, faked or not.
    expect(() => timers.useRealTimers()).not.toThrow();
    expect(host.setTimeout).toBe(setTimeout);
  });
});

describe("zo.getTimerCount", () => {
  it("counts the timers of the installed clock", () => {
    const { host, timers } = setup();
    const other = createHost();

    timers.useFakeTimers();
    host.setTimeout(() => {}, 100);
    expect(timers.getTimerCount()).toBe(1);

    // The count belongs to the clock which is installed, not to the page.
    timers.useFakeTimers({
      global: other,
      toFake: ["setTimeout"],
    });
    expect(timers.getTimerCount()).toBe(0);
  });
});

describe("zo without a clock", () => {
  it("throws the error which names useFakeTimers()", async () => {
    const { timers } = setup();

    expect(() => timers.advanceTimersByTime(100)).toThrow(notFaking);
    expect(() => timers.runAllTimers()).toThrow(notFaking);
    expect(() => timers.getTimerCount()).toThrow(notFaking);
    await expect(timers.advanceTimersByTimeAsync(100)).rejects.toThrow(notFaking);
    await expect(timers.runAllTimersAsync()).rejects.toThrow(notFaking);
  });
});
