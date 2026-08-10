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
import { readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { copy, ensureDir, outputFile } from "fs-extra/esm";
import { rolldown } from "rolldown";
import { glob } from "tinyglobby";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const TEMPLATE_DIR = join(ROOT, "template");
const PAGE_DIR = join(ROOT, "page");

const RUNTIME_ENTRY = `
export { describe, it, test, suite, beforeAll, afterAll, beforeEach, afterEach, startTests, collectTests } from "@vitest/runner";
export { expect, vi, assert, should } from "vitest";
export { createBirpc } from "birpc";
export { serializeError } from "@vitest/utils/error";
export { stringify, parse } from "flatted";
`;

const NODE_STUB_ID = "\0vitest-stub:node";
const MODULE_RUNNER_STUB_ID = "\0vitest-stub:module-runner";

export interface BuildTesterPluginOptions {
  /** Output directory for the tester plugin (default: .scaffold/tester). */
  outDir: string;
  /** Port of the HTTP bridge, injected into bootstrap.js. */
  port: number;
  /** Directory to search for test files (default: process.cwd()). */
  testDir?: string;
  /** Test file globs (default: vitest's default include). */
  testFiles?: string[];
  /** Chrome registration reference for the tester plugin. */
  chromeRef?: string;
}

function resolveDeps(): Record<string, string> {
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
    // exports["."] may be nested: { import: { default }, require: { default } }
    const pick = (t: unknown): string | undefined => {
      if (typeof t === "string") {
        return t;
      }
      if (t && typeof t === "object") {
        const o = t as Record<string, unknown>;
        for (const key of ["import", "default", "require", "browser"]) {
          const v = pick(o[key]);
          if (v) {
            return v;
          }
        }
      }
      return undefined;
    };
    const exportsMap = typeof pkg.exports === "string" ? undefined : pkg.exports;
    const rel = pick(exportsMap?.["."]) ?? pkg.module ?? pkg.main;
    if (!rel) {
      throw new Error(`Cannot resolve ESM entry for ${id}`);
    }
    return join(pkgDir, rel);
  };
  return {
    vitest: resolve("vitest"),
    runner: resolve("@vitest/runner"),
    birpc: resolve("birpc"),
    utils: resolve("@vitest/utils"),
  };
}

export async function buildTesterPlugin(options: BuildTesterPluginOptions): Promise<void> {
  const outDir = options.outDir;
  const contentDir = join(outDir, "content");
  const chromeRef = options.chromeRef ?? "zotero-tester";
  await ensureDir(contentDir);

  // ---- static plugin files ----
  await copy(join(TEMPLATE_DIR, "manifest.json"), join(outDir, "manifest.json"));
  await copy(join(TEMPLATE_DIR, "index.html"), join(contentDir, "index.html"));
  let bootstrap = await readFile(join(TEMPLATE_DIR, "bootstrap.js"), "utf8");
  bootstrap = bootstrap.replaceAll("__CHROME_REF__", chromeRef).replaceAll("__PORT__", String(options.port));
  await writeFile(join(outDir, "bootstrap.js"), bootstrap);

  // ---- test file discovery ----
  const testDir = options.testDir ?? process.cwd();
  const patterns = options.testFiles ?? ["**/*.{test,spec}.?(c|m)[jt]s?(x)"];
  const testFiles = await glob(patterns, { cwd: testDir, absolute: true });
  const sep = String.fromCharCode(92); // backslash, built at runtime to dodge escaping
  const manifest: Record<string, string> = {};
  const testInput: Record<string, string> = {};
  for (const file of testFiles) {
    const relPath = relative(testDir, file).split(sep).join("/");
    const outName = `tests/${relPath.replace(/\.(m|c)?[jt]sx?$/, ".js")}`;
    testInput[outName.replace(/\.js$/, "")] = file;
    manifest[file.split(sep).join("/")] = outName;
  }

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
  await runtimeBuild.write({
    dir: contentDir,
    format: "esm",
    entryFileNames: "runtime.js",
    sourcemap: true,
  });
  await rm(runtimeEntry, { force: true });

  // ---- bundle the page worker (content/setup.js) ----
  const pageBuild = await rolldown({
    input: join(PAGE_DIR, "index.ts"),
    platform: "browser",
    treeshake: false,
    plugins: [
      createRuntimeAliasPlugin(),
      {
        name: "tester-page-manifest",
        resolveId(source, importer) {
          if (source.endsWith("tests-manifest.js") && importer?.startsWith(PAGE_DIR)) {
            return "\0tester-tests-manifest";
          }
          return null;
        },
        load(id) {
          if (id === "\0tester-tests-manifest") {
            return `export default ${JSON.stringify(manifest)};`;
          }
          return null;
        },
      },
    ],
  });
  await pageBuild.write({
    dir: contentDir,
    format: "esm",
    entryFileNames: "setup.js",
    sourcemap: true,
  });

  // ---- bundle the test files ----
  if (Object.keys(testInput).length > 0) {
    const testsBuild = await rolldown({
      input: testInput,
      platform: "browser",
      treeshake: false,
      plugins: [createRuntimeAliasPlugin()],
    });
    await testsBuild.write({
      dir: contentDir,
      format: "esm",
      entryFileNames: "[name].js",
      sourcemap: true,
    });
  }

  process.stdout.write(`[zotero-pool] bundled ${testFiles.length} test file(s) → ${contentDir}
`);
}

/** Resolves vitest packages to their ESM entries and stubs node/vite internals. */
function createRuntimeResolvePlugin(deps: Record<string, string>) {
  return {
    name: "tester-runtime-resolve",
    resolveId(source: string) {
      if (source === "vitest")
        return deps.vitest;
      if (source === "@vitest/runner")
        return deps.runner;
      if (source === "birpc")
        return deps.birpc;
      if (source === "@vitest/utils/error")
        return join(dirname(deps.utils), "error.js");
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
export const EvaluatedModules = undefined;
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
 */
function createRuntimeAliasPlugin() {
  return {
    name: "tester-runtime-alias",
    resolveId(source: string) {
      if (
        source === "vitest"
        || source === "@vitest/runner"
        || source === "birpc"
        || source === "flatted"
        || source === "@vitest/utils/error"
      ) {
        return { id: "../runtime.js", external: true };
      }
      return null;
    },
  };
}
