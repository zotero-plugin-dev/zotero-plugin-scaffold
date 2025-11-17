import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
  declaration: "node16",
  rollup: {
    inlineDependencies: ["node-style-text", "changelogen"],
  },
  stubOptions: {
    jiti: {
      // debug: true,
      // // https://github.com/fisker/node-style-text/issues/27
      // interopDefault: false,
      // nativeModules: ["node-style-text"],
    },
  },
  failOnWarn: false,
});
