import { defineConfig } from "tsdown";
import Raw from "unplugin-raw/rolldown";

export default defineConfig({
  // `index` is the test command, `assertions/index` is the public
  // `zotero-plugin-scaffold/test` entry of the package.
  entry: ["./src/index.ts", "./src/assertions/index.ts"],
  plugins: [
    Raw(),
  ],
});
