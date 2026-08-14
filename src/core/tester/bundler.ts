/**
 * Bundles the tester plugin for the Zotero test pool:
 *   - the vitest runtime chunk (expect/vi/@vitest/runner/birpc/flatted)
 *   - the in-page worker (src/core/tester/page) as content/setup.js
 *   - the test files as content/tests/*.js
 *   - the static plugin files (manifest/bootstrap/index.html)
 *   - the test manifest (source path → bundled artifact)
 *
 * The page and the test files import "vitest"/"@vitest/runner"/"birpc"/
 * "flatted"/"@vitest/utils/error" — all redirected to the shared runtime
 * chunk (../runtime.js) so every module has a single instance in the page.
 */
import { readFileSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { ensureDir, outputFile } from "fs-extra/esm";
import { rolldown } from "rolldown";
import { glob } from "tinyglobby";
import { logger } from "../../utils/logger.js";
import pageConsoleRaw from "./page/console.ts?raw";
import pageErrorCatcherRaw from "./page/error-catcher.ts?raw";
import pageIndexRaw from "./page/index.ts?raw";
import pageProtocolRaw from "./page/protocol.ts?raw";
import pageRpcRaw from "./page/rpc.ts?raw";
import pageRunnerRaw from "./page/runner.ts?raw";
import pageStateRaw from "./page/state.ts?raw";
import pageManifestRaw from "./page/tests-manifest.ts?raw";
import pageTransportRaw from "./page/transport.ts?raw";
import { TESTER_PLUGIN_ID } from "./pool/options.js";
import bootstrapRaw from "./template/bootstrap.js?raw";
import htmlRaw from "./template/index.html?raw";
import manifestRaw from "./template/manifest.json?raw";

const ROOT = fileURLToPath(new URL(".", import.meta.url));

const RUNTIME_ENTRY = `
export { describe, it, test, suite, beforeAll, afterAll, beforeEach, afterEach, onTestFinished, onTestFailed, aroundEach, aroundAll } from "vitest";
export { startTests, collectTests, processError, setupCommonEnv, format } from "vitest/internal/browser";
export { expect, vi, assert, should, chai, expectTypeOf, assertType, vitest } from "vitest";
export { createBirpc } from "birpc";
export { stringify, parse } from "flatted";
`;

const NODE_STUB_ID = "\0vitest-stub:node";
const MODULE_RUNNER_STUB_ID = "\0vitest-stub:module-runner";
// rolldown virtual module id for the baked test manifest (NUL prefix keeps it
// out of the file system namespace)
const TESTER_MANIFEST_ID = "\0tester-tests-manifest";
const WAIT_PLUGIN_ID = "\0tester-wait-plugin";

export interface BuildTesterPluginOptions {
  /** Output directory for the tester plugin (default: .scaffold/tester). */
  outDir: string;
  /** ID of the tester plugin (must match the proxy file name). */
  testerPluginId?: string;
  /** Port of the HTTP bridge, injected into bootstrap.js. */
  port: number;
  /** Directory to search for test files (default: process.cwd()). */
  testDir?: string;
  /** Test file globs (default: vitest's default include). */
  testFiles?: string[];
  /** Chrome registration reference for the tester plugin. */
  chromeRef?: string;
  /**
   * Build stamp baked into test artifact names (tests/<stamp>-<file>.js).
   * Watch mode rebuilds pass a fresh stamp so the page re-imports new URLs
   * instead of hitting the module cache.
   */
  stamp?: string;
  /**
   * "tests-only" skips the static files, runtime chunk and page worker and
   * rebuilds just the test artifacts. Safe because watch takeovers hand the
   * manifest to the page via the run context, so setup.js need not change.
   * Defaults to "full".
   */
  mode?: "full" | "tests-only";
  /**
   * Explicit test file paths to bundle (absolute). Skips the glob step —
   * watch takeovers pass the run request's context.files (vitest's
   * affected-file set), which is the minimal correct set: files not in it
   * are not re-run, and files whose shared deps changed are included by
   * vitest's dependency tracking. Defaults to globbing `testFiles`.
   */
  files?: string[];
  /**
   * Vitest setupFiles (absolute paths) to bundle alongside the test files.
   * They are loaded by the page's runner.importFile(type "setup") before
   * each collected file, so they must be part of the manifest too.
   */
  setupFiles?: string[];
  /**
   * Legacy plugin-ready expression (`() => Zotero.MyPlugin.initialized`).
   * Baked into the page (wait-plugin virtual module); the page polls it
   * before the run starts.
   */
  waitForPlugin?: string;
}

function resolveDeps(): Record<string, string> {
  // exports["."] may be nested: { import: { default }, require: { default } }.
  // Picks the first resolvable entry in priority order.
  const pickEntry = (t: unknown): string | undefined => {
    if (typeof t === "string") {
      return t;
    }
    if (t && typeof t === "object") {
      const o = t as Record<string, unknown>;
      for (const key of ["import", "default", "require", "browser"]) {
        const v = pickEntry(o[key]);
        if (v) {
          return v;
        }
      }
    }
    return undefined;
  };

  // Resolve the ESM entry of each package by reading its exports map.
  // require.resolve() would return vitest's CJS entry (dist/index.cjs),
  // which throws when required.
  const req = createRequire(join(ROOT, "package.json"));
  const resolve = (id: string): string => {
    const pkgDir = dirname(req.resolve(`${id}/package.json`));
    const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")) as {
      exports?: Record<string, unknown> | string;
      module?: string;
      main?: string;
    };
    const exportsMap = typeof pkg.exports === "string" ? undefined : pkg.exports;
    const rel = pickEntry(exportsMap?.["."]) ?? pkg.module ?? pkg.main;
    if (!rel) {
      throw new Error(`Cannot resolve ESM entry for ${id}`);
    }
    return join(pkgDir, rel);
  };
  // vitest 5 merged @vitest/runner and @vitest/utils into the main package;
  // the in-page runtime entry lives behind the ./internal/browser export.
  const vitestDir = dirname(req.resolve("vitest/package.json"));
  const vitestPkg = JSON.parse(readFileSync(join(vitestDir, "package.json"), "utf8")) as {
    exports?: Record<string, unknown>;
  };
  const browserRel = pickEntry(vitestPkg.exports?.["./internal/browser"]);
  if (!browserRel) {
    throw new Error("Cannot resolve vitest/internal/browser entry (vitest 5 required)");
  }
  return {
    vitest: resolve("vitest"),
    vitestBrowser: join(vitestDir, browserRel),
    birpc: resolve("birpc"),
    flatted: resolve("flatted"),
  };
}

