// eslint.config.mjs
import antfu from "@antfu/eslint-config";

export default antfu(
  {
    javascript: true,
    typescript: {
      overrides: {
        "e18e/prefer-static-regex": "off",
      },
    },
    stylistic: {
      semi: true,
      quotes: "double",
    },
    formatters: true,
    ignores: [
      // Design documents are not part of the codebase.
      "PROPOSAL.md",
    ],
  },
  {
    // `conflicts_*` catalogs intentionally hold another version of a package
    // that is also defined in its base catalog.
    files: ["pnpm-workspace.yaml"],
    rules: {
      "pnpm/yaml-no-duplicate-catalog-item": [
        "error",
        { checkDuplicates: "exact-version" },
      ],
    },
  },
);
