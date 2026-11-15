import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { build } from "esbuild";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNodeBuiltinStubPlugin, createTestApiPlugin, resolveRuntimeEntry } from "./test-bundler.js";
import { FAKE_TIMERS_MARKER, VITEST_SPY_MARKER } from "./test-markers.js";

/**
 * End-to-end acceptance test of the integrations behind `zo` (RFC-0004 §5.1 for
 * the spies, RFC-0005 §6 for the timers): the real `test-runtime.js` bundle plus
 * a real test unit bundle — the two files the test page loads — evaluated in a
 * `node:vm` context that only provides what a Zotero page provides.
 *
 * It is the only place where `zo.fn()` / `zo.spyOn()` are checked against the
 * `toHaveBeenCalled*` matchers, and where a fake clock is installed on the
 * global a test actually sees, *as the user writes them*, i.e. through
 * `zotero-plugin-scaffold/test` and the runtime's global installation. The unit
 * tests next to it only cover the pieces in isolation.
 *
 * The context is deliberately bare: no `require`, no Node globals. If the
 * runtime needs something the Zotero page does not have (or the reverse), this
 * test is where it shows up.
 */

const SAMPLE_SPY_TEST = `import { describe, expect, it, zo } from "zotero-plugin-scaffold/test";

describe("spy", () => {
  it("records the calls of zo.fn()", () => {
    const mock = zo.fn();
    mock("a", 1);

    expect(mock).toHaveBeenCalled();
    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock).toHaveBeenCalledWith("a", 1);
  });

  it("wraps an existing method with zo.spyOn()", () => {
    const greeter = { greet: (name) => "hi " + name };
    const mock = zo.spyOn(greeter, "greet");

    expect(greeter.greet("bob")).toBe("hi bob");
    expect(mock).toHaveBeenCalledWith("bob");
  });

  it("fails on a non-spy", () => {
    expect(() => expect(1).toHaveBeenCalled()).toThrow(/is not a spy or a call to a spy/);
  });
});
`;

/**
 * The fake timers sample, i.e. what the documentation tells a user to write.
 *
 * The last two tests are one scenario: the first fakes the clock and never
 * uninstalls it, the second asserts that the runtime did it anyway (RFC-0005
 * §4.4). Mocha runs the tests of a suite in order, so they stay neighbours.
 */
const SAMPLE_TIMERS_TEST = `import { describe, expect, it, zo } from "zotero-plugin-scaffold/test";

describe("timers", () => {
  it("advances the timers and the clock", () => {
    zo.useFakeTimers();
    const start = Date.now();
    const fired = [];
    setTimeout(() => fired.push(Date.now()), 1000);

    expect(fired).toEqual([]);

    zo.advanceTimersByTime(1000);

    expect(fired).toEqual([start + 1000]);
    expect(Date.now()).toBe(start + 1000);
  });

  it("runs every timer, awaiting the async ones", async () => {
    zo.useFakeTimers();
    const seen = [];
    setTimeout(async () => {
      await Promise.resolve();
      seen.push("first");
    }, 10);
    setTimeout(() => seen.push("second"), 20);

    await zo.runAllTimersAsync();

    expect(seen).toEqual(["first", "second"]);
  });

  it("restores the real timers", () => {
    zo.useFakeTimers({ now: 0 });
    expect(Date.now()).toBe(0);

    zo.useRealTimers();

    expect(Date.now()).toBeGreaterThan(0);
  });

  it("rejects advancing a clock it never installed", () => {
    expect(() => zo.advanceTimersByTime(100)).toThrow(/zo.useFakeTimers/);
  });

  it("forgets to uninstall the clock", () => {
    zo.useFakeTimers({ now: 1000 });

    expect(Date.now()).toBe(1000);
  });

  it("starts the next test with real timers", async () => {
    expect(Date.now()).toBeGreaterThan(1000);

    // A real timer, running on its own: the clock of the test above is gone.
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
});
`;

interface HarnessResult {
  failures: number;
  failMessages: string[];
}

interface PageRun {
  outcome: HarnessResult;
  /** The events the runtime reporter posted, one per mocha event. */
  requests: unknown[];
  /** The page context, for the few globals worth checking by hand. */
  ctx: vm.Context;
}

/** The globals a Zotero page provides, and nothing else. */
function createSandbox(requests: unknown[]): Record<string, unknown> {
  const sandbox = {
    console,
    // mocha's browser entry registers its own event bus and schedules the run.
    EventTarget,
    Event,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    // A page has one; the fake timers library only creates its `*Async` clock
    // members on a global which has it.
    Promise,
    // The runtime's reporter posts to the result server; nothing listens here.
    Zotero: {
      automatedTest: true,
      HTTP: {
        request: async (_method: string, _url: string, options?: { body?: string }) => {
          requests.push(JSON.parse(options?.body ?? "{}"));
          return { status: 200, responseText: "{}" };
        },
      },
      Utilities: {
        Internal: {
          quit: () => {},
        },
      },
    },
    document: {
      querySelector: () => null,
      getElementById: () => null,
    },
    // mocha's default stack-trace filter looks the page URL up.
    location: { href: "about:blank" },
    __TEST_OPTIONS__: {
      timeout: 5_000,
      port: 0,
      abortOnFail: false,
      exitOnFinish: false,
    },
  } as Record<string, unknown>;
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  // A page is a `Window`, so it has `self`: a dependency of the fake timers
  // library picks `self` over a bare `global` in its UMD fallback.
  sandbox.self = sandbox;
  return sandbox;
}

