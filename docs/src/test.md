# Testing

This module facilitates testing Zotero plugins in a live Zotero environment using [Mocha](https://mochajs.org/) and [Chai](https://www.chaijs.com/).

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

### Install Mocha and Chai

Install `mocha` and `chai` as development dependencies to avoid potential conflicts:

```bash
npm install -D mocha chai @types/mocha @types/chai
```

If Scaffold detects a local Mocha installation, it uses it; otherwise, it fetches the latest version from NPM. Cached versions are stored in `.scaffold/cache`, which can be deleted to force updates.

### Writing Test Cases

Write test cases using [Mocha](https://mochajs.org/) and [Chai](https://www.chaijs.com/) syntax in `test/*.{spec,test}.{js,ts}`:

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
