import type { SliceDescriptor } from "@zotero-plugin/config";
import type { ReleaseConfig } from "./types.js";
import { template } from "@zotero-plugin/utils";

export const releaseDefaults: ReleaseConfig = {
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
      return ctx.release.changelog as string;
    },
  },
  hooks: {},
};

/**
 * Patches the release slice: interpolates the GitHub repository template.
 */
export const releaseSlice: SliceDescriptor = {
  resolve(config, templateData) {
    if (!config.release?.github)
      return;

    config.release.github.repository = template(config.release.github.repository, templateData);
  },
};
