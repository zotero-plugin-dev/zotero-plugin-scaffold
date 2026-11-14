export { Builder } from "./builder/index.js";
export { replace, replaceInFile } from "./builder/replace.js";
export { buildDefaults, buildSlice, devServerDefaults, devServerSlice } from "./config.js";
export { DEFAULT_DIST_TEMP_DIR } from "./constant.js";
export { DevServer } from "./dev-server.js";
export type {
  BuildConfig,
  BuildHooks,
  BuildUserConfig,
  CoreContext,
  DevServerConfig,
  DevServerUserConfig,
  ServeHooks,
} from "./types.js";
