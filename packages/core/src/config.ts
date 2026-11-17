import type { ConfigTransform } from "@zotero-plugin/config";
import type { BuildConfig, DevServerConfig } from "./types.js";
import { resolve } from "node:path";
import { logger, template, toArray } from "@zotero-plugin/utils";
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

export const buildTransform: ConfigTransform<BuildConfig> = (config, templateData, pkgUser) => {
  if (!config.build)
    return;

  const { build } = config;

  // Patch to maintain compatibility for zotero-plugin-template users
  build.prefs.prefix ||= pkgUser.config?.prefsPrefix || `extensions.${config.namespace}`;
  build.define = mapValues(build.define, v => template(v, templateData));

  build.assets = toArray(build.assets);

  // Keep `outfile` and `outdir` in `dist`, so that no build has to write to the
  // resolved configuration.
  const distAbsolute = resolve(config.dist);
  build.esbuildOptions = build.esbuildOptions.map((option, i) => {
    const normalized = { ...option };
    if (normalized.outfile && !resolve(normalized.outfile).startsWith(distAbsolute)) {
      logger.debug(`'outfile' of esbuildOptions[${i}] is not in dist folder, it will be overwritten.`);
      normalized.outfile = `${config.dist}/${normalized.outfile}`;
    }
    if (normalized.outdir && !resolve(normalized.outdir).startsWith(distAbsolute)) {
      logger.debug(`'outdir' of esbuildOptions[${i}] is not in dist folder, it will be overwritten.`);
      normalized.outdir = `${config.dist}/${normalized.outdir}`;
    }
    return normalized;
  });
};
