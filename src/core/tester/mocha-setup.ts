/// <reference types="mocha" />

/**
 * Page-side entry of the tester: configures Mocha, streams the results to the
 * HTTP reporter of the Node side, and checks what Mocha cannot check by itself
 * (`expect.assertions(n)` / `expect.hasAssertions()`).
 *
 * Bundled into `dist/page/mocha-setup.js` (IIFE) at build time and loaded by
 * the generated `index.xhtml` after `mocha.js` and `test-api.js`. The configuration
 * arrives as `window.__scaffoldConfig`, which the Node side writes into the
 * page ({@link TestPageConfig}).
 */
import type { ReportEvent, ReportFailureData, ReportTestData, TestPageConfig } from "./protocol.js";

/** The subset of Zotero's API the test page uses. */
interface ZoteroPage {
  automatedTest?: boolean;
  HTTP: {
    request: (
      method: string,
      url: string,
      options: { body?: string },
    ) => Promise<{ status: number; responseText: string }>;
  };
  Utilities: {
    Internal: {
      quit: (code: number) => void;
    };
  };
}

/** The subset of the `expect` state the assertion checks need. */
interface ExpectState {
  assertionCalls: number;
  expectedAssertionsNumber?: number | null;
  expectedAssertionsNumberErrorGen?: (() => Error) | null;
  isExpectingAssertions?: boolean;
  isExpectingAssertionsError?: Error | null;
}

interface ExpectGlobal {
  getState: () => ExpectState;
  setState: (state: Partial<ExpectState>) => void;
}

const page = globalThis as unknown as {
  __scaffoldConfig?: TestPageConfig;
  expect?: ExpectGlobal;
  Zotero?: ZoteroPage;
};

if (!page.__scaffoldConfig || !page.Zotero) {
  throw new Error(
    "zotero-plugin-scaffold: the test page has no configuration or no Zotero API, "
    + "the generated index.xhtml does not match this version of the test runtime.",
  );
}

const config: TestPageConfig = page.__scaffoldConfig;
const zotero: ZoteroPage = page.Zotero;
const expectGlobal = page.expect;

/** Sends one event to the HTTP reporter of the Node side. */
async function send(event: ReportEvent): Promise<void> {
  const response = await zotero.HTTP.request(
    "POST",
    `http://localhost:${config.port}/update`,
    {
      body: JSON.stringify(event),
    },
  );

  if (response.status !== 200)
    console.error(`[scaffold] failed to report the test result: ${response.responseText}`);
}

/** Writes to the visible output of the test page. */
function dump(text: string): void {
  const element = document.getElementById("mocha");
  if (element)
    element.textContent += text;
}

/**
 * Streams the Mocha events to the HTTP reporter.
 *
 * Events are queued so that the Node side receives them in the order they
 * happened, which keeps the printed report readable and the `end` summary last.
 */
class ScaffoldReporter {
  private indents = 0;
  private passed = 0;
  private failed = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(runner: Mocha.Runner) {
    runner.on("start", () => {
      this.report({
        type: "start",
        data: { indents: this.indents },
      });
    });

    runner.on("suite", (suite) => {
      this.indents++;
      dump(`${this.indent()}${suite.title}\n`);
      this.report({
        type: "suite",
        data: { title: suite.title, root: suite.root, indents: this.indents },
      });
    });

    runner.on("suite end", (suite) => {
      this.indents--;
      if (this.indents === 1)
        dump("\n");

      this.report({
        type: "suite end",
        data: { title: suite.title, root: suite.root, indents: this.indents },
      });
    });

    runner.on("pending", (test) => {
      dump(`${this.indent()}pending  -${test.title}\n`);
      this.report({
        type: "pending",
        data: this.testData(test),
      });
    });

    runner.on("pass", (test) => {
      this.passed++;
      let line = `${this.indent()}${Mocha.reporters.Base.symbols.ok} ${test.title}`;
      if (test.speed !== "fast")
        line += ` (${Math.round(test.duration ?? 0)} ms)`;
      dump(`${line}\n`);
      this.report({
        type: "pass",
        data: this.testData(test),
      });
    });

    runner.on("fail", (test, error: unknown) => {
      this.failed++;
      const failure = serializeError(error);
      const indent = this.indent();
      const firstLine = `${indent}${Mocha.reporters.Base.symbols.err}${zotero.automatedTest ? "" : "\x07"} ${test.title}`;

      dump(`${firstLine}\n${indent}  ${failure.message}\n\n`);
      this.report({
        type: "fail",
        data: {
          ...this.testData(test),
          error: failure,
        },
      });
    });

    runner.on("end", () => {
      const summary = `${this.passed}/${this.passed + this.failed} tests passed`;
      dump(`${summary}\n`);

      this.report({
        type: "end",
        data: {
          passed: this.passed,
          failed: this.failed,
          aborted: false,
          indents: this.indents,
        },
      });

      // Must exit on the Zotero side, otherwise the exit code will not be 0 and CI will fail
      if (config.exitOnFinish)
        this.queue.then(() => zotero.Utilities.Internal.quit(0));
    });
  }

