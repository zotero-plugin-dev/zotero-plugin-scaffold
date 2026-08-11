# Testing

This module facilitates testing Zotero plugins in a live Zotero environment using the [Vitest](https://vitest.dev/) runtime. Test files run inside a real Zotero instance through a vitest **custom pool** (`zoteroPool`): the vitest server drives the run natively — reporters, filtering, watch and exit codes are all vitest's own — while the test page is built at bundle time with rolldown and loaded into a chrome:// window where the privileged `Zotero.*` APIs are available.

## Why Use This Approach?

Zotero runs in a browser-like environment with private APIs, making traditional Node.js testing frameworks impractical due to extensive mocking requirements and distorted test results.

With `zotero-plugin-scaffold`, tests are executed in a live Zotero instance via a proxy plugin. A temporary profile and data directory are created, allowing full access to Zotero's APIs during testing.

## Quick Start

There are two ways to run tests in a live Zotero instance:

1. **`zoteroPool()` in your own `vitest.config.ts`** (recommended) — run with `vitest`,
   mix Zotero tests with plain Node tests in one command (see below).
2. **`zotero-plugin test` CLI** — the scaffold-managed entry, which wraps the same
   pool internally (see [Running Tests via CLI](#running-tests-via-cli)).

### Install Vitest

Install `vitest` (v5) as a development dependency:

```bash
npm install -D vitest@^5
```

Scaffold bundles the Vitest runtime (resolved from your `vitest` installation) with rolldown, so no CDN downloads are involved.

### zoteroPool (vitest.config.ts)

Add a project (or a `poolMatchGlobs` rule) that uses the Zotero pool:

```ts twoslash
import { defineConfig } from "vitest/config";
import { zoteroPool } from "zotero-plugin-scaffold/vitest";

export default defineConfig({
  test: {
    projects: [
      // plain Node tests (fast, no Zotero needed)
      {
        test: {
          name: "unit",
          include: ["test/unit/**"],
          pool: "forks",
          // Vitest groups projects by `sequence.groupOrder` and requires the
          // same `maxWorkers` inside a group. The zotero pool forces
          // `fileParallelism: false` (maxWorkers: 1), so give parallel
          // projects a distinct groupOrder — otherwise `vitest run` (all
          // projects) fails with a "different 'maxWorkers'" error.
          sequence: { groupOrder: 1 },
        },
      },
      // tests that run inside a real Zotero instance
      {
        test: {
          name: "zotero",
          include: ["test/zotero/**"],
          isolate: false,
          fileParallelism: false,
          pool: zoteroPool(),
        },
      },
    ],
  },
});
```

```bash
vitest            # runs both projects; unit tests are fast, Zotero tests boot Zotero
vitest zotero     # only the Zotero project
```

`zoteroPool` options (all optional):

| Option                   | Default                         | Description                                                  |
| ------------------------ | ------------------------------- | ------------------------------------------------------------ |
| `zoteroBin`              | `ZOTERO_PLUGIN_ZOTERO_BIN_PATH` | Path to the Zotero executable                                |
| `profileDir`             | `.scaffold/tester-profile`      | Zotero profile directory                                     |
| `dataDir`                | `.scaffold/tester-data`         | Zotero data directory                                        |
| `pluginDir` / `pluginId` | —                               | Load the user's plugin as a proxy addon alongside the tester |
| `args`                   | —                               | Extra Zotero command-line arguments                          |
| `extraPrefs`             | —                               | Extra `prefs.js` entries                                     |

::: warning Required project settings
The Zotero project must set `isolate: false` and `fileParallelism: false`
(vitest's defaults are the opposite). Files run serially in one Zotero
instance — the pool reuses the same worker (`canReuse`) instead of booting
Zotero per file. The pool validates these and throws a descriptive error.

When several Zotero projects run together (`vitest --project=a --project=b`),
vitest's pool scheduler still boots one Zotero at a time: `fileParallelism:
false` pins the group's `maxWorkers` to 1. Each project gets its own
profile/data dir (derived from the project name) and tester plugin output, so
parallel runs never collide.
:::

### Writing Test Cases

Write test cases using Vitest syntax in `test/*.{spec,test}.{js,ts}`. Both Vitest-style (`expect(x).toBe(y)`) and Chai-style (`expect(x).to.equal(y)`, `assert.isNotEmpty(...)`) assertions are supported:

```js
describe("Example Test", () => {
  it("should pass", () => {
    expect(1 + 1).to.equal(2);
  });
});

describe("Startup", () => {
  it("should have plugin instance defined", () => {
    assert.isNotEmpty(Zotero[MyPlugin]);
  });
});
```

### Running Tests via CLI

::: info
The CLI is a thin wrapper around the same `zoteroPool` implementation: it
generates a temporary `vitest.config.ts` and spawns `vitest`, forwarding the
exit code.
:::

Run the tests using:

```bash
npm run test
```

### Running Tests with CLI Options

You can override configuration settings with CLI parameters. Use `zotero-plugin test --help` to view available options:

```bash
$ pnpm zotero-plugin test --help
Usage: cli test [options]

Run tests

Options:
  --abort-on-fail      Abort the test suite on first failure
  --exit-on-finish     Exit the test suite after all tests have run
  --no-watch           Exit the test suite after all tests have run
  --reporter <name>    Vitest reporter(s), e.g. default|verbose|junit|json (comma-separated)
  --output-file <path> Write the test report to a file, e.g. test-results/junit.xml
  -h, --help           display help for command
```

These map to the `test.reporter` / `test.outputFile` config options — both are
passed through to vitest's `reporters` / `outputFile`, so `junit`/`json`
reports come for free:

```bash
zotero-plugin test --no-watch --reporter junit --output-file test-results/junit.xml
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
    vitest: {
      timeout: 10000
    },
    watch: true,
    abortOnFail: false,
    headless: false,
    hooks: {}
  }
});
```

### Source of Tests

The `test.entries` option allows you to configure the source directories for test files.

Test files must have filenames ending with `.spec.js` or `.spec.ts` to be recognized and executed.

### Delay Running

The pool starts tests as soon as the test window has loaded (the ready
handshake). There is no built-in "wait for the plugin to initialize" delay —
the old `test.startupDelay` / `test.waitForPlugin` options are not wired up
in the vitest-pool implementation.

If your tests need the plugin to be ready, wait for your own flag inside the
test file, e.g. with a polling helper:

```ts
import { beforeAll } from "vitest";

beforeAll(async () => {
  const deadline = Date.now() + 30000;
  while (!Zotero.MyPlugin?.initialized) {
    if (Date.now() > deadline)
      throw new Error("plugin did not initialize");
    await new Promise(r => setTimeout(r, 100));
  }
});
```

## `vi` Support

The full `vi` API is available inside Zotero tests, with two groups:

**Working** (verified on real Zotero): `vi.fn` / `vi.spyOn` / `vi.mocked` /
`vi.stubGlobal` / `vi.clearAllMocks` / `vi.resetAllMocks` /
`vi.restoreAllMocks` / `vi.useFakeTimers` (with `advanceTimersByTime`,
`setSystemTime`, ...) / `vi.setConfig` / `vi.stubEnv` / `vi.resetModules` /
`vi.waitFor` / `vi.waitUntil`.

**Not available** (architectural limitation): `vi.mock` / `vi.doMock` /
`vi.unmock` / `vi.doUnmock` / `vi.importActual` / `vi.importMock` and
`vi.hoisted`. Vitest's module mocker needs the Vite module pipeline to
intercept imports; the test page loads pre-bundled ESM with no import hook,
so `vi.mock()` throws `Vitest mocker was not initialized in this
environment`. Use `vi.fn` / `vi.spyOn` or manual dependency injection
instead.

## Debugging

- Set `ZOTERO_PLUGIN_LOG_LEVEL=DEBUG` (or `logLevel: "DEBUG"` in the
  scaffold config) to see the pool's internals — bridge port, bundle stats,
  Zotero launch, worker takeovers.
- Page errors (a failing test-window load, unhandled rejections) are
  mirrored to the terminal as `[page-error]` / `[page-unhandledrejection]`
  warnings, so a window that never handshakes is diagnosable without debug
  mode.

## Watch Mode

In watch mode (`zotero-plugin test`, or `vitest --watch`), Scaffold:

- **Keeps the same Zotero instance alive between reruns**: after each run the
  worker soft-stops (Zotero and its test window stay running) and the next run
  takes the instance over, so a file change re-runs in ~15ms instead of a
  ~30s cold boot.
- **Rebuilds only the affected test files** when they change: the pool
  rebundles just the files vitest is about to re-run (with a fresh artifact
  stamp) and hands the page the new manifest, so the updated code is what
  actually runs.
- Recompiles source code and reloads plugins when the source changes.

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
