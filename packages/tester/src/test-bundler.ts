import type { BuildContext, BuildResult, Plugin } from "esbuild";
import type { TestContext, TestRuntimeOptions } from "./types.js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { logger, toArray } from "@zotero-plugin/utils";
import { build, context } from "esbuild";
import { outputFile, outputJSON } from "fs-extra/esm";
import { TEST_API_IDS } from "./apis.js";
import { TESTER_PLUGIN_DIR } from "./constant.js";
import { filterTestFiles, resolveTestEntries } from "./entries.js";
import { generateBootstrap, generateHtml, generateManifest } from "./test-bundler-template/index.js";

/**
 * Module specifiers that resolve to the test API shim in addition to the ones
 * of the registry: the public entry points users actually import.
 */
const EXTRA_TEST_API_IDS: string[] = [
  "zotero-plugin-scaffold/test",
  "@zotero-plugin/tester/api",
];

const TESTER_PACKAGE_NAME = "@zotero-plugin/tester";

/** Every specifier that is redirected to the shim. */
const TEST_API_SPECIFIERS: string[] = [
  ...TEST_API_IDS,
  ...EXTRA_TEST_API_IDS,
];

/**
 * Resolve an entry point shipped by this package.
 *
 * It goes through the package self-reference (`exports`), so it resolves to
 * the published `dist` layout. When the bundler runs from the TypeScript
 * sources (unit tests, before a build), the `dist` file does not exist yet, so
 * fall back to the sibling source file.
 *
 * @param specifier the self-referencing specifier, e.g. `@zotero-plugin/tester/shim`
 * @param distRelative the path of the file relative to the built module
 */
function resolveOwnEntry(specifier: string, distRelative: string): string {
  try {
    const resolved = fileURLToPath(import.meta.resolve(specifier));
    if (existsSync(resolved))
      return resolved;
  }
  catch {
    // The self-reference is unavailable, try the source fallback below.
  }

  for (const candidate of [
    distRelative,
    distRelative.replace(/\.js$/, ".ts"),
  ]) {
    const file = fileURLToPath(new URL(candidate, import.meta.url));
    if (existsSync(file))
      return file;
  }

  throw new Error(`Cannot resolve ${specifier}. Is ${TESTER_PACKAGE_NAME} built?`);
}

/** The absolute path of the shim, i.e. the target of the redirects below. */
export function resolveShimPath(): string {
  return resolveOwnEntry(`${TESTER_PACKAGE_NAME}/shim`, "./shim/index.js");
}

/** The absolute path of the test runtime entry, see `buildTestRuntime()`. */
export function resolveRuntimeEntry(): string {
  return resolveOwnEntry(`${TESTER_PACKAGE_NAME}/runtime-setup`, "./test-runtime-setup.js");
}

/**
 * Whether a bare import specifier belongs to the test API and must therefore be
 * redirected to the shim.
 */
export function isTestApiSpecifier(id: string): boolean {
  return TEST_API_SPECIFIERS.some(m => id === m || id.startsWith(`${m}/`));
}

/**
 * Redirect the test library specifiers to the shim.
 *
 * The shim only reads the globals the prebuilt test runtime installed, so the
 * test bundles stay free of mocha/chai code (~230KB less, and — more
 * importantly — no second, un-set-up copy of mocha whose suites would never
 * be run).
 *
 * `alias` cannot express this: it is prefix concatenation
 * (`mocha` → `<shim>/mocha.js` for `import "mocha/mocha.js"`), and the
 * dynamically generated shims of future integrations need virtual modules,
 * which only `onLoad` can provide.
 */
export function createTestApiPlugin(): Plugin {
  const shimPath = resolveShimPath();

  return {
    name: "zotero-plugin-test-api",
    setup(build) {
      build.onResolve({ filter: /^[^./]/ }, (args) => {
        if (isTestApiSpecifier(args.path))
          return { path: shimPath };
        return null;
      });
    },
  };
}

export class TestBundler {
  private esbuildContext?: BuildContext;
  /**
   * The units of the last bundle, relative to `content/`, e.g.
   * `units/prefs.spec.js`. It is the authoritative list of what the test page
   * may load: the bundle is built from the filtered entry points, so a stale
   * file left in `content/units` can never end up in the page.
   */
  private units: string[] = [];

  constructor(
    private ctx: TestContext,
    private port: number,
  ) {
    //
  }

  async generate(): Promise<void> {
    // this.generatePluginRes
    //   bootstrap
    //   manifest
    //   test runtime
    //   bundle tests
    await this.generateTestResources();

    // this.generateTestPage
    //   options
    //   html
    await this.createTestHtml();
  }

  /**
   * Re-bundle the tests after a change and rewrite the test page.
   *
   * @param changedFile the file that changed.
   * @returns Whether the page was rewritten, and therefore asks to be reloaded.
   * A change that no unit embeds leaves the page, and the selection, as it is:
   * re-running the tests for it would not tell anything new.
   */
  async regenerate(changedFile: string): Promise<boolean> {
    // re-bundle tests
    const esbuildResult = await this.esbuildContext?.rebuild();

    // get affected tests
    const tests = findImpactedTests(changedFile, esbuildResult?.metafile);

    if (tests.length === 0)
      return false;

    // this.generateTestPage
    //   options
    //   html
    await this.createTestHtml(tests);
    return true;
  }

