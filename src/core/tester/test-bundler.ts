import type { InputOptions, OutputChunk, OutputOptions, RolldownOutput, RolldownPluginOption } from "rolldown";
import type { Context } from "../../types/index.js";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join, relative, resolve } from "node:path";
import { cwd } from "node:process";
import { outputFile, outputJSON } from "fs-extra/esm";
import { rolldown } from "rolldown";
import { glob } from "tinyglobby";
import { CACHE_DIR, TESTER_PLUGIN_DIR, TESTER_PLUGIN_TESTS_DIR } from "../../constant.js";
import { logger } from "../../utils/logger.js";
import { normalizePath, toArray } from "../../utils/string.js";
import { generateBootstrap, generateHtml, generateManifest, generateVitestSetup } from "./test-bundler-template/index.js";

/**
 * The generated entry of the Vitest runtime chunk.
 *
 * Everything that plugin tests may import from `vitest` is re-exported here,
 * so a single shared module instance is loaded in the test page and all
 * bundled test files import from it. Sharing the module instance is what makes
 * `describe`/`it` registrations from different test files land in the same
 * suite state of the runner.
 */
const VITEST_RUNTIME_ENTRY = `
export { expect, vi, assert, should } from "vitest";
export {
  describe, it, test, suite,
  beforeAll, afterAll, beforeEach, afterEach,
  startTests,
} from "@vitest/runner";
`;

/**
 * Resolves the ESM entry of a package, e.g. `vitest/dist/index.js`, using the
 * `exports` map of the package.
 *
 * `createRequire` is used instead of `import.meta.resolve` so that we can also
 * resolve from the user's project directory, not only from the scaffold.
 */
function resolvePackageEntry(name: string, from: string): string | undefined {
  try {
    const require = createRequire(from);
    const pkgPath = require.resolve(`${name}/package.json`);
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      exports?: Record<string, { import?: { default?: string }; default?: string }>;
      module?: string;
      main?: string;
    };
    const entry = pkg.exports?.["."]?.import?.default ?? pkg.module ?? pkg.main;
    return entry ? resolve(dirname(pkgPath), entry) : undefined;
  }
  catch {
    return undefined;
  }
}

/**
 * Resolves `vitest` and `@vitest/runner`, preferring the user's project copy
 * (like the previous mocha setup preferred a local `mocha` installation),
 * falling back to the scaffold's own installation.
 */
function resolveVitestRuntimeEntries(): { vitest: string; runner: string } {
  // The CLI runs from the plugin project root, which is where the user's
  // `vitest` installation lives (mirroring how the mocha setup preferred a
  // local mocha over the CDN copy).
  const projectRoot = join(cwd(), "package.json");
  const vitest = resolvePackageEntry("vitest", projectRoot)
    ?? resolvePackageEntry("vitest", import.meta.url);

  // Resolve @vitest/runner relative to the vitest package itself: in a pnpm
  // layout it lives as a sibling of vitest inside the virtual store, which is
  // not reachable from the project root or from the scaffold's own directory.
  const runner = (vitest && resolvePackageEntry("@vitest/runner", vitest))
    ?? resolvePackageEntry("@vitest/runner", projectRoot)
    ?? resolvePackageEntry("@vitest/runner", import.meta.url);

  if (!vitest || !runner) {
    throw new Error(
      "vitest@^4 is required to run tests in Zotero but could not be resolved.\n"
      + "Install it in your project: npm install -D vitest@^4",
    );
  }
  return { vitest, runner };
}

/**
 * Bundles the Vitest runtime (`expect`, `vi`, runner) into a single ES module
 * that the test page loads before any test file.
 *
 * The generated entry imports from `vitest` and `@vitest/runner`, which are
 * resolved here at build time. `vite/module-runner` (only reachable through
 * `vi.mock` machinery) is stubbed out, since module mocking requires Vite's
 * transform pipeline and is not supported inside Zotero.
 */
export async function bundleVitestRuntime(outfile: string): Promise<void> {
  const { vitest, runner } = resolveVitestRuntimeEntries();
  logger.debug(`Bundling Vitest runtime from ${vitest}`);

  // Rolldown `input` requires a real file path, so write the entry to the
  // scaffold cache directory first.
  const entryFile = resolve(CACHE_DIR, "vitest-runtime-entry.js");
  await outputFile(entryFile, VITEST_RUNTIME_ENTRY);

  const build = await rolldown({
    input: entryFile,
    platform: "browser",
    treeshake: false,
    preserveEntrySignatures: "allow-extension",
    plugins: [createVitestRuntimeResolvePlugin({ vitest, runner })],
  });
  await build.write({
    dir: dirname(outfile),
    entryFileNames: basename(outfile),
    format: "esm",
    sourcemap: true,
  });
  await build.close();
}

