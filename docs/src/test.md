# Testing

This module facilitates testing Zotero plugins in a live Zotero environment using [Mocha](https://mochajs.org/) and Vitest's [`expect`](https://vitest.dev/api/expect) (Jest-style assertions on top of [Chai](https://www.chaijs.com/)).

## Why Use This Approach?

Zotero runs in a browser-like environment with private APIs, making traditional Node.js testing frameworks impractical due to extensive mocking requirements and distorted test results.

With `zotero-plugin-scaffold`, tests are executed in a live Zotero instance via a proxy plugin. A temporary profile and data directory are created, allowing full access to Zotero's APIs during testing.

## Quick Start

### Add Test Script

Ensure `zotero-plugin-scaffold` is installed first. Then add a `test` script to your `package.json`:

```json
{
  "scripts": {
    "test": "zotero-plugin test"
  }
}
```

### Writing Test Cases

Write test cases in `test/*.{spec,test}.{js,ts}` and import the test API from `zotero-plugin-scaffold/test`:

```ts
import { assert, before, describe, expect, it } from "zotero-plugin-scaffold/test";

describe("Example Test", () => {
  before(() => {
    // runs once before the suite
  });

  it("should pass", () => {
    expect(1 + 1).toBe(2);
    expect({ a: 1 }).toEqual({ a: 1 });
  });
});

describe("Startup", () => {
  it("should have plugin instance defined", () => {
    assert.isNotEmpty(Zotero[MyPlugin]);
  });
});
```

The entry point exposes Mocha's `bdd` interface (`describe`, `context`, `xdescribe`, `xcontext`, `it`, `specify`, `xit`, `xspecify`, `before`, `after`, `beforeEach`, `afterEach`) together with Vitest's `expect`, Chai's `assert`, the `chai` namespace (also the default export) for `chai.use(plugin)`, and the `zo` namespace for spies and fake timers.

`expect` is the same one Vitest uses: Chai plus [`@vitest/expect`](https://www.npmjs.com/package/@vitest/expect)'s plugins, so the Jest matchers (`toBe`, `toEqual`, `toThrow`, `toContain`, …), the asymmetric matchers (`expect.any`, `expect.objectContaining`, …), `expect.extend`, `expect.addEqualityTesters`, `expect.assertions(n)` and `expect.hasAssertions()` all work. Chai's own assertions keep working on it as well (`expect(1).to.equal(1)`).

`expect.assertions(n)` and `expect.hasAssertions()` are verified at the end of each test, like Vitest does.

### Spies

Spies come from [`@vitest/spy`](https://www.npmjs.com/package/@vitest/spy), the library behind Vitest's `vi.fn()` / `vi.spyOn()`, collected into a `zo` namespace — the stand-in for Vitest's `vi`. All twelve spy matchers work:

```ts
import { afterEach, describe, expect, it, zo } from "zotero-plugin-scaffold/test";

describe("Spies", () => {
  // Nothing restores spies automatically, see below.
  afterEach(() => {
    zo.restoreAllMocks();
  });

  it("records calls", () => {
    const callback = zo.fn();
    callback("a", 1);

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith("a", 1);
  });

  it("wraps an existing method", () => {
    const service = {
      greet: (name: string) => `hi ${name}`
    };
    const greet = zo.spyOn(service, "greet");

    service.greet("world");
    expect(greet).toHaveBeenCalledWith("world");
  });
});
```

The namespace holds `fn`, `spyOn`, `isMockFunction`, `clearAllMocks`, `resetAllMocks` and `restoreAllMocks`, mirroring `vi`.

`toHaveBeenCalled`, `toBeCalled`, `toHaveBeenCalledTimes`, `toBeCalledTimes`, `toHaveBeenCalledWith`, `toBeCalledWith`, `toHaveBeenCalledOnce`, `toHaveBeenCalledExactlyOnceWith`, `toHaveBeenLastCalledWith`, `toHaveBeenNthCalledWith`, `toHaveBeenCalledBefore` and `toHaveBeenCalledAfter` are all available. Passing anything that is not a spy throws instead of passing silently.

::: warning Restore spies yourself
Unlike Vitest, Scaffold does not reset spies between tests: a `zo.spyOn(obj, "method")` keeps the object patched for every later test in the run. Add `afterEach(() => zo.restoreAllMocks())` to the suites that use `spyOn()`. (A root-level `beforeEach` hook would be the other option, but Mocha discards the remaining tests when a root hook throws, so a single mistake would hide the rest of the run.)
:::

Not available:

- `vi` itself, which belongs to the Vitest runner; `zo` covers what it can do here.
- `vi.mock()` / `vi.unmock()`, which need a runner and an ESM module graph to patch; there is none inside a Zotero page. `zo.spyOn(obj, "method")` works on existing object methods only, so it usually cannot replace a binding of an imported module.
- `vi.stubGlobal()` / `vi.stubEnv()`, which patch the page's globals and environment; assign them yourself and undo it in `afterEach`.
- Snapshots, `expect.soft` and `expect.poll`, which all need Vitest's runner; the latter two throw a descriptive error instead of silently passing.

A mock without an explicit name reports as `vi.fn()` in failure messages, which is the library's default and expected.

### Fake timers

Fake timers come from [`@sinonjs/fake-timers`](https://www.npmjs.com/package/@sinonjs/fake-timers), the library behind Vitest's `vi.useFakeTimers()`, and join the same `zo` namespace:

```ts
import { describe, expect, it, zo } from "zotero-plugin-scaffold/test";

describe("Debounce", () => {
  it("waits for the delay to pass", () => {
    zo.useFakeTimers();

    const save = zo.fn();
    const debouncedSave = () => {
      setTimeout(save, 1000);
    };

    debouncedSave();
    expect(save).not.toHaveBeenCalled();

    zo.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledOnce();
  });
});
```

The namespace holds `useFakeTimers`, `useRealTimers`, `advanceTimersByTime`, `advanceTimersByTimeAsync`, `runAllTimers`, `runAllTimersAsync` and `getTimerCount`, and behaves like `vi` (see [Vitest's `vi` docs](https://vitest.dev/api/vi)): `Date` and every timer of the page are frozen until the test moves them, `advanceTimersByTimeAsync()` / `runAllTimersAsync()` also settle the promises the timer callbacks await, and the `advance*` / `run*` / `getTimerCount` members throw when timers are not faked. The rest of `vi`'s timer API (`runOnlyPendingTimers`, `setSystemTime`, …) is not exposed yet; ask for the member you need and it joins the list.

`zo.useFakeTimers(config?)` takes a [`@sinonjs/fake-timers` config](https://github.com/sinonjs/fake-timers#config), so `toFake`, `now` or `loopLimit` can be set per test. Without a config it fakes every timer the page has (except `nextTick` / `queueMicrotask`), starts at the real time, ignores timers the page does not have, clears the native timers left behind on uninstall, and stops `runAllTimers()` after 10000 timers — the defaults Vitest uses.

One option is not in that config: `global`, the object the clock is installed on. Pass the window the code under test schedules on when it is not the test page — Zotero's progress notification, for example, closes itself with `win.setTimeout`, and a page clock cannot drive it:

```ts
zo.useFakeTimers({
  global: progressWindow,
  toFake: ["setTimeout", "clearTimeout"],
  shouldClearNativeTimers: true,
});

await zo.advanceTimersByTimeAsync(5000);
expect(progressWindow.closed).toBe(true);
zo.useRealTimers();
```

It is the same thing `sinon.useFakeTimers({ global: win })` does, so a suite migrating from Sinon keeps its call shape; `@sinonjs/fake-timers` itself used to spell it `target` and now exposes it as `withGlobal()`.

::: warning Fake timers are uninstalled for you
Unlike spies, a fake clock is undone automatically after every test: a leaked clock freezes the timers of the whole Zotero window, which breaks the reporter, Zotero itself and every later test. `zo.useRealTimers()` is still there for a test which wants the real time back in the middle of it.
:::

Two things to keep in mind, both properties of fake timers in any browser:

- The install is window-wide, not per test: while it is active, Zotero's own `setTimeout` / `Date` work is frozen as well, not just the code under test. Keep faking inside the test that needs it.
- Mocha's test timeout is a real timer started before the hooks run, so a hung test still fails on time; `runAllTimers()` on a timer which keeps rescheduling itself throws instead of looping forever.

### Running Tests

Run the tests using:

```bash
npm run test
```

## Advanced Configuration

Customize test behavior by adding a `test` object to your `zotero-plugin-scaffold` configuration file. All settings have sensible defaults.

```ts twoslash
import { defineConfig } from "zotero-plugin-scaffold";
// ---cut---
export default defineConfig({
  test: {
    entries: ["test"],
    prefs: {},
    mocha: {
      timeout: 10000
    },
    watch: true,
    abortOnFail: false,
    headless: false,
    startupDelay: 10000,
    waitForPlugin: `() => Zotero.MyPlugin.initialized`,
    hooks: {}
  }
});
```

### Source of Tests

The `test.entries` option allows you to configure the source directories for test files.

Test files must have filenames ending with `.spec.js` or `.spec.ts` to be recognized and executed.

### Delay Running

Ideally, tests should start only after the plugin has fully loaded. However, since Zotero does not provide a built-in mechanism to detect when a plugin is ready, you need to define a custom flag in your plugin to indicate its readiness.

By default, Scaffold delays test execution for 10,000 milliseconds after the temporary plugin is loaded (`test.startDelay`). While this duration is sufficient for most plugins, hardware performance and plugin complexity may require adjustments.

To handle such cases, use the `test.waitForPlugin` configuration option. This option accepts a function body as a string. Tests will begin only after this function returns `true`.

## Watch Mode

In watch mode, Scaffold automatically:

- Recompiles source code, reloads plugins, and reruns tests when the source changes.
- Reruns tests when test files are modified.

Watch mode is disabled automatically when tests run in CI or inside an AI coding agent (e.g. Claude Code, Codex, pi), so that the test command exits once all tests have run. Explicitly set `test.watch` to `false` (or pass `--no-watch`) to get the same behavior locally.

## Running Tests with CLI Options

You can override configuration settings with CLI parameters. Use `zotero-plugin test --help` to view available options:

```bash
$ pnpm zotero-plugin test --help
Usage: cli test [options]

Run tests

Options:
  --abort-on-fail   Abort the test suite on first failure
  --exit-on-finish  Exit the test suite after all tests have run
  --no-watch        Same with `exit-on-finish`
  -h, --help        display help for command
```

## Running Tests on CI

To run tests automatically on CI services like GitHub Actions, Scaffold provides a `headless` mode.

By default, Scaffold enables headless mode on CI services. To enable it locally, pass `headless` as a CLI parameter or set `test.headless: true` in the configuration.

::: warning
Scaffold's built-in headless mode supports only Ubuntu 22.04 and 24.04. For other Linux distributions, manually configure a headless environment, set `test.headless` to `false`, and use tools like `xvfb-run npm run test`.
:::

For GitHub Actions, use the following workflow template:

```yaml
name: test

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4

      - name: Install dependencies
        run: npm install

      - name: Run tests
        run: npm test
```
