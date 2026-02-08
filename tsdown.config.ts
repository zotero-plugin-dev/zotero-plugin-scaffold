import Module from "node:module";
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts", "./src/vendor", "./src/cli.ts"],
  clean: true,
  // unbundle: true,

  // Since we bundled changelogen -> node-fetch-native,
  // we expect these patches to reduce the bundle size.
  // https://github.com/rolldown/tsdown/issues/611
  platform: "neutral",
  external: [
    ...Module.builtinModules,
    ...Module.builtinModules.map(m => `node:${m}`),
  ],
  noExternal: ["changelogen"],
  dts: {
    resolve: ["changelogen"],
  },

  // I think the default chunk naming in unbuild is very elegant,
  // so we config for it in tsdown.
  // https://github.com/rolldown/tsdown/discussions/612
  outputOptions: {
    chunkFileNames: "shared/scaffold-[name]-[hash].mjs",
  },
});
