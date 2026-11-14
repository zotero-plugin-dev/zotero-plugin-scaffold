import Module from "node:module";
import { defineConfig } from "tsdown";
import Raw from "unplugin-raw/rolldown";

/**
 * Node side of scaffold: the library, the CLI, and the public `test` entry
 * (types plus a runtime for Node consumers). Dependencies stay external.
 */
const nodeConfig = {
  entry: [
    "./src/index.ts",
    "./src/test.ts",
    "./src/vendor",
    "./src/cli.ts",
  ],
  clean: true,
  // unbundle: true,

  // Since we bundled changelogen -> node-fetch-native,
  // we expect these patches to reduce the bundle size.
  // https://github.com/rolldown/tsdown/issues/611
  platform: "neutral",
  deps: {
    neverBundle: [
      ...Module.builtinModules,
      ...Module.builtinModules.map(m => `node:${m}`),
    ],
    alwaysBundle: [
      "changelogen",
    ],
  },
  // dts: {
  //   resolve: ["changelogen"],
  // },

  // I think the default chunk naming in unbuild is very elegant,
  // so we config for it in tsdown.
  // https://github.com/rolldown/tsdown/discussions/612
  outputOptions: {
    chunkFileNames: "shared/scaffold-[name]-[hash].mjs",
  },
  plugins: [
    Raw(),
  ],
} satisfies Parameters<typeof defineConfig>[0];

/**
 * Scripts which run inside the Zotero test page: the assertion API and the
 * Mocha setup of the tester.
 *
 * The page has no module loader for npm packages, so they are bundled into
 * plain IIFE scripts once, when scaffold is built, and shipped in `dist/page/`.
 * The test runner only copies these files.
 *
 * IIFE output cannot share chunks, so every entry gets its own config.
 */
function pageConfig(name: string, source: string) {
  return {
    entry: { [name]: source },
    outDir: "dist/page",
    format: "iife",
    platform: "browser",
    target: "firefox115",
    // The tester copies these files by their exact name
    hash: false,
    // No types are consumed from the page runtime
    dts: false,
    // `nodeConfig` cleans `dist` before the builds, cleaning again would race
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

export default defineConfig([
  nodeConfig,
  pageConfig("test-api", "src/core/tester/assertions/page.ts"),
  pageConfig("mocha-setup", "src/core/tester/mocha-setup.ts"),
]);
