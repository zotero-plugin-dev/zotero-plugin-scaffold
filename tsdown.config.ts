import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts", "./src/vendor", "./src/cli.ts"],
  dts: true,
  clean: true,
  noExternal: ["node-style-text", "changelogen"],
});