/** The titles of the tests the runtime reported as passing, in order. */
function passedTitles(requests: unknown[]): string[] {
  return requests
    .filter(event => (event as { type?: string }).type === "pass")
    .map(event => (event as { data: { title: string } }).data.title);
}

describe("test runtime integrations", () => {
  let dir: string;
  let runtimeCode: string;
  let spyCode: string;
  let timersCode: string;

  /**
   * The files the test page loads, in the order it loads them: the runtime
   * first, then the units. `index.xhtml` runs mocha last; the harness waits for
   * the run instead.
   */
  async function runInPage(codes: string[]): Promise<PageRun> {
    const requests: unknown[] = [];
    const sandbox = createSandbox(requests);
    const ctx = vm.createContext(sandbox);
    for (const [index, code] of codes.entries()) {
      vm.runInContext(code, ctx, {
        filename: index === 0
          ? "test-runtime.js"
          : `units/sample-${index}.js`,
      });
    }

    const outcome = await vm.runInContext(
      `new Promise((resolve) => {
        const failMessages = [];
        const runner = mocha.run(() => resolve({ failures: runner.stats.failures, failMessages }));
        runner.on("fail", (test, error) => failMessages.push(String(error && error.message)));
      })`,
      ctx,
    ) as HarnessResult;

    return { outcome, requests, ctx };
  }

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "scaffold-runtime-"));
    await mkdir(join(dir, "test"), { recursive: true });
    const spyEntry = join(dir, "test", "sample.spec.ts");
    const timersEntry = join(dir, "test", "timers.spec.ts");
    await writeFile(spyEntry, SAMPLE_SPY_TEST, "utf8");
    await writeFile(timersEntry, SAMPLE_TIMERS_TEST, "utf8");

    // The runtime, exactly as `buildTestRuntime()` builds it.
    const runtime = await build({
      entryPoints: [
        resolveRuntimeEntry(),
      ],
      bundle: true,
      format: "iife",
      platform: "browser",
      target: "firefox115",
      write: false,
      logLevel: "silent",
      plugins: [
        createNodeBuiltinStubPlugin(),
      ],
    });
    runtimeCode = runtime.outputFiles.map(file => file.text).join("\n");

    // The test units, exactly as `bundleTests()` builds them
    // (`zotero-plugin-scaffold/test` is redirected to the shim, so the bundles
    // stay free of the test libraries).
    const bundleUnit = async (entry: string): Promise<string> => {
      const unit = await build({
        entryPoints: [entry],
        bundle: true,
        platform: "browser",
        target: "firefox115",
        write: false,
        logLevel: "silent",
        absWorkingDir: dir,
        plugins: [
          createTestApiPlugin(),
        ],
      });
      return unit.outputFiles.map(file => file.text).join("\n");
    };
    spyCode = await bundleUnit(spyEntry);
    timersCode = await bundleUnit(timersEntry);
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("ships the test libraries inside the runtime, not inside the test units", () => {
    expect(runtimeCode).toContain(VITEST_SPY_MARKER);
    expect(runtimeCode).toContain(FAKE_TIMERS_MARKER);

    for (const unit of [spyCode, timersCode]) {
      expect(unit).not.toContain(VITEST_SPY_MARKER);
      expect(unit).not.toContain(FAKE_TIMERS_MARKER);
    }
  });

  it("runs the zo namespace from the test API against the spy matchers", async () => {
    const { outcome, requests, ctx } = await runInPage([runtimeCode, spyCode]);

    // `WeakRef` / `FinalizationRegistry` back the mock bookkeeping of the spy
    // library; the page has them, but a bare VM context is worth checking.
    expect(vm.runInContext("typeof WeakRef", ctx)).toBe("function");
    expect(vm.runInContext("typeof FinalizationRegistry", ctx)).toBe("function");

    expect(outcome.failMessages).toEqual([]);
    expect(outcome.failures).toBe(0);
    // A mocha run that collects nothing also reports zero failures: pin the
    // three sample tests down, so a broken installation cannot pass silently.
    expect(passedTitles(requests)).toEqual([
      "records the calls of zo.fn()",
      "wraps an existing method with zo.spyOn()",
      "fails on a non-spy",
    ]);
    expect(requests.some(event => (event as { type?: string }).type === "end")).toBe(true);
  });

  it("fakes the timers of the page and undoes it after every test", async () => {
    const { outcome, requests } = await runInPage([runtimeCode, timersCode]);

    expect(outcome.failMessages).toEqual([]);
    expect(outcome.failures).toBe(0);
    // Every sample test is pinned down, including the ones which prove that the
    // clock installed by a test is gone in the next one. A run which hangs
    // fails on mocha's real timeout instead, which is the point of RFC-0005 §5.2.
    expect(passedTitles(requests)).toEqual([
      "advances the timers and the clock",
      "runs every timer, awaiting the async ones",
      "restores the real timers",
      "rejects advancing a clock it never installed",
      "forgets to uninstall the clock",
      "starts the next test with real timers",
    ]);
    expect(requests.some(event => (event as { type?: string }).type === "end")).toBe(true);
  });
});
