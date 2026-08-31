// eslint.config.mjs
import antfu from "@antfu/eslint-config";

export default antfu({
  ignores: ["src/core/tester/template/**"],
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
});
