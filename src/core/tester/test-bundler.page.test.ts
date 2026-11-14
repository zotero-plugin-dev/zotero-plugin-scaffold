import type { Context } from "../../types/index.js";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { beforeAll, describe, expect, it } from "vitest";
import { TestBundler } from "./test-bundler.js";

const FIXTURE_DIR = join(".scaffold", "page-fixture");
const CONTENT_DIR = ".scaffold/test/resource/content";
const PORT = 12_345;

const FIXTURE = `
import { assert, describe, expect, it } from "zotero-plugin-scaffold/test";

describe("assertions", () => {
  it("has the jest matchers", () => {
    expect(1 + 1).toBe(2);
    expect({ a: 1, b: 2 }).toEqual(expect.objectContaining({ a: 1 }));
    expect(() => {
      throw new TypeError("boom");
    }).toThrow(TypeError);
  });

  it("keeps chai", () => {
    expect(1).to.equal(1);
    assert.isTrue(true);
  });

  it("fails with a jest message", () => {
    expect({ a: 1 }).toEqual({ a: 2 });
  });

  it("declares two assertions but makes one", () => {
    expect.assertions(2);
    expect(1).toBe(1);
  });
});
`;

const context = {
  test: {
    // `entries` are glob patterns, so they need forward slashes on Windows
    entries: [
      FIXTURE_DIR.replaceAll("\\", "/"),
    ],
    startupDelay: 0,
    waitForPlugin: "() => true",
    mocha: { timeout: 5000 },
    abortOnFail: false,
    watch: false,
  },
} as unknown as Context;

interface PageSandbox {
  [key: string]: unknown;
  globalThis: PageSandbox;
  window: PageSandbox;
}

type Listener = (...args: unknown[]) => void;

/** One event the page posted to the reporter. */
interface ReportedEvent {
  type: string;
  data?: {
    passed?: number;
    failed?: number;
    title?: string;
    error?: { message?: string };
  };
}

/** A minimal stand-in for the browser environment of the test page. */
function createPage(options: { withReporter: boolean; exitOnFinish?: boolean }) {
  const requests: ReportedEvent[] = [];
  const order: string[] = [];
  const runnerListeners: Record<string, Listener[]> = {};
  const tests: { title: string; fn: () => void }[] = [];
  const hooks: { type: string; fn: () => void }[] = [];

  const sandbox = {
    console,
    Event: globalThis.Event,
    EventTarget: globalThis.EventTarget,
    describe: (_title: string, fn: () => void) => fn(),
    it: (title: string, fn: () => void) => tests.push({ title, fn }),
    beforeEach: (fn: () => void) => hooks.push({ type: "beforeEach", fn }),
    afterEach: (fn: () => void) => hooks.push({ type: "afterEach", fn }),
    document: {
      getElementById: () => ({ textContent: "" }),
    },
    Mocha: {
      reporters: {
        Base: {
          symbols: { ok: "v", err: "x" },
        },
      },
    },
    mocha: {
      run: () => {},
      setup: (config: { reporter: new (runner: unknown) => unknown }) => {
        if (options.withReporter) {
          const Reporter = config.reporter;
          void new Reporter({
            on: (event: string, fn: Listener) => (runnerListeners[event] ??= []).push(fn),
          });
        }
      },
    },
    Zotero: {
      automatedTest: true,
      HTTP: {
        request: async (_method: string, _url: string, config: { body: string }) => {
          const event = JSON.parse(config.body) as ReportedEvent;
          requests.push(event);
          order.push(String(event.type));
          return { status: 200, responseText: "{}" };
        },
      },
      Utilities: {
        Internal: {
          quit: () => order.push("quit"),
        },
      },
    },
    __scaffoldConfig: {
      port: PORT,
      timeout: 5000,
      abortOnFail: false,
      exitOnFinish: options.exitOnFinish ?? false,
    },
  } as unknown as PageSandbox;
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;

  const emit = (event: string, ...args: unknown[]) => runnerListeners[event]?.forEach(fn => fn(...args));

  return {
    emit,
    hooks,
    order,
    requests,
    runnerListeners,
    sandbox,
    tests,
  };
}

