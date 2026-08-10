import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { zoteroPool } from "./zotero-pool";

export default defineConfig({
  test: {
    root: fileURLToPath(new URL(".", import.meta.url)),
    include: ["tests/*.mjs"],
    exclude: ["tests/dep.mjs"],
    pool: zoteroPool(),
    // Run the official TestRunner without a vite module graph, via the
    // NativeModuleRunner path. This is the exact constraint the Zotero
    // chrome:// page imposes (no vite dev server, no module transform).
    experimental: {
      viteModuleRunner: false,
    },
  },
});
