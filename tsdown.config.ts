import Module from "node:module";
import { defineConfig } from "tsdown";

/**
 * Scripts which run inside the Zotero test page: the assertion API and the
 * Mocha setup of the tester.
 *
 * The page has no module loader for npm packages, so they are bundled into
 * plain IIFE scripts once, when the packages are built, and shipped in
 * `packages/tester/dist/page/`. The test runner only copies these files.
 *
 * IIFE output cannot share chunks, so every entry gets its own config.
 */
function pageConfig(name: string, source: string) {
  return {
    entry: { [name]: source },
    outDir: "packages/tester/dist/page",
    format: "iife",
    platform: "browser",
    target: "firefox115",
    // The tester copies these files by their exact name
    hash: false,
    // No types are consumed from the page runtime
    dts: false,
    // The workspace build cleans `dist` before the builds, cleaning again would race
    clean: false,
    // The page cannot resolve any import, everything has to be inlined
    deps: {
      alwaysBundle: [/.*/],
    },
    // Drop the `.iife` suffix tsdown adds, the tester copies these names
    outputOptions: {
      entryFileNames: "[name].js",
    },
  };
}

const workspaceConfig = {
  entry: ["./src/index.ts"],
  workspace: {
    include: ["packages/*"],
    exclude: ["**/linter/**"],
  },
  clean: true,
  platform: "node",
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
  deps: {
    neverBundle: [
      ...Module.builtinModules,
      ...Module.builtinModules.map(m => `node:${m}`),
    ],
  },
  outputOptions: {
    chunkFileNames: "shared/[name]-[hash].mjs",
  },
  report: {
    summary: true,
  },
} satisfies Parameters<typeof defineConfig>[0];

export default defineConfig([
  workspaceConfig,
  pageConfig("test-api", "packages/tester/src/assertions/page.ts"),
  pageConfig("mocha-setup", "packages/tester/src/mocha-setup.ts"),
]);
