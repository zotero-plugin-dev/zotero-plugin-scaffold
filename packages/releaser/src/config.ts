import type { ConfigTransform } from "@zotero-plugin/config";
import type { VersionBumpRelease } from "bumpp";
import type { ReleaseConfig, ResolvedReleaseConfig } from "./types.js";
import { logger, template } from "@zotero-plugin/utils";
import { isCI } from "std-env";

export const releaseDefaults: ReleaseConfig = {
  release: {
    bumpp: {
      release: "prompt",
      preid: "beta",
      confirm: true,
      execute: "",
      all: false,
      commit: "chore(publish): release v%s",
      noVerify: false,
      tag: "v%s",
    },
    changelog: "",
    github: {
      enable: "ci",
      repository: "{{owner}}/{{repo}}",
      updater: "release",
      comment: false,
      releaseNote: (ctx) => {
        return ctx.changelog ?? "No changelog.";
      },
    },
    hooks: {},
  },
};

/**
 * Whether a `release.github.enable` style value enables the step in the current
 * environment.
 */
export function isEnabled(enable: ReleaseConfig["release"]["github"]["enable"]): boolean {
  if (enable === "always")
    return true;
  if (enable === "ci" && isCI)
    return true;
  if (enable === "local" && !isCI)
    return true;
  return false;
}

export const releaseTransform: ConfigTransform<ReleaseConfig, ResolvedReleaseConfig> = (config, templateData) => {
  if (!config.release)
    return;

  const { release } = config;
  const bumpp = { ...release.bumpp };

  if (bumpp.release === "prompt" && isCI) {
    logger.warn("Config `release.bumpp.release == 'prompt'` will do nothing because in CI enviroment.");
    bumpp.release = templateData.version as VersionBumpRelease;
  }

  if (bumpp.confirm && isCI) {
    logger.warn("Config `release.bumpp.confirm` will do nothing because in CI enviroment.");
    bumpp.confirm = false;
  }

  if (isEnabled(release.github.enable) && !bumpp.execute) {
    logger.warn("The current release needs to run the build after bumping the version number, please configure the build script in 'config.release.bumpp.execute'.");
    bumpp.execute = "npm run build";
  }

  return {
    release: {
      ...release,
      bumpp,
      github: {
        ...release.github,
        repository: template(release.github.repository, templateData),
      },
    },
  };
};