  private indent(): string {
    return "  ".repeat(this.indents);
  }

  private testData(test: Mocha.Test): ReportTestData {
    return {
      title: test.title,
      fulltest: test.fullTitle(),
      duration: test.duration,
      indents: this.indents + 1,
    };
  }

  private report(event: ReportEvent): void {
    this.queue = this.queue
      .then(() => send(event))
      .catch((error: unknown) => {
        console.error("[scaffold] failed to report the test result", error);
      });
  }
}

/**
 * Serializes an error explicitly: `send()` JSON-stringifies the payload, and
 * `Error` instances stringify to `{}` (message/stack are non-enumerable), so
 * thrown errors, timeouts and XPCOM exceptions would otherwise reach the
 * terminal as `undefined`. Chai's `AssertionError` is less affected (its
 * `actual`/`expected`/`showDiff` are own-enumerable properties).
 *
 * Properties are read structurally instead of with `instanceof Error`, because
 * an error can come from another compartment and fail the `instanceof` check.
 */
function serializeError(error: unknown): ReportFailureData["error"] {
  if (typeof error !== "object" || error === null) {
    return {
      message: String(error),
    };
  }

  const { message, stack, actual, expected, showDiff, operator } = error as {
    message?: unknown;
    stack?: unknown;
    actual?: unknown;
    expected?: unknown;
    showDiff?: unknown;
    operator?: unknown;
  };

  return {
    message: String(message ?? error),
    stack: typeof stack === "string"
      ? stack
      : undefined,
    actual,
    expected,
    showDiff: showDiff === true
      ? true
      : undefined,
    operator: typeof operator === "string"
      ? operator
      : undefined,
  };
}

mocha.setup({
  ui: "bdd",
  reporter: ScaffoldReporter as unknown as Mocha.ReporterConstructor,
  timeout: config.timeout || 10_000,
  bail: config.abortOnFail,
});

/** Logs arbitrary data to the terminal, handy while writing a test. */
Object.assign(globalThis, {
  debug: (data: unknown) => void send({ type: "debug", data }),
});

// `expect.assertions()` / `expect.hasAssertions()` are verified by the runner in
// Vitest, here Mocha has to do it: the state is reset before every test and
// checked afterwards.
if (expectGlobal && typeof expectGlobal.getState === "function") {
  beforeEach(() => {
    expectGlobal.setState({
      assertionCalls: 0,
      expectedAssertionsNumber: null,
      expectedAssertionsNumberErrorGen: null,
      isExpectingAssertions: false,
      isExpectingAssertionsError: null,
    });
  });

  afterEach(() => {
    const state = expectGlobal.getState();

    if (state.expectedAssertionsNumber != null && state.assertionCalls !== state.expectedAssertionsNumber) {
      throw state.expectedAssertionsNumberErrorGen
        ? state.expectedAssertionsNumberErrorGen()
        : new Error(`expected number of assertions to be ${state.expectedAssertionsNumber}, but got ${state.assertionCalls}`);
    }

    if (state.isExpectingAssertions && state.assertionCalls === 0) {
      throw state.isExpectingAssertionsError
        ?? new Error("expected any number of assertion, but got none");
    }
  });
}
