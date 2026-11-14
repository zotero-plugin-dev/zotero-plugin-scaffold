import type { SliceDescriptor } from "@zotero-plugin/config";
import type { BuildConfig, DevServerConfig } from "./types.js";
import { logger, template } from "@zotero-plugin/utils";
import { mapValues, toMerged } from "es-toolkit";

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

/**
 * Patches the build slice: preference prefix fallback and template interpolation.
 */
export const buildSlice: SliceDescriptor = {
  resolve(config, templateData, pkgUser) {
    if (!config.build)
      return;

    // Patch to maintain compatibility for zotero-plugin-template users
    config.build.prefs.prefix ||= pkgUser.config?.prefsPrefix || `extensions.${config.namespace}`;
    config.build.define = mapValues(config.build.define, v => template(v, templateData));
  },
  hooksOf: config => [config.build?.hooks ?? {}],
};

/**
 * Patches the dev-server slice.
 *
 * The `server` key was renamed to `devServer`; the deprecated key is migrated
 * here with a warning, then defaults are applied.
 */
export const devServerSlice: SliceDescriptor = {
  resolve(config) {
    let userConfig = config.devServer;

    if (config.server) {
      logger.warn(
        "Config `server` is deprecated and will be removed in 1.0, please rename it to `devServer`.",
      );
      // `devServer` wins when both keys are present.
      userConfig = toMerged(config.server, userConfig ?? {});
      delete config.server;
    }

    config.devServer = toMerged(devServerDefaults, userConfig ?? {});
  },
  hooksOf: config => [config.devServer?.hooks ?? {}],
};
