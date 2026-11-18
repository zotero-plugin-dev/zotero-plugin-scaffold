/**
 * The prebuilt test runtime: bundled by `buildTestRuntime()` into
 * `content/test-runtime.js` and loaded before the test units
 * (`include.js → __TEST_OPTIONS__ → test-runtime.js → units/*.js → mocha.run()`).
 *
 * It owns the *only* mocha/chai code in the Zotero profile: test bundles import
 * `zotero-plugin-scaffold/test`, which the bundler redirects to the shim.
 * `window.__TEST_OPTIONS__` is written by `index.xhtml` itself, see `generateHtml()`.
 *
 * It is the one page-side module outside `src/integrations/` (RFC-0006 §6): it is
 * the entry `resolveRuntimeEntry()` points at, so only the library wiring moved.
 */
import type { Zo } from "./integrations/zo.js";
import type { TestRuntimeOptions } from "./types.js";
import * as chai from "chai";
import { createAssertionStateChecks, createExpect } from "./integrations/expect.js";
import { createZoSpy } from "./integrations/zo-spy.js";
import { createZoTimers } from "./integrations/zo-timers.js";
// Side-effect import of the official browser build of mocha: it attaches
// `window.mocha` / `window.Mocha` by itself. A bare `import "mocha"` would go
// through `browser-entry.js`, which pulls Node's `stream` / `util` in and
// cannot be bundled for the browser.
import "mocha/mocha.js";

const DEFAULT_TIMEOUT = 10000;

const options: TestRuntimeOptions = window.__TEST_OPTIONS__ ?? {
  timeout: DEFAULT_TIMEOUT,
  port: 0,
  abortOnFail: false,
  exitOnFinish: false,
};

/**
 * Instance uniqueness: the `setup()` below and the trailing `mocha.run()` of
 * `index.xhtml` must operate the very same instance that `mocha/mocha.js`
 * attached to the global. Never do `window.mocha = new Mocha()` — a fresh
 * instance has not been set up with an interface, so the suites registered by
 * the test units would never be collected and `mocha.run()` would run nothing.
 */
mocha.setup({
  ui: "bdd",
  reporter: Reporter as unknown as Mocha.ReporterConstructor,
  timeout: options.timeout || DEFAULT_TIMEOUT,
  bail: options.abortOnFail,
});

// Keep the bare globals of existing tests working (`expect(...)`,
// `assert.isTrue(...)`, `chai.use(plugin)`). `expect` is the Jest-style one of
// `./integrations/expect.ts`; the other two are plain chai assignments on
// purpose, so that a chai upgrade which renames one fails the build instead of
// mounting `undefined`.
const expect = createExpect();
window.expect = expect;
window.assert = chai.assert;
window.chai = chai;
// The `zo` namespace, assembled here from the libraries behind it, read back by
// the shim. It is *not* spread over `globalThis`. Nothing resets its mocks
// automatically (`spyOn()` leaks until the suite restores them, see
// `docs/src/test.md`); fake timers are the exception, see the hook below.
const zo: Zo = {
  ...createZoSpy(),
  // `window` rather than `globalThis`: the page's timers are the ones the plugin
  // under test uses.
  ...createZoTimers(window),
};
window.__TEST_ZO__ = zo;

// `expect.assertions()` / `expect.hasAssertions()` are verified by the runner
// in Vitest, here Mocha has to do it: the state is reset before every test and
// checked afterwards.
const assertionState = createAssertionStateChecks(expect);

// A leaked spy patches one object; a leaked fake clock freezes every timer of
// the window, i.e. the test reporter, Zotero's own delayed work and every later
// test. So fake timers are the one thing undone here, which is a deliberate
// departure from "nothing is reset automatically" (see `docs/src/test.md`).
// The hook runs before the assertion check, and it never throws: a throwing
// root hook makes Mocha discard the rest of the run (RFC-0003).
afterEach(() => {
  try {
    zo.useRealTimers();
  }
  catch {
    // `useRealTimers()` is a no-op when nothing was faked, so this is only
    // reachable if the library itself fails to uninstall; there is nothing
    // useful a test could do about that, and the next test's clock matters
    // more than the error.
  }
});

