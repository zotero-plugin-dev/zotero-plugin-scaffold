import { defineConfig } from "tsdown";
import Raw from "unplugin-raw/rolldown";

export default defineConfig({
  // NOTE: no copy of template/page to dist — the bundler inlines them via
  // ?raw at build time (see src/bundler.ts), so the published package needs
  // only the compiled chunks.
  entry: ["./src/index.ts", "./src/pool/index.ts", "./src/bundler.ts"],
  plugins: [
    Raw(),
  ],
});