export async function buildTesterPlugin(options: BuildTesterPluginOptions): Promise<Record<string, string>> {
  const outDir = options.outDir;
  const contentDir = join(outDir, "content");
  const chromeRef = options.chromeRef ?? "zotero-tester";
  const stamp = options.stamp ?? "";
  const testsOnly = options.mode === "tests-only";
  await ensureDir(contentDir);

  if (!testsOnly) {
    // ---- static plugin files (inlined via ?raw, no fs reads) ----
    await writeFile(
      join(outDir, "manifest.json"),
      manifestRaw.replaceAll("__TESTER_PLUGIN_ID__", options.testerPluginId ?? TESTER_PLUGIN_ID),
    );
    await writeFile(join(contentDir, "index.html"), htmlRaw);
    const bootstrap = bootstrapRaw
      .replaceAll("__CHROME_REF__", chromeRef)
      .replaceAll("__PORT__", String(options.port));
    await writeFile(join(outDir, "bootstrap.js"), bootstrap);
  }

  // ---- test file discovery ----
  const testDir = options.testDir ?? process.cwd();
  const testFiles = options.files
    ?? await glob(options.testFiles ?? ["**/*.{test,spec}.?(c|m)[jt]s?(x)"], { cwd: testDir, absolute: true });
  const sep = String.fromCharCode(92); // backslash, built at runtime to dodge escaping
  const manifest: Record<string, string> = {};
  const testInput: Record<string, string> = {};
  const inputFiles = [...testFiles, ...(options.setupFiles ?? [])];
  for (const file of inputFiles) {
    const relPath = relative(testDir, file).split(sep).join("/");
    // flatten the source path so every artifact sits directly in content/tests/
    // (their relative import "../runtime.js" then resolves correctly); the
    // stamp prefix cache-busts the import URL across watch rebuilds
    const flatName = relPath.split("/").join("_");
    const baseName = flatName.slice(0, flatName.lastIndexOf("."));
    const outName = `tests/${stamp ? `${stamp}-` : ""}${baseName}.js`;
    testInput[outName.slice(0, outName.lastIndexOf("."))] = file;
    manifest[file.split(sep).join("/")] = outName;
  }
  // setup files also participate in the "bundled N files" log for clarity
  const testFilesCount = testFiles.length;

  if (!testsOnly) {
    // ---- bundle the vitest runtime ----
    const deps = resolveDeps();
    const runtimeEntry = join(outDir, ".tmp-runtime-entry.js");
    await outputFile(runtimeEntry, RUNTIME_ENTRY);
    const runtimeBuild = await rolldown({
      input: runtimeEntry,
      platform: "browser",
      treeshake: false,
      plugins: [createRuntimeResolvePlugin(deps)],
    });
    try {
      await runtimeBuild.write({
        dir: contentDir,
        format: "esm",
        entryFileNames: "runtime.js",
        sourcemap: true,
      });
    }
    finally {
      // close() frees rolldown's Rust threads/file handles — without it the
      // process stays alive (vitest then force-exits after teardownTimeout).
      await runtimeBuild.close();
    }
    await rm(runtimeEntry, { force: true });

    // ---- bundle the page worker (content/setup.js) ----
    // The page sources are inlined into this module via ?raw (tsdown Raw
    // plugin); materialize them in a temp dir so rolldown can bundle them.
    // Lives under the OS temp dir (keyed by outDir) rather than inside outDir:
    // on Windows rolldown can still hold handles when we try to remove it,
    // and a failed rmdir inside outDir broke the next build.
    const pageTmp = join(
      tmpdir(),
      `zotero-tester-page-${outDir.replace(/[\\/:]/g, "_")}`,
    );
    await ensureDir(pageTmp);
    const pageFiles: Array<[string, string]> = [
      ["index.ts", pageIndexRaw],
      ["protocol.ts", pageProtocolRaw],
      ["rpc.ts", pageRpcRaw],
      ["runner.ts", pageRunnerRaw],
      ["state.ts", pageStateRaw],
      ["tests-manifest.ts", pageManifestRaw],
      ["transport.ts", pageTransportRaw],
      ["console.ts", pageConsoleRaw],
      ["error-catcher.ts", pageErrorCatcherRaw],
    ];
    for (const [name, source] of pageFiles) {
      await writeFile(join(pageTmp, name), source);
    }
    try {
      const pageBuild = await rolldown({
        input: join(pageTmp, "index.ts"),
        platform: "browser",
        treeshake: false,
        plugins: [
          createRuntimeAliasPlugin("./runtime.js"),
          {
            name: "tester-page-manifest",
            resolveId(source, importer) {
              if (source.endsWith("tests-manifest.js") && importer?.startsWith(pageTmp)) {
                return TESTER_MANIFEST_ID;
              }
              if (source.endsWith("wait-plugin.js") && importer?.startsWith(pageTmp)) {
                return WAIT_PLUGIN_ID;
              }
              return null;
            },
            load(id) {
              if (id === TESTER_MANIFEST_ID) {
                return `export default ${JSON.stringify(manifest)};`;
              }
              if (id === WAIT_PLUGIN_ID) {
                // The page polls this before starting; null means "no wait".
                const expr = options.waitForPlugin?.trim();
                return `export const waitForPluginReady = ${expr ? `(${expr})` : "null"};`;
              }
              return null;
            },
          },
        ],
      });
      try {
        await pageBuild.write({
          dir: contentDir,
          format: "esm",
          entryFileNames: "setup.js",
          sourcemap: true,
        });
      }
      finally {
        await pageBuild.close();
      }
    }
    finally {
      await rm(pageTmp, { recursive: true, force: true }).catch(() => {});
    }
  }
  // ---- bundle the test files (the only step in tests-only mode) ----
  if (Object.keys(testInput).length > 0) {
    const testsBuild = await rolldown({
      input: testInput,
      platform: "browser",
      treeshake: false,
      plugins: [createRuntimeAliasPlugin("../runtime.js")],
    });
    try {
      await testsBuild.write({
        dir: contentDir,
        format: "esm",
        entryFileNames: "[name].js",
        sourcemap: true,
      });
    }
    finally {
      await testsBuild.close();
    }
  }

  logger.debug(`[zotero-pool] bundled ${testFilesCount} test file(s) → ${contentDir}`);
  return manifest;
}

