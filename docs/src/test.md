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

### Writing Test Cases

Write test cases in `test/*.{spec,test}.{js,ts}` and import the test API from `zotero-plugin-scaffold/test`:

```ts
import { assert, before, describe, expect, it } from "zotero-plugin-scaffold/test";

describe("Example Test", () => {
  before(() => {
    // runs once before the suite
  });

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

The entry point exposes Mocha's `bdd` interface (`describe`, `context`, `xdescribe`, `xcontext`, `it`, `specify`, `xit`, `xspecify`, `before`, `after`, `beforeEach`, `afterEach`) together with Chai's `expect`, `assert` and the `chai` namespace (also the default export) for `chai.use(plugin)`.

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
    include: ["**/*.{spec,test}.[jt]s"],
    exclude: ["**/node_modules/**", "**/.git/**"],
    filter: [],
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

### Which Tests Run

`test.include` selects the test files to run and `test.exclude` drops some of them again, like the options of the same name in Vitest and Rstest. Both take a list of globs, relative to the project root:

- `include` defaults to every test file of the project, `**/*.{spec,test}.[jt]s`;
- `exclude` defaults to `["**/node_modules/**", "**/.git/**"]`, and always contains the build directory (`dist`).

Test files are `*.spec.js`, `*.spec.ts`, `*.test.js` and `*.test.ts`. Overlapping patterns bundle every file once.

```ts twoslash
import { defineConfig } from "zotero-plugin-scaffold";
// ---cut---
export default defineConfig({
  test: {
    include: ["test/**/*.spec.ts", "integration/**/*.spec.ts"],
    // Skipped after the include selected them.
    exclude: ["test/legacy/**", "**/*.slow.spec.ts"]
  }
});
```

### Run Only Some Tests

Pass filters as positional arguments of `zotero-plugin test`, like `vitest run [...filters]` and `rstest [...filters]`. A filter is a case-insensitive fragment of the path of the test file, so a file name, a directory or part of a path all work:

```bash
# Every test file whose path contains "prefs", e.g. test/prefs.spec.ts
zotero-plugin test prefs

# Every test file in a directory, plus test/unit2/ — a filter is a fragment
zotero-plugin test test/unit

# A fragment of a path
zotero-plugin test api/zotero

# An absolute path, matched as a prefix
zotero-plugin test /home/me/plugin/test/unit

# One exact path: the quotes have to reach the command, so wrap them once more
# for the shell (cmd and PowerShell need their own escaping)
zotero-plugin test '"test/prefs.spec.ts"'
```

`test.include` and `test.exclude` still decide which files exist; the filters — `test.filter`, filled by the positional arguments — narrow that down. They are not globs (use `test.include` for that), and an unquoted filter is not a path: it is the substring that Vitest and Rstest also compare against, so `zotero-plugin test test/unit` also matches `test/unit2/`. Include a trailing slash when the fragment has to be a directory: `test/unit/`. Wrap the filter in quotes when it has to be one exact path.

Files that are not selected are neither bundled nor loaded, so a narrowed run also starts faster than a full one. These select _test files_. To run a single test case inside a file, use `.only()`.

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
$ zotero-plugin test --help
Usage: cli test [options] [filters...]

Run tests

Arguments:
  filters           Only run the test files whose path contains any of the
                    filters

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