/**
 * Resolves `vitest`/`@vitest/runner` to absolute paths when bundling the
 * runtime chunk, and stubs out `vite/module-runner` (see `bundleVitestRuntime`).
 */
function createVitestRuntimeResolvePlugin(entries: { vitest: string; runner: string }): RolldownPluginOption {
  // vi.mock() requires Vite's module transform pipeline and is not supported inside Zotero.
  const STUB_ID = "\0vitest-stub:vite-module-runner";
  const stub = `
export class ModuleRunner {
  constructor() {
    throw new Error("vi.mock() is not supported in Zotero: it requires Vite's module transform pipeline.");
  }
}
export const EvaluatedModules = undefined;
`;

  return {
    name: "vitest-runtime-resolve",
    resolveId(source) {
      if (source === "vitest")
        return entries.vitest;
      if (source === "@vitest/runner")
        return entries.runner;
      if (source === "vite/module-runner")
        return STUB_ID;
      return null;
    },
    load(id) {
      if (id === STUB_ID)
        return stub;
      return null;
    },
  };
}

/**
 * Aliases `vitest` (and the `@vitest/*` packages) to the shared runtime chunk
 * when bundling test files, so every test file imports from the same module
 * instance and no duplicate runner state is created.
 *
 * Test chunks are emitted to `content/units/`, the runtime to `content/`.
 */
export function createVitestAliasPlugin(): RolldownPluginOption {
  return {
    name: "vitest-alias",
    resolveId(source) {
      if (source === "vitest" || source === "chai" || /^@vitest\/(?:expect|runner|spy|snapshot|utils|pretty-format|mocker)$/.test(source)) {
        return { id: "../vitest-runtime.js", external: true };
      }
      return null;
    },
  };
}

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
    //   runtime
    //   bundle tests
    await this.generateTestResources();

    // this.generateTestPage
    //   setup (test list + runner)
    await this.createSetup();
  }

  async regenerate(changedFile: string): Promise<void> {
    // re-bundle tests
    await this.bundleTests();

    // get affected tests based on changed file
    const metadata = transformRolldownOutputToMetafile(this.rolldownOutput?.output);
    const tests = findImpactedTests(changedFile, metadata);

    // this.generateTestPage
    //   setup (rerun only impacted tests)
    await this.createSetup(tests);
  }

  private async generateTestResources() {
    // manifest
    const manifest = generateManifest();
    await outputJSON(`${TESTER_PLUGIN_DIR}/manifest.json`, manifest, { spaces: 2 });

    // bootstrap
    const bootstrap = generateBootstrap({
      port: this.port,
      startupDelay: this.ctx.test.startupDelay,
      waitForPlugin: this.ctx.test.waitForPlugin,
    });
    await outputFile(`${TESTER_PLUGIN_DIR}/bootstrap.js`, bootstrap);

    // test page
    await outputFile(`${TESTER_PLUGIN_DIR}/content/index.xhtml`, generateHtml());

    // vitest runtime
    await bundleVitestRuntime(`${TESTER_PLUGIN_DIR}/content/vitest-runtime.js`);

    // bundle tests
    await this.bundleTests();
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
      plugins: [createVitestAliasPlugin()],
    };

    const outputOptions: OutputOptions = {
      dir: `${TESTER_PLUGIN_TESTS_DIR}`,
      format: "esm",
      sourcemap: true,
      codeSplitting: false,
    };

    const rolldownBuild = await rolldown(rolldownInputOptions);
    this.rolldownOutput = await rolldownBuild.write(outputOptions);

    await rolldownBuild.close();
  }

  private async createSetup(tests: string[] = []) {
    let testFiles = tests;
    if (testFiles.length === 0) {
      testFiles = (await glob(`**/*.{spec,test}.js`, { cwd: `${TESTER_PLUGIN_TESTS_DIR}` })).sort();
    }
    const setupCode = generateVitestSetup({
      timeout: this.ctx.test.vitest.timeout,
      port: this.port,
      abortOnFail: this.ctx.test.abortOnFail,
      exitOnFinish: !this.ctx.test.watch,
      testFiles,
    });
    await outputFile(`${TESTER_PLUGIN_DIR}/content/setup.js`, setupCode);
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
