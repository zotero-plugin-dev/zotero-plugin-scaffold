import type { ZoTimers } from "./zo-timers.js";
import { afterEach, describe, expect, it } from "vitest";
import { createZoTimers } from "./zo-timers.js";

/**
 * The fake timers wrapper, exercised through an injected host object.
 *
 * `createZoTimers(global)` takes the object whose timers are faked, so this
 * suite must never hand it `globalThis`: installing a clock there fakes the
 * timers of the Vitest runner itself and the run hangs. `test-runtime.test.ts`
 * covers the real wiring, i.e. `window` on a Zotero page.
 */

/**
 * A plain object with the timers a page has, and no `process` / microtasks.
 *
 * `Promise` is part of it because the library only creates its `*Async` clock
 * members on a global which has a promise constructor, exactly like a page.
 */
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

describe("zo.useFakeTimers", () => {
  it("freezes the clock until the test moves it", () => {
    const { host, timers } = setup();
    const fired: number[] = [];

    timers.useFakeTimers();
    host.setTimeout(() => fired.push(Date.now()), 100);

    expect(fired).toEqual([]);
    timers.advanceTimersByTime(99);
    expect(fired).toEqual([]);
    timers.advanceTimersByTime(1);
    expect(fired).toHaveLength(1);
  });

  it("fakes Date.now() and moves it with the timers", () => {
    const { host, timers } = setup();
    const realNow = Date.now();

    timers.useFakeTimers();
    // `now` defaults to the real time at install time.
    const installedAt = host.Date.now();
    expect(Math.abs(installedAt - realNow)).toBeLessThan(1_000);

    timers.advanceTimersByTime(500);
    expect(host.Date.now()).toBe(installedAt + 500);
  });

  it("takes `now` from the config", () => {
    const { host, timers } = setup();

    timers.useFakeTimers({ now: 1_000 });

    expect(host.Date.now()).toBe(1_000);
  });

  it("only fakes the timers `toFake` names", () => {
    const { host, timers } = setup();
    const realDate = host.Date;

    timers.useFakeTimers({
      toFake: ["setTimeout"],
    });

    expect(host.setTimeout).not.toBe(setTimeout);
    expect(host.Date).toBe(realDate);
  });

  it("can be installed twice without losing the real timers", () => {
    const { host, timers } = setup();

    timers.useFakeTimers();
    timers.useFakeTimers();
    timers.useRealTimers();

    expect(host.setTimeout).toBe(setTimeout);
    expect(host.Date).toBe(Date);
  });
});

describe("zo.useFakeTimers on another object", () => {
  /**
   * A plugin may schedule its delays on a window of its own — Zotero's progress
   * notification closes itself with `win.setTimeout` — which the page clock
   * cannot drive. `global` installs the clock there instead.
   */
  it("fakes the timers of the given object", () => {
    const { timers } = setup();
    const other = createHost();
    const fired: number[] = [];

    timers.useFakeTimers({ global: other });
    other.setTimeout(() => fired.push(1), 100);

    // The page is untouched: even inside the same wrapper nothing was faked.
    expect(other.setTimeout).not.toBe(setTimeout);

    timers.advanceTimersByTime(100);
    expect(fired).toEqual([1]);
  });

  it("leaves the page's own timers alone", () => {
    const { host, timers } = setup();
    const other = createHost();

    timers.useFakeTimers({ global: other });

    expect(host.setTimeout).toBe(setTimeout);
    expect(host.Date).toBe(Date);
    expect(other.Date).not.toBe(Date);
  });

  it("restores the given object", () => {
    const { timers } = setup();
    const other = createHost();

    timers.useFakeTimers({
      global: other,
      toFake: ["setTimeout"],
    });
    timers.useRealTimers();

    expect(other.setTimeout).toBe(setTimeout);
  });

  it("counts the timers of the clock it installed", () => {
    const { host, timers } = setup();

    timers.useFakeTimers();
    expect(timers.getTimerCount()).toBe(0);

    host.setTimeout(() => {}, 100);
    host.setTimeout(() => {}, 200);
    expect(timers.getTimerCount()).toBe(2);

    timers.advanceTimersByTime(100);
    expect(timers.getTimerCount()).toBe(1);

    // A more recent clock replaces the count of the older one.
    const other = createHost();
    timers.useFakeTimers({
      global: other,
      toFake: ["setTimeout"],
    });
    expect(timers.getTimerCount()).toBe(0);
  });
});

