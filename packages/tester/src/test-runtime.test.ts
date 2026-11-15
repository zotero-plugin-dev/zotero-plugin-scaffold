import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { build } from "esbuild";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApiPlugin, resolveRuntimeEntry } from "./test-bundler.js";
import { VITEST_SPY_MARKER } from "./test-markers.js";

/**
 * End-to-end acceptance test of the spy integration (RFC-0004, §5.1): the real
 * `test-runtime.js` bundle plus a real test unit bundle — the two files the test
 * page loads — evaluated in a `node:vm` context that only provides what a
 * Zotero page provides.
 *
 * It is the only place where `zo.fn()` / `zo.spyOn()` are checked against the
 * `toHaveBeenCalled*` matchers *as the user writes them*, i.e. through
 * `zotero-plugin-scaffold/test` and the runtime's global installation. The unit
 * tests next to it only cover the pieces in isolation.
 *
 * The context is deliberately bare: no `require`, no Node globals. If the
 * runtime needs something the Zotero page does not have (or the reverse), this
 * test is where it shows up.
 */

const SAMPLE_TEST = `import { describe, expect, it, zo } from "zotero-plugin-scaffold/test";

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

interface HarnessResult {
  failures: number;
  failMessages: string[];
}

describe("test runtime spy integration", () => {
  let dir: string;
  let runtimeCode: string;
  let unitCode: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "scaffold-runtime-"));
    await mkdir(join(dir, "test"), { recursive: true });
    const entry = join(dir, "test", "sample.spec.ts");
    await writeFile(entry, SAMPLE_TEST, "utf8");

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
    });
    runtimeCode = runtime.outputFiles.map(file => file.text).join("\n");

    // The test unit, exactly as `bundleTests()` builds it (`zotero-plugin-scaffold/test`
    // is redirected to the shim, so the bundle stays spy-free).
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
    unitCode = unit.outputFiles.map(file => file.text).join("\n");
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("ships the spy library inside the runtime, not inside the test unit", () => {
    expect(runtimeCode).toContain(VITEST_SPY_MARKER);
    expect(unitCode).not.toContain(VITEST_SPY_MARKER);
  });

  it("runs the zo namespace from the test API against the spy matchers", async () => {
    const requests: unknown[] = [];
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

    const ctx = vm.createContext(sandbox);
    // The two scripts the test page loads, in the order it loads them.
    vm.runInContext(runtimeCode, ctx, { filename: "test-runtime.js" });
    vm.runInContext(unitCode, ctx, { filename: "units/sample.spec.js" });

    // `WeakRef` / `FinalizationRegistry` back the mock bookkeeping of the spy
    // library; the page has them, but a bare VM context is worth checking.
    expect(vm.runInContext("typeof WeakRef", ctx)).toBe("function");
    expect(vm.runInContext("typeof FinalizationRegistry", ctx)).toBe("function");

    // `index.xhtml` runs mocha last; the harness waits for the run instead.
    const result = vm.runInContext(
      `new Promise((resolve) => {
        const failMessages = [];
        const runner = mocha.run(() => resolve({ failures: runner.stats.failures, failMessages }));
        runner.on("fail", (test, error) => failMessages.push(String(error && error.message)));
      })`,
      ctx,
    ) as Promise<HarnessResult>;

    const outcome = await result;
    expect(outcome.failMessages).toEqual([]);
    expect(outcome.failures).toBe(0);

    // A mocha run that collects nothing also reports zero failures: pin the
    // three sample tests down, so a broken installation cannot pass silently.
    const passed = requests
      .filter(event => (event as { type?: string }).type === "pass")
      .map(event => (event as { data: { title: string } }).data.title);
    expect(passed).toEqual([
      "records the calls of zo.fn()",
      "wraps an existing method with zo.spyOn()",
      "fails on a non-spy",
    ]);
    expect(requests.some(event => (event as { type?: string }).type === "end")).toBe(true);
  });
});
