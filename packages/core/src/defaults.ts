import type { BuildConfig, DevServerConfig } from "./types.js";

export const buildDefaults: BuildConfig = {
  assets: "addon/**/*.*",
  define: {},
  fluent: {
    prefixFluentMessages: true,
    prefixLocaleFiles: true,
    ignore: [],
    dts: "typings/i10n.d.ts",
  },
  prefs: {
    prefix: "",
    prefixPrefKeys: true,
    dts: "typings/prefs.d.ts",
  },
  esbuildOptions: [],
  makeManifest: {
    enable: true,
    template: {
      manifest_version: 2,
      name: "",
      version: "",
      applications: {
        zotero: {
          id: "",
          update_url: "",
        },
      },
    },
  },
  makeUpdateJson: {
    updates: [],
    hash: true,
  },
  hooks: {},
};

export const devServerDefaults: DevServerConfig = {
  devtools: true,
  startArgs: [],
  debugOutputWindow: false,
  debugOutputFile: true,
  prefs: {},
  asProxy: false,
  prebuild: true,
  // keepProfileChanges: true,
  createProfileIfMissing: true,
  hooks: {},
};