/** Runs one test with the mocha hooks around it, returning the outcome. */
async function runTest(test: { title: string; fn: () => void }, hooks: { type: string; fn: () => void }[]) {
  const result: string[] = [];
  hooks.filter(hook => hook.type === "beforeEach").forEach(hook => hook.fn());

  try {
    test.fn();
    result.push("pass");
  }
  catch (error) {
    result.push(`fail: ${(error as Error).message}`);
  }

  hooks.filter(hook => hook.type === "afterEach").forEach((hook) => {
    try {
      hook.fn();
    }
    catch (error) {
      result.push(`afterEach: ${(error as Error).message}`);
    }
  });

  return result;
}

// The page runtime is prebuilt, so this suite needs a built copy of scaffold
// (CI builds before it tests, run `pnpm build` locally first).
describe.skipIf(!existsSync("dist/page/test-api.js"))("the generated test page", () => {
  beforeAll(async () => {
    await mkdir(FIXTURE_DIR, { recursive: true });
    await writeFile(join(FIXTURE_DIR, "example.spec.ts"), FIXTURE);
    await new TestBundler(context, PORT).generate();
  });

  it("ships the prebuilt page runtime", async () => {
    const html = await readFile(join(CONTENT_DIR, "index.xhtml"), "utf-8");

    for (const file of [
      "mocha.js",
      "test-api.js",
      "mocha-setup.js",
      "units/example.spec.js",
    ])
      expect(existsSync(join(CONTENT_DIR, file))).toBe(true);

    // The page only gets a configuration object, no source is inlined into the
    // XML document any more.
    expect(html).toContain(`window.__scaffoldConfig = {"port":${PORT}`);
    expect(html).not.toContain("function ");
    expect(html).not.toContain("chai.js");
  });

  it("exposes the assertion API to the test files", async () => {
    const page = createPage({ withReporter: false });

    runInNewContext(await readFile(join(CONTENT_DIR, "test-api.js"), "utf-8"), page.sandbox);
    runInNewContext(await readFile(join(CONTENT_DIR, "units/example.spec.js"), "utf-8"), page.sandbox);

    // The Mocha hooks of `mocha-setup.js` check `expect.assertions()`
    runInNewContext(await readFile(join(CONTENT_DIR, "mocha-setup.js"), "utf-8"), page.sandbox);

    expect(await runTest(page.tests[0], page.hooks)).toEqual(["pass"]);
    expect(await runTest(page.tests[1], page.hooks)).toEqual(["pass"]);
    expect(await runTest(page.tests[2], page.hooks)).toEqual([
      "fail: expected { a: 1 } to deeply equal { a: 2 }",
    ]);
    expect(await runTest(page.tests[3], page.hooks)).toEqual([
      "pass",
      "afterEach: expected number of assertions to be 2, but got 1",
    ]);
  });

  it("streams the results of mocha to the reporter", async () => {
    const page = createPage({ withReporter: true, exitOnFinish: true });

    runInNewContext(await readFile(join(CONTENT_DIR, "mocha-setup.js"), "utf-8"), page.sandbox);

    const test = {
      title: "should pass",
      fullTitle: () => "suite should pass",
      duration: 1,
      speed: "fast",
    };
    page.emit("start");
    page.emit("suite", { title: "suite", root: false });
    page.emit("pass", test);
    page.emit("fail", test, new TypeError("boom"));
    page.emit("end");

    // `quit` has to wait for the summary, otherwise CI never sees it
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(page.order).toEqual([
      "start",
      "suite",
      "pass",
      "fail",
      "end",
      "quit",
    ]);
    expect(page.requests.find(event => event.type === "fail")?.data).toMatchObject({
      title: "should pass",
      error: { message: "boom" },
    });
    expect(page.requests.find(event => event.type === "end")?.data).toMatchObject({ passed: 1, failed: 1 });
  });

  it("cleans the fixture", async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
  });
});
