// eslint.config.mjs
import antfu from "@antfu/eslint-config";

export default antfu({
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
    // Zotero's bootstrap scope: `pref()` is defined by the host, and the files are
    // copied as assets rather than compiled.
    "e2e/fixture/static/**",
    "playground/static/**",
    "e2e/.tmp/**",
  ],
});
