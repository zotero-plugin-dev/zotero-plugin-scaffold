import { defineConfig } from "vitest/config";

const packages = [
  "utils",
  "runner",
  "core",
  "tester",
  "releaser",
];

export default defineConfig({
  test: {
    projects: packages.map(name => ({
      extends: false,
      root: `packages/${name}`,
      test: {
        name,
        passWithNoTests: true,
      },
    })),
  },
});
