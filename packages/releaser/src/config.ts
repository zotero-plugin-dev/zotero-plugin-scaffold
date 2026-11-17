import type { ConfigTransform } from "@zotero-plugin/config";
import type { ReleaseConfig } from "./types.js";
import { template } from "@zotero-plugin/utils";

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
        return ctx.config.release.changelog as string;
      },
    },
    hooks: {},
  },
};

/**
 * Patches the release configuration: interpolates the GitHub repository template.
 */
export const releaseTransform: ConfigTransform<ReleaseConfig> = (config, templateData) => {
  if (!config.release?.github)
    return;

  config.release.github.repository = template(config.release.github.repository, templateData);
};
