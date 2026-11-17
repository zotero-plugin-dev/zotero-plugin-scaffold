import type { ConfigTransform } from "@zotero-plugin/config";
import type { BuildConfig, DevServerConfig } from "./types.js";
import { template, toArray } from "@zotero-plugin/utils";
import { mapValues } from "es-toolkit";

export const buildDefaults: BuildConfig = {
  build: {
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
    },
    makeUpdateJson: {
      updates: [],
      hash: true,
    },
    hooks: {},
  },
};

export const devServerDefaults: DevServerConfig = {
  devServer: {
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
  },
};

/**
 * Patches the build configuration: preference prefix fallback and template
 * interpolation.
 */
export const buildTransform: ConfigTransform<BuildConfig> = (config, templateData, pkgUser) => {
  if (!config.build)
    return;

  const { build } = config;

  // Patch to maintain compatibility for zotero-plugin-template users
  build.prefs.prefix ||= pkgUser.config?.prefsPrefix || `extensions.${config.namespace}`;
  build.define = mapValues(build.define, v => template(v, templateData));

  build.assets = toArray(build.assets);
};
