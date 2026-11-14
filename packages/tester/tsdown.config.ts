import Module from "node:module";
import { defineConfig } from "tsdown";
import Raw from "unplugin-raw/rolldown";

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
  },
  outputOptions: {
    chunkFileNames: "shared/tester-[name]-[hash].mjs",
  },
  plugins: [
    Raw(),
  ],
});
