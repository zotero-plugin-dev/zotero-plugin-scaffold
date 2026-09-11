import type { InputOptions, OutputChunk, OutputOptions, RolldownOutput } from "rolldown";
import type { Context } from "../../types/index.js";
import { relative, resolve } from "node:path";
import { cwd } from "node:process";
import { copy, outputFile, outputJSON, pathExists } from "fs-extra/esm";
import { rolldown } from "rolldown";
import { glob } from "tinyglobby";
import { CACHE_DIR, TESTER_PLUGIN_DIR, TESTER_PLUGIN_TESTS_DIR } from "../../constant.js";
import { saveResource } from "../../utils/file.js";
import { logger } from "../../utils/logger.js";
import { normalizePath, toArray } from "../../utils/string.js";
import { generateBootstrap, generateHtml, generateManifest, generateMochaSetup } from "./test-bundler-template/index.js";

export class TestBundler {
  private rolldownOutput?: RolldownOutput;
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
    await this.bundleTests();

    // get affected tests based on changed file
    const metadata = transformRolldownOutputToMetafile(this.rolldownOutput?.output);
    const tests = findImpactedTests(changedFile, metadata);

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
    // Find all test files
    const entryPoints = (await Promise.all(testDirs.map(dir => glob(`${dir}/**/*.{spec,test}.[jt]s`))))
      .flat();

    // configure rolldown options
    const rolldownInputOptions: InputOptions = {
      input: entryPoints,
      treeshake: false,
      preserveEntrySignatures: "allow-extension",
    };

    const outputOptions: OutputOptions = {
      dir: `${TESTER_PLUGIN_DIR}/content/units`,
      format: "esm",
      sourcemap: true,
      codeSplitting: false,
    };

    const rolldownBuild = await rolldown(rolldownInputOptions);
    this.rolldownOutput = await rolldownBuild.write(outputOptions);

    await rolldownBuild.close();
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
      testFiles = (await glob(`**/*.{spec,test}.js`, { cwd: `${TESTER_PLUGIN_TESTS_DIR}` })).sort();
    }
    const html = generateHtml(setupCode, testFiles);
    await outputFile(`${TESTER_PLUGIN_DIR}/content/index.xhtml`, html);
  }
}

interface _MetaData extends Pick<OutputChunk, "fileName" | "name" | "moduleIds"> {}
export type MetaData = _MetaData[];

function transformRolldownOutputToMetafile(output?: RolldownOutput["output"]): MetaData {
  if (!output)
    return [];

  return output
    .flat()
    .filter(r => r.type === "chunk")
    .map(r => ({
      fileName: normalizePath(r.fileName),
      name: r.name,
      moduleIds: r.moduleIds.map(id => relative(cwd(), id)).map(normalizePath),
    }));
}

/**
 * Determines which test files are impacted by a given changed file based on rolldown build output.
 *
 * This function analyzes the build metadata to find test files that depend on the changed file
 * either directly as an entry point or indirectly as an input.
 *
 * @param {string} changedFilePath - The file path of the changed source file.
 * @param {MetaData} buildMetadata - The transfromed rolldown build outputs.
 * @returns {string[]} An array of impacted test file names that need to be re-executed.
 */
export function findImpactedTests(
  changedFilePath: string,
  buildMetadata: MetaData,
): string[] {
  const normalizedChangedFile = resolve(changedFilePath);
  const impactedTestFiles = new Set<string>();

  for (const { fileName, moduleIds } of buildMetadata) {
    for (const moduleId of moduleIds) {
      const normalizedModuleId = resolve(moduleId);
      if (normalizedModuleId === normalizedChangedFile) {
        impactedTestFiles.add(fileName);
      }
    }
  }

  return [...impactedTestFiles];
}
