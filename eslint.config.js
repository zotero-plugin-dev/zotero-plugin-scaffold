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
  },
  {
    // These files are bundled into the plain scripts of the Zotero test page
    // (`dist/page/`, see tsdown.config.ts), so they must stay free of Node.js
    // APIs. Keep this list in sync with the page build entries.
    files: [
      "src/core/tester/assertions/index.ts",
      "src/core/tester/assertions/expect.ts",
      "src/core/tester/assertions/mocha.ts",
      "src/core/tester/assertions/page.ts",
      "src/core/tester/mocha-setup.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "node:*",
                "fs",
                "fs/*",
                "path",
                "os",
                "process",
                "url",
                "http",
                "https",
                "util",
                "crypto",
              ],
              message: "The page runtime runs in the Zotero test page, it cannot use Node.js APIs.",
            },
          ],
        },
      ],
    },
  },
);
