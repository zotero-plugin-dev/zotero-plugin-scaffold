import { defineConfig } from "tsdown";
import Raw from "unplugin-raw/rolldown";

export default defineConfig({
  entry: ["./src/index.ts"],
  plugins: [
    Raw(),
  ],
});
