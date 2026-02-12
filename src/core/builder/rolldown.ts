import type { RolldownOptions } from "rolldown";
import type { BuildConfig, BundleItem, Config } from "../../types/config.js";
import { resolve } from "node:path";
import process from "node:process";
import { rolldown } from "rolldown";
import { toArray } from "../../utils/string.js";

export function resolveConfig(dist: Config["dist"], configs: BundleItem[]): RolldownOptions[] {
  const distAbsolute = resolve(dist);

  // ensure output.file and output.dir are in dist folder
  return configs.map((config) => {
    // Extract config fields from new format with proper typing
    const { input, minify, rolldown: rolldownInputConfig } = config;

    // Normalize output directory path
    const outputDir = `${dist}/addon`;
    const resolvedDir = resolve(outputDir).startsWith(distAbsolute)
      ? outputDir
      : `${dist}/${outputDir}`;

    return {
      ...rolldownInputConfig,
      input,
      transform: {
        ...rolldownInputConfig?.transform,
        target: "firefox140",
        define: {
          __env__: `"${process.env.NODE_ENV || "production"}"`,
          ...(rolldownInputConfig?.transform?.define),
        },
      },
      output: {
        dir: resolvedDir,
        format: "iife",
        // format: "esm",
        // Since the Zotero sandbox environment does not support loading subpackages,
        // we hope to output a single file
        // Error: export declarations may only appear at top level of a module
        // codeSplitting: false,
        minify,
      },
    };
  });
}

export default async function rolldownBuild(dist: string, bundleConfigs: BuildConfig["bundle"]): Promise<void> {
  const configs = toArray(bundleConfigs);

  if (configs.length === 0)
    return;

  const options = resolveConfig(dist, configs);

  await Promise.all(
    options.map(async (rolldownOption) => {
      const { output, ...inputOptions } = rolldownOption;
      const bundle = await rolldown(inputOptions);
      if (output) {
        const outputConfig = Array.isArray(output) ? output : [output];
        await bundle.write(outputConfig[0]);
      }
      await bundle.close();
    }),
  );
}
