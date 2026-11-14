import Module from "node:module";
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts"],
  clean: true,
  platform: "node",
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
  deps: {
    neverBundle: [
      ...Module.builtinModules,
      ...Module.builtinModules.map(m => `node:${m}`),
    ],
    alwaysBundle: ["changelogen"],
  },
  outputOptions: {
    chunkFileNames: "shared/releaser-[name]-[hash].mjs",
  },
});
