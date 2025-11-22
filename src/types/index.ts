import type { Hookable } from "hookable";
import type { Logger } from "../utils/logger.js";
import type { Config, Hooks } from "./config.js";
import type { RecursivePartial } from "./utils.js";

export { Config, Hooks };

/**
 * User config
 */
export interface UserConfig extends RecursivePartial<Config> {}

export interface OverrideConfig extends RecursivePartial<Config> {}

export interface Context extends Config {
  pkgUser: any;
  version: string;
  hooks: Hookable<Hooks>;
  logger: Logger;
  templateData: TemplateData;
}

export interface TemplateData {
  /**
   * `owner` and `repo` will be extracted from the `repository` property in `package.json`.
   */
  owner: string;
  repo: string;
  version: string;
  isPreRelease: string;
  updateJson: "update-beta.json" | "update.json" | string;
  xpiName: string;
  buildTime: string;
}
