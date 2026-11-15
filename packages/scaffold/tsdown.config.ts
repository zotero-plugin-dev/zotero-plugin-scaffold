import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "./src/index.ts",
    "./src/vendor",
    "./src/test.ts",
    "./src/cli.ts",
  ],
});