describe("zo.useRealTimers", () => {
  it("restores the real timers", () => {
    const { host, timers } = setup();
    let fired = 0;

    timers.useFakeTimers();
    timers.useRealTimers();
    // A real timer: it fires on its own, without a clock to advance.
    host.setTimeout(() => {
      fired++;
    }, 0);

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(fired).toBe(1);
        resolve();
      }, 20);
    });
  });

  it("does nothing when timers were not faked", () => {
    const { host, timers } = setup();

    expect(() => timers.useRealTimers()).not.toThrow();
    expect(host.setTimeout).toBe(setTimeout);
  });
});

describe("zo advancing the clock", () => {
  it("runs the timers scheduled by other timers", () => {
    const { host, timers } = setup();
    const calls: string[] = [];

    timers.useFakeTimers();
    host.setTimeout(() => {
      calls.push("outer");
      host.setTimeout(() => calls.push("inner"), 1_000);
    }, 100);

    timers.runAllTimers();

    expect(calls).toEqual(["outer", "inner"]);
  });

  it("awaits the promises a timer resolves", async () => {
    const { host, timers } = setup();
    const seen: string[] = [];

    timers.useFakeTimers();
    host.setTimeout(async () => {
      await Promise.resolve();
      seen.push("after await");
    }, 10);

    await timers.advanceTimersByTimeAsync(10);

    expect(seen).toEqual(["after await"]);
  });

  it("awaits every timer through runAllTimersAsync()", async () => {
    const { host, timers } = setup();
    const seen: string[] = [];

    timers.useFakeTimers();
    host.setTimeout(async () => {
      await Promise.resolve();
      seen.push("first");
      host.setTimeout(async () => {
        await Promise.resolve();
        seen.push("second");
      }, 1_000);
    }, 10);

    await timers.runAllTimersAsync();

    expect(seen).toEqual(["first", "second"]);
  });

  it("gives up on a timer which keeps rescheduling itself", () => {
    const { host, timers } = setup();
    const reschedule = (): void => {
      host.setTimeout(reschedule, 1);
    };

    timers.useFakeTimers({ loopLimit: 10 });
    host.setTimeout(reschedule, 1);

    expect(() => timers.runAllTimers()).toThrow(/Aborting after running 10 timers/);
  });
});

describe("zo without fake timers", () => {
  const notFaking = /timers APIs are not mocked[\s\S]*zo\.useFakeTimers\(\)/;

  it("rejects advancing a clock which was never installed", () => {
    const { timers } = setup();

    expect(() => timers.advanceTimersByTime(100)).toThrow(notFaking);
    expect(() => timers.runAllTimers()).toThrow(notFaking);
    expect(() => timers.getTimerCount()).toThrow(notFaking);
  });

  it("rejects the async members as well", async () => {
    const { timers } = setup();

    await expect(timers.advanceTimersByTimeAsync(100)).rejects.toThrow(notFaking);
    await expect(timers.runAllTimersAsync()).rejects.toThrow(notFaking);
  });

  it("does not advance the real clock", () => {
    const { host, timers } = setup();
    let fired = false;

    host.setTimeout(() => {
      fired = true;
    }, 0);

    expect(() => timers.advanceTimersByTime(1_000)).toThrow();

    // The real timer is still a real timer: it fires when the harness yields.
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(fired).toBe(true);
        resolve();
      }, 20);
    });
  });
});
