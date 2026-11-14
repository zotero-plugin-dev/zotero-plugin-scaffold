import type { BuildContext, BuildResult, Plugin } from "esbuild";
import type { Context } from "../../types/index.js";
import type { TestPageConfig } from "./protocol.js";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { context } from "esbuild";
import { copy, outputFile, outputJSON } from "fs-extra/esm";
import { glob } from "tinyglobby";
import { TESTER_PLUGIN_DIR } from "../../constant.js";
import { toArray } from "../../utils/string.js";
import { MOCHA_BDD_NAMES } from "./assertions/mocha.js";
import { generateBootstrap, generateHtml, generateManifest } from "./test-bundler-template/index.js";

/** The specifier users import the assertion API from in their test files. */
const TEST_API_SPECIFIER = "zotero-plugin-scaffold/test";

/** Files of the prebuilt page runtime, in load order. */
const PAGE_RUNTIME_FILES = ["test-api.js", "mocha-setup.js"] as const;

/**
 * Values `zotero-plugin-scaffold/test` exposes to the test files.
 *
 * The page shim must export all of them, and a unit test keeps this list in
 * sync with `assertions/index.ts`.
 */
export const TEST_API_EXPORTS: readonly string[] = [
  "assert",
  "chai",
  "expect",
  "should",
  ...MOCHA_BDD_NAMES,
];

/**
 * Resolves a file of the prebuilt page runtime (`dist/page/`).
 *
 * The tester must not rent these files from the test project, they belong to
 * the version of scaffold that is running.
 */
function resolvePageRuntimeFile(file: string): string {
  let dir = dirname(fileURLToPath(import.meta.url));

  for (;;) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { name?: string };
      if (pkg.name === "zotero-plugin-scaffold") {
        const path = join(dir, "dist/page", file);
        if (existsSync(path))
          return path;

        throw new Error(`Cannot find \`${file}\` in \`${dir}/dist/page\`, run \`pnpm build\` first.`);
      }
    }

    const parent = dirname(dir);
    if (parent === dir)
      throw new Error(`Cannot locate the zotero-plugin-scaffold package root from \`${import.meta.url}\`.`);
    dir = parent;
  }
}

export class TestBundler {
  private esbuildContext?: BuildContext;
  constructor(
    private ctx: Context,
    private port: number,
  ) {
    //
  }

  async generate(): Promise<void> {
    // this.generatePluginRes
    //   bootstrape
    //   manifest
    //   copy the prebuilt page runtime
    //   bundle tests
    await this.generateTestResources();

    // this.generateTestPage
    //   config + html
    await this.createTestHtml();
  }

  async regenerate(changedFile: string): Promise<void> {
    // re-bundle tests
    const esbuildResult = await this.esbuildContext?.rebuild();

    // get affected tests
    const tests = findImpactedTests(changedFile, esbuildResult?.metafile);

    // this.generateTestPage
    //   config + html
    await this.createTestHtml(tests);
  }

  private async generateTestResources() {
    // bootstrape
    const manifest = generateManifest();
    await outputJSON(`${TESTER_PLUGIN_DIR}/manifest.json`, manifest, { spaces: 2 });

    // manifest
    const bootstrap = generateBootstrap({
      port: this.port,
      startupDelay: this.ctx.test.startupDelay,
      waitForPlugin: this.ctx.test.waitForPlugin,
    });
    await outputFile(`${TESTER_PLUGIN_DIR}/bootstrap.js`, bootstrap);

    // copy the prebuilt page runtime
    await this.copyTestRuntime();

    // bundle tests
    await this.bundleTests();
  }

  /**
   * Copies the prebuilt page runtime into the tester plugin: Mocha's browser
   * build, plus `test-api.js` (chai + expect) and `mocha-setup.js` (the Mocha
   * reporter and the assertion checks) from `dist/page/`.
   *
   * They are built when scaffold is published, never on the user's machine,
   * see `tsdown.config.ts`.
   */
  private async copyTestRuntime() {
    const mochaDir = dirname(createRequire(import.meta.url).resolve("mocha"));

    await Promise.all([
      copy(join(mochaDir, "mocha.js"), `${TESTER_PLUGIN_DIR}/content/mocha.js`),
      ...PAGE_RUNTIME_FILES.map(async (file) => {
        await copy(resolvePageRuntimeFile(file), `${TESTER_PLUGIN_DIR}/content/${file}`);
      }),
    ]);
  }

  /**
   * Resolves imports of `zotero-plugin-scaffold/test` in test files to the
   * page globals, instead of bundling a second `chai`/`expect` per test file.
   * Reading the globals (instead of forwarding in `assertions/`) keeps
   * Mocha's `it.only` / `describe.skip` and friends available.
   */
  private testApiShimPlugin(): Plugin {
    const namespace = "zotero-plugin-scaffold-test-api";
    const filter = new RegExp(`^${TEST_API_SPECIFIER.replaceAll("/", "\\/")}$`);

    return {
      name: "zotero-plugin-scaffold-test-api-shim",
      setup(build) {
        build.onResolve({ filter }, args => ({ namespace, path: args.path }));
        build.onLoad({ filter: /.*/, namespace }, () => ({
          contents: [
            "const api = globalThis;",
            ...TEST_API_EXPORTS.map(name => `export const ${name} = api.${name};`),
            "",
          ].join("\n"),
          loader: "js",
          resolveDir: process.cwd(),
        }));
      },
    };
  }

  private async bundleTests() {
    const testDirs = toArray(this.ctx.test.entries);
    // Because esbuild only support `*` and `**`，
    // so we need glob ourselves.
    // https://esbuild.github.io/api/#glob-style-entry-points
    const entryPoints = (await Promise.all(testDirs.map(dir => glob(`${dir}/**/*.{spec,test}.[jt]s`, { dot: true }))))
      .flat();

    // Bundle all test files, including both JavaScript and TypeScript
    this.esbuildContext = await context({
      entryPoints,
      outdir: `${TESTER_PLUGIN_DIR}/content/units`,
      bundle: true,
      plugins: [
        this.testApiShimPlugin(),
      ],
      target: "firefox115",
      metafile: true,
    });
    await this.esbuildContext.rebuild();
  }

  private async createTestHtml(tests: string[] = []) {
    const config: TestPageConfig = {
      port: this.port,
      timeout: this.ctx.test.mocha.timeout,
      abortOnFail: this.ctx.test.abortOnFail,
      exitOnFinish: !this.ctx.test.watch,
    };

    // html
    let testFiles = tests;
    if (testFiles.length === 0) {
      testFiles = (await glob(`**/*.{spec,test}.js`, { cwd: `${TESTER_PLUGIN_DIR}/content` })).sort();
    }
    const html = generateHtml(config, testFiles);
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