/** Resolves vitest packages to their ESM entries and stubs node/vite internals. */
function createRuntimeResolvePlugin(deps: Record<string, string>) {
  return {
    name: "tester-runtime-resolve",
    resolveId(source: string) {
      if (source === "vitest")
        return deps.vitest;
      if (source === "vitest/internal/browser")
        return deps.vitestBrowser;
      if (source === "birpc")
        return deps.birpc;
      if (source === "flatted")
        return deps.flatted;
      if (source === "vite/module-runner")
        return MODULE_RUNNER_STUB_ID;
      if (source.startsWith("node:"))
        return NODE_STUB_ID;
      return null;
    },
    load(id: string) {
      if (id === MODULE_RUNNER_STUB_ID) {
        return `
export class ModuleRunner {
  constructor() {
    throw new Error("ModuleRunner is not available inside Zotero");
  }
}
// vitest 5 evaluates "class VitestEvaluatedModules extends EvaluatedModules"
// at module top level, so the base class must exist (undefined would throw
// "class heritage (void 0) is not an object or null" on page load).
export class EvaluatedModules {
  getModuleSourceMapById() {
    return undefined;
  }
}
export const ssrImportKey = Symbol.for("vite:import");
export const ssrDynamicImportKey = Symbol.for("vite:dynamic-import");
export const ssrModuleExportsKey = Symbol.for("vite:module-exports");
export const ssrExportAllKey = Symbol.for("vite:export-all");
export const ssrImportMetaKey = Symbol.for("vite:import-meta");
`;
      }
      if (id === NODE_STUB_ID) {
        return "export default undefined;\nexport const registerHooks = undefined;\nexport const register = undefined;\n";
      }
      return null;
    },
  };
}

/**
 * Redirects runtime imports in the page worker and test files to the shared
 * runtime chunk, so all vitest modules have a single instance in the page.
 *
 * The external id is relative to the generated chunk location:
 *   - the page worker is emitted as content/setup.js → "./runtime.js"
 *   - test files are emitted as content/tests/*.js → "../runtime.js"
 */
function createRuntimeAliasPlugin(runtimePath: string) {
  return {
    name: "tester-runtime-alias",
    resolveId(source: string) {
      if (
        source === "vitest"
        || source === "vitest/internal/browser"
        // legacy: test files written against @vitest/runner (vitest 4)
        || source === "@vitest/runner"
        || source === "chai"
        || source === "birpc"
        || source === "flatted"
        || source === "@vitest/utils/error"
      ) {
        return { id: runtimePath, external: true };
      }
      return null;
    },
  };
}
