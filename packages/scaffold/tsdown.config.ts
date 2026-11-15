import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "./src/index.ts",
    "./src/test.ts",
    "./src/vendor",
    "./src/cli.ts",
  ],
});
