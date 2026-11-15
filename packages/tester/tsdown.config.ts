import { defineConfig } from "tsdown";
import Raw from "unplugin-raw/rolldown";

export default defineConfig({
  entry: [
    "./src/index.ts",
    // Public facade, re-exported by scaffold as `zotero-plugin-scaffold/test`
    "./src/api/index.ts",
    // Target of the esbuild onResolve redirect (internal, see `exports`)
    "./src/shim/index.ts",
    // Test runtime template, bundled per run by `buildTestRuntime()`
    "./src/test-runtime-setup.ts",
  ],
  plugins: [
    Raw(),
  ],
  deps: {
    // `dependencies` stay external in the published dist: the test libraries
    // must never be inlined into the tester bundle.
    neverBundle: [/^mocha(\/|$)/, /^chai(\/|$)/],
  },
});
