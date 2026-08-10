/**
 * Bundles the vitest runtime and the test files for the Zotero tester plugin
 * (e2e prototype). Mirrors the scaffold's test-bundler with a minimal setup.
 */
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { dirname } from "node:path";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDir, outputFile, copy } from "fs-extra/esm";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { rolldown } from "rolldown";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PLUGIN_SRC = join(ROOT, "plugin");
const TESTS_SRC = join(ROOT, "tests");
const OUT = join(ROOT, "out");
const CONTENT = join(OUT, "content");

const RUNTIME_ENTRY = `
export { describe, it, test, suite, beforeAll, afterAll, beforeEach, afterEach, startTests, collectTests } from "@vitest/runner";
export { expect, vi, assert, should } from "vitest";
export { createBirpc } from "birpc";
export { serializeError } from "@vitest/utils/error";
export { stringify as flattedStringify, parse as flattedParse } from "flatted";
`;

// flatted is a transitive dependency of vitest (pnpm virtual store, not
// hoisted); locate it by globbing the pnpm store.
export function resolveFlatted(): { esm: string; cjs: string } {
  const req = createRequire(join(ROOT, "package.json"));
  // .../.pnpm/vitest@x.y.z_.../node_modules/vitest/package.json
  // → .../.pnpm (four levels up)
  const pnpmDir = dirname(dirname(dirname(dirname(req.resolve("vitest/package.json")))));
  const dir = readdirSync(pnpmDir).find((n) => n.startsWith("flatted@"));
  if (!dir) throw new Error("Cannot locate flatted in the pnpm store");
  const base = join(pnpmDir, dir, "node_modules", "flatted");
  return { esm: join(base, "esm", "index.js"), cjs: join(base, "cjs", "index.js") };
}

const NODE_STUB_ID = "\0vitest-stub:node";
const MODULE_RUNNER_STUB_ID = "\0vitest-stub:module-runner";

function resolveDeps() {
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
      if (typeof t === "string") return t;
      if (t && typeof t === "object") {
        const o = t as Record<string, unknown>;
        for (const key of ["import", "default", "require", "browser"]) {
          const v = pick(o[key]);
          if (v) return v;
        }
      }
      return undefined;
    };
    const rel = pick(pkg.exports?.["."]) ?? pkg.module ?? pkg.main;
    if (!rel) throw new Error(`Cannot resolve ESM entry for ${id}`);
    return join(pkgDir, rel);
  };
  return {
    vitest: resolve("vitest"),
    runner: resolve("@vitest/runner"),
    birpc: resolve("birpc"),
    utils: resolve("@vitest/utils"),
    flatted: resolveFlatted().esm,
  };
}

export async function buildPlugin(port: number): Promise<void> {
  await ensureDir(CONTENT);

  // ---- copy static plugin files ----
  await copy(join(PLUGIN_SRC, "manifest.json"), join(OUT, "manifest.json"));
  await copy(join(PLUGIN_SRC, "content", "index.html"), join(CONTENT, "index.html"));

  let bootstrap = await readFile(join(PLUGIN_SRC, "bootstrap.js"), "utf8");
  bootstrap = bootstrap.replaceAll("__PORT__", String(port));
  await writeFile(join(OUT, "bootstrap.js"), bootstrap);

  // ---- bundle the vitest runtime ----
  const deps = resolveDeps();
  const entry = join(OUT, ".tmp-runtime-entry.js");
  await outputFile(entry, RUNTIME_ENTRY);

  const runtimeBuild = await rolldown({
    input: entry,
    platform: "browser",
    treeshake: false,
    plugins: [
      {
        name: "vitest-e2e-runtime-resolve",
        resolveId(source) {
          if (source === "vitest") return deps.vitest;
          if (source === "@vitest/runner") return deps.runner;
          if (source === "birpc") return deps.birpc;
          if (source === "@vitest/utils/error") return join(dirname(deps.utils), "error.js");
          if (source === "vite/module-runner") return MODULE_RUNNER_STUB_ID;
          if (source === "flatted") return deps.flatted;
          if (source.startsWith("node:")) return NODE_STUB_ID;
          return null;
        },
        load(id) {
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
            return `export default undefined;\nexport const registerHooks = undefined;\nexport const register = undefined;\n`;
          }
          return null;
        },
      },
    ],
  });
  await runtimeBuild.write({
    dir: CONTENT,
    format: "esm",
    entryFileNames: "runtime.js",
    sourcemap: true,
  });

  // ---- bundle the test files ----
  const testFiles = (await readdir(TESTS_SRC)).filter(f => f.endsWith(".mjs"));
  const input: Record<string, string> = {};
  const manifest: Record<string, string> = {};
  for (const file of testFiles) {
    const outName = `tests/${file.replace(/\.mjs$/, ".js")}`;
    input[outName.replace(/\.js$/, "")] = join(TESTS_SRC, file);
    // vitest normalizes paths to forward slashes; match that in the manifest
    const sep = String.fromCharCode(92);
    manifest[join(TESTS_SRC, file).split(sep).join("/")] = outName;
  }

  const testsBuild = await rolldown({
    input,
    platform: "browser",
    treeshake: false,
    plugins: [
      {
        name: "vitest-e2e-test-resolve",
        resolveId(source) {
          // test files import the shared runtime chunk
          if (source === "vitest") return { id: "../runtime.js", external: true };
          return null;
        },
      },
    ],
  });
  await testsBuild.write({
    dir: CONTENT,
    format: "esm",
    entryFileNames: "[name].js",
    sourcemap: true,
  });

  // ---- setup.js with the manifest injected ----
  let setup = await readFile(join(PLUGIN_SRC, "content", "setup.js"), "utf8");
  setup = setup.replace("__TEST_MANIFEST__", JSON.stringify(manifest));
  await writeFile(join(CONTENT, "setup.js"), setup);

  console.log(`[zotero-pool] bundled ${testFiles.length} test file(s) → ${CONTENT}`);
}
