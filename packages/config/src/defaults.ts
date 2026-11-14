import type { BaseConfig } from "./types.js";

export const baseDefaults: BaseConfig = {
  source: "src",
  watchIgnore: [],
  dist: ".scaffold/build",

  name: "",
  id: "",
  namespace: "",
  xpiName: "",
  xpiDownloadLink: "https://github.com/{{owner}}/{{repo}}/releases/download/v{{version}}/{{xpiName}}.xpi",
  updateURL: "https://github.com/{{owner}}/{{repo}}/releases/download/release/{{updateJson}}",

  lint: {},
  logLevel: "INFO",
};
