import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { zoteroPool } from "./zotero-pool";

export default defineConfig({
  test: {
    root: fileURLToPath(new URL(".", import.meta.url)),
    include: ["tests/*.mjs"],
    pool: zoteroPool(),
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
