import Module from "node:module";
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts", "./src/vendor", "./src/cli.ts"],
  clean: true,
  platform: "node",
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
  deps: {
    neverBundle: [
      ...Module.builtinModules,
      ...Module.builtinModules.map(m => `node:${m}`),
    ],
  },
  outputOptions: {
    chunkFileNames: "shared/scaffold-[name]-[hash].mjs",
  },
});
