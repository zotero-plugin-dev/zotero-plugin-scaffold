export { Builder } from "./builder/index.js";
export { replace, replaceInFile } from "./builder/replace.js";
export { DEFAULT_DIST_TEMP_DIR } from "./constant.js";
export { buildDefaults, devServerDefaults } from "./defaults.js";
export { DevServer } from "./dev-server.js";
export { buildSlice, devServerSlice } from "./slices.js";
export type {
  BuildConfig,
  BuildHooks,
  BuildUserConfig,
  CoreContext,
  DevServerConfig,
  DevServerUserConfig,
  ServeHooks,
} from "./types.js";
