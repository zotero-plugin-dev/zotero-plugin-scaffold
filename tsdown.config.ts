import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts", "./src/vendor", "./src/cli.ts"],
  clean: true,
  // unbundle: true,
  noExternal: ["changelogen"],
  dts: {
    resolve: ["changelogen"],
  },
});