  private async generateTestResources(): Promise<void> {
    // bootstrap
    const manifest = generateManifest();
    await outputJSON(`${TESTER_PLUGIN_DIR}/manifest.json`, manifest, { spaces: 2 });

    // manifest
    const bootstrap = generateBootstrap({
      port: this.port,
      startupDelay: this.ctx.test.startupDelay,
      waitForPlugin: this.ctx.test.waitForPlugin,
    });
    await outputFile(`${TESTER_PLUGIN_DIR}/bootstrap.js`, bootstrap);

    // test runtime (mocha + chai)
    await this.buildTestRuntime();

    // bundle tests
    await this.bundleTests();
  }

  /**
   * Build the test runtime into `content/test-runtime.js`.
   *
   * It is rebuilt on every test run: esbuild takes a few milliseconds, which is
   * much cheaper than the cache-key / content-hash / atomic-write management a
   * cache would need. The dynamic part (options) is decoupled from this file
   * and injected into `index.xhtml` instead.
   */
  private async buildTestRuntime(): Promise<void> {
    const entry = resolveRuntimeEntry();
    logger.debug(`Building test runtime from ${entry}`);

    await build({
      entryPoints: [entry],
      outfile: `${TESTER_PLUGIN_DIR}/content/test-runtime.js`,
      bundle: true,
      format: "iife",
      platform: "browser",
      target: "firefox115",
      logLevel: "silent",
    });
  }

  private async bundleTests(): Promise<void> {
    // `entries` and `exclude` are resolved here because esbuild only supports
    // `*` and `**` in an entry point glob, and because the positional arguments
    // of the CLI narrow the result down afterwards.
    // https://esbuild.github.io/api/#glob-style-entry-points
    const selected = await resolveTestEntries(this.ctx.test.entries, this.ctx.test.exclude);
    const filters = this.ctx.test.filter;
    const entryPoints = filterTestFiles(selected, filters);

    if (entryPoints.length === 0) {
      // Say whether the filters or the entries themselves selected nothing.
      if (selected.length > 0 && filters.length > 0)
        throw new Error(`No test file matched ${filters.join(", ")}; test.entries selected ${selected.length} file(s).`);

      const exclude = toArray(this.ctx.test.exclude);
      throw new Error(
        `No test file matched ${toArray(this.ctx.test.entries).join(", ")}`
        + `${
          exclude.length > 0
            ? ` after excluding ${exclude.join(", ")}`
            : ""
        }.`,
      );
    }

    // Bundle all test files, including both JavaScript and TypeScript.
    // The test API plugin is only attached here: the test runtime needs to
    // resolve mocha/chai for real.
    this.esbuildContext = await context({
      entryPoints,
      outdir: `${TESTER_PLUGIN_DIR}/content/units`,
      bundle: true,
      platform: "browser",
      target: "firefox115",
      metafile: true,
      plugins: [
        createTestApiPlugin(),
      ],
    });
    const result = await this.esbuildContext.rebuild();
    this.units = Object.keys(result.metafile?.outputs ?? {})
      .map(output => output.replace(`${TESTER_PLUGIN_DIR}/content/`, ""))
      .map(output => output.replaceAll(/\\/g, "/"))
      .sort();
  }

  private async createTestHtml(tests: string[] = []): Promise<void> {
    // runtime options
    const options: TestRuntimeOptions = {
      timeout: this.ctx.test.mocha.timeout,
      port: this.port,
      abortOnFail: this.ctx.test.abortOnFail,
      exitOnFinish: !this.ctx.test.watch,
    };

    // html
    // Without a selection the page loads every unit of the last bundle, which
    // is what a full `generate()` wants.
    let testFiles = tests;
    if (testFiles.length === 0) {
      // Going through the metafile instead of globbing the output directory
      // keeps stale units of a wider earlier run out of the page, e.g. after
      // narrowing `test.entries`.
      testFiles = this.units;
    }
    const html = generateHtml(options, testFiles);
    await outputFile(`${TESTER_PLUGIN_DIR}/content/index.xhtml`, html);
  }
}

/**
 * Determines which test files are impacted by a given changed file based on the esbuild metafile.
 *
 * This function analyzes the build metadata to find test files that depend on the changed file
 * either directly as an entry point or indirectly as an input. It is useful in a watch mode setup
 * to selectively rerun only the affected tests.
 *
 * @param {string} changedFilePath - The file path of the changed source file.
 * @param {BuildResult["metafile"]} buildMetadata - The esbuild metafile containing dependency information.
 * @returns {string[]} An array of impacted test file paths that need to be re-executed.
 */
export function findImpactedTests(changedFilePath: string, buildMetadata: BuildResult["metafile"]): string[] {
  if (!buildMetadata)
    return [];

  const resolvedChangedFile = resolve(changedFilePath);
  const impactedTestFiles = new Set<string>();

  for (const [outputFilePath, outputInfo] of Object.entries(buildMetadata.outputs)) {
    const testFilePath = outputFilePath.replace(`${TESTER_PLUGIN_DIR}/content/`, "");
    // const resolvedEntryPoint = outputInfo.entryPoint ? resolve(outputInfo.entryPoint) : null;

    if (Object.keys(outputInfo.inputs).some(inputPath => resolve(inputPath) === resolvedChangedFile)) {
      impactedTestFiles.add(testFilePath);
    }
  }
  return [...impactedTestFiles];
}