beforeEach(() => {
  assertionState.reset();
});

afterEach(() => {
  assertionState.verify();
});

async function send(data: unknown): Promise<unknown> {
  const req = await Zotero.HTTP.request(
    "POST",
    `http://localhost:${options.port}/update`,
    {
      body: JSON.stringify(data),
    },
  );

  if (req.status !== 200) {
    dump(`Error sending data to server${req.responseText}`);
    return null;
  }

  return JSON.parse(req.responseText);
}

window.debug = (data: unknown): void => {
  void send({ type: "debug", data });
};

let indents = 0;
let passed = 0;
let failed = 0;
const aborted = false;

function print(str: string): void {
  const output = document.querySelector<HTMLElement>("#mocha");
  if (output)
    output.appendChild(document.createTextNode(str));
}

/**
 * The reporter that streams the run to the local result server and mirrors it
 * into the test page.
 *
 * It is a plain constructor function on purpose: mocha instantiates it with
 * `new`, and its types only allow `Mocha.ReporterConstructor`.
 */
function Reporter(runner: Mocha.Runner): void {
  function indent(): string {
    return "  ".repeat(indents);
  }

  runner.on("start", async () => {
    await send({
      type: "start",
      data: { indents },
    });
  });

  runner.on("suite", async (suite) => {
    indents++;
    print(`${indent()}${suite.title}\n`);
    await send({
      type: "suite",
      data: { title: suite.title, root: suite.root, indents },
    });
  });

  runner.on("suite end", async (suite) => {
    indents--;
    print(indents === 1
      ? "\n"
      : "");
    await send({
      type: "suite end",
      data: { title: suite.title, root: suite.root, indents },
    });
  });

  runner.on("pending", async (test) => {
    print(`${indent()}pending  -${test.title}\n`);
    await send({
      type: "pending",
      data: {
        title: test.title,
        fulltest: test.fullTitle(),
        duration: test.duration,
        indents: indents + 1,
      },
    });
  });

  runner.on("pass", async (test) => {
    passed++;
    let str = `${indent()}${Mocha.reporters.Base.symbols.ok} ${test.title}`;
    if (test.speed !== "fast")
      str += ` (${Math.round(test.duration ?? 0)} ms)`;
    str += "\n";
    print(str);
    await send({
      type: "pass",
      data: {
        title: test.title,
        fulltest: test.fullTitle(),
        duration: test.duration,
        indents: indents + 1,
      },
    });
  });

  runner.on("fail", async (test, error) => {
    failed++;
    const indentStr = indent();
    const bell = Zotero.automatedTest ? "" : "\x07";
    const message = (error as Error | undefined)?.message;
    print(
      `${indentStr}${Mocha.reporters.Base.symbols.err}${bell} ${test.title}\n`
      + `${indentStr}  ${message}\n\n`,
    );

    // Serialize the error explicitly: `send()` JSON-stringifies the payload,
    // and `Error` instances stringify to `{}` (message/stack are
    // non-enumerable), so thrown errors / timeouts / XPCOM exceptions used to
    // reach the terminal as `, undefined`. Chai AssertionErrors were
    // unaffected (own-enumerable props), which is why this went unnoticed in
    // assertion-heavy suites.
    const err = error as Partial<Error> & { actual?: unknown; expected?: unknown; showDiff?: boolean; operator?: string } | undefined;
    await send({
      type: "fail",
      data: {
        title: test.title,
        fulltest: test.fullTitle(),
        duration: test.duration,
        error: {
          message: String(err?.message ?? err),
          stack: err?.stack,
          actual: err?.actual,
          expected: err?.expected,
          showDiff: err?.showDiff,
          operator: err?.operator,
        },
        indents: indents + 1,
      },
    });
  });

  runner.on("end", async () => {
    const str = `${passed}/${passed + failed} tests passed${aborted ? " -- aborting" : ""}\n`;
    print(str);

    await send({
      type: "end",
      data: {
        passed,
        failed,
        aborted,
        str,
        indents,
      },
    });

    // Zotero must exit on its own side, otherwise the exit code will not be 0
    // and CI will fail.
    if (options.exitOnFinish)
      Zotero.Utilities.Internal.quit(0);
  });
}
