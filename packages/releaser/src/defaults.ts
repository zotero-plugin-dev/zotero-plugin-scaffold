import type { ReleaseConfig } from "./types.js";

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
