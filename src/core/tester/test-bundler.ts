import type { BuildContext, BuildResult } from "esbuild";
import type { Context } from "../../types/index.js";
import { resolve } from "node:path";
import { context } from "esbuild";
import { copy, outputFile, outputJSON, pathExists } from "fs-extra/esm";
import { glob } from "tinyglobby";
import { CACHE_DIR, TESTER_PLUGIN_DIR } from "../../constant.js";
import { saveResource } from "../../utils/file.js";
import { logger } from "../../utils/logger.js";
import { toArray } from "../../utils/string.js";
import { generateBootstrap, generateHtml, generateManifest, generateMochaSetup } from "./test-bundler-template/index.js";

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
    //   copy lib
    //   bundle tests
    await this.generateTestResources();

    // this.generateTestPage
    //   mocha setup
    //   html
    await this.createTestHtml();
  }

  async regenerate(changedFile: string): Promise<void> {
    // re-bundle tests
    const esbuildResult = await this.esbuildContext?.rebuild();

    // get affected tests
    const tests = findImpactedTests(changedFile, esbuildResult?.metafile);

    // this.generateTestPage
    //   mocha setup
    //   html
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

    // copy lib
    await this.copyTestLibraries();

    // bundle tests
    await this.bundleTests();
  }

  private async copyTestLibraries() {
    // Save mocha and chai packages
    const pkgs: {
      name: string;
      remote: string;
      local: string;
    }[] = [
      {
        name: "mocha.js",
        local: "node_modules/mocha/mocha.js",
        remote: "https://cdn.jsdelivr.net/npm/mocha/mocha.js",
      },
      {
        name: "chai.js",
        // local: "node_modules/chai/chai.js",
        local: "", // chai packages install from npm do not support browser
        remote: "https://www.chaijs.com/chai.js",
      },
    ];

    await Promise.all(pkgs.map(async (pkg) => {
      const targetPath = `${TESTER_PLUGIN_DIR}/content/${pkg.name}`;

      if (pkg.local && await pathExists(pkg.local)) {
        logger.debug(`Local ${pkg.name} package found`);
        await copy(pkg.local, targetPath);
        return;
      }

      const cachePath = `${CACHE_DIR}/${pkg.name}`;
      if (await pathExists(`${cachePath}`)) {
        logger.debug(`Cache ${pkg.name} package found`);
        await copy(cachePath, targetPath);
        return;
      }

      logger.info(`No local ${pkg.name} found, we recommend you install ${pkg.name} package locally.`);
      await saveResource(pkg.remote, `${CACHE_DIR}/${pkg.name}`);
      await copy(cachePath, targetPath);
    }));
  }

  private async bundleTests() {
    const testDirs = toArray(this.ctx.test.entries);
    // Because esbuild only support `*` and `**`，
    // so we need glob ourselves.
    // https://esbuild.github.io/api/#glob-style-entry-points
    const entryPoints = (await Promise.all(testDirs.map(dir => glob(`${dir}/**/*.{spec,test}.[jt]s`))))
      .flat();

    // Bundle all test files, including both JavaScript and TypeScript
    this.esbuildContext = await context({
      entryPoints,
      outdir: `${TESTER_PLUGIN_DIR}/content/units`,
      bundle: true,
      target: "firefox115",
      metafile: true,
    });
    await this.esbuildContext.rebuild();
  }

  private async createTestHtml(tests: string[] = []) {
    // mocha setup
    const setupCode = generateMochaSetup({
      timeout: this.ctx.test.mocha.timeout,
      port: this.port,
      abortOnFail: this.ctx.test.abortOnFail,
      exitOnFinish: !this.ctx.test.watch,
    });

    // html
    let testFiles = tests;
    if (testFiles.length === 0) {
      testFiles = (await glob(`**/*.{spec,test}.js`, { cwd: `${TESTER_PLUGIN_DIR}/content` })).sort();
    }
    const html = generateHtml(setupCode, testFiles);
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
  return Array.from(impactedTestFiles);
}
