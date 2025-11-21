import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts", "./src/vendor", "./src/cli.ts"],
  clean: true,
  unbundle: true,
  noExternal: ["node-style-text", "changelogen"],
  dts: {
    resolve: ["changelogen"],
  },
});
