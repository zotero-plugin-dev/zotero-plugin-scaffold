import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "e2e",
    include: ["test/**/*.test.ts"],
    exclude: ["**/node_modules/**"],
    maxWorkers: 4,
    // Vitest requires every project of one `groupOrder` to share `maxWorkers`, so
    // this one gets a group of its own — which also keeps the Zotero-heavy suite
    // from competing for CPU with the unit tests.
    sequence: {
      groupOrder: 1,
    },
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
