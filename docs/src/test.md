# Testing

This module facilitates testing Zotero plugins in a live Zotero environment using the [Vitest](https://vitest.dev/) runtime (the `expect`/`vi` API, powered by `@vitest/runner` and `@vitest/expect`, bundled into the test page with esbuild).

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

Install `vitest` (v4) as a development dependency:

```bash
npm install -D vitest@^4
```

Scaffold bundles the Vitest runtime from your local installation with rolldown, so no CDN downloads are involved. It prefers the `vitest` in your project; if it cannot be found there, it falls back to the one bundled with the scaffold itself.

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
        },
      },
      // tests that run inside a real Zotero instance
      {
        test: {
          name: "zotero",
          include: ["test/zotero/**"],
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
| `startupDelay`           | `1000`                          | Delay after Zotero startup before the test window opens      |
| `abortOnFail`            | `false`                         | Abort the run on the first failing test                      |
| `extraPrefs`             | —                               | Extra `prefs.js` entries                                     |

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
The CLI currently drives the legacy runner; it will be rewired to the same
`zoteroPool` implementation (thin wrapper) in an upcoming release.
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
  --abort-on-fail   Abort the test suite on first failure
  --exit-on-finish  Exit the test suite after all tests have run
  --no-watch        Same with `exit-on-finish`
  -h, --help        display help for command
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
