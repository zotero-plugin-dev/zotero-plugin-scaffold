import type { BuildOptions, BuildResult } from "esbuild";
import { resolve } from "node:path";
import { logger } from "@zotero-plugin/utils";
import { build as buildAsync } from "esbuild";

export function resolveConfig(dist: string, esbuildOptions: BuildOptions[]): BuildOptions[] {
  const distAbsolute = resolve(dist);

  // ensure outfile and outdir are in dist folder
  return esbuildOptions.map((option, i) => {
    if (option.outfile && !resolve(option.outfile).startsWith(distAbsolute)) {
      logger.debug(`'outfile' of esbuildOptions[${i}] is not in dist folder, it will be overwritten.`);
      option.outfile = `${dist}/${option.outfile}`;
    }
    if (option.outdir && !resolve(option.outdir).startsWith(distAbsolute)) {
      logger.debug(`'outdir' of esbuildOptions[${i}] is not in dist folder, it will be overwritten.`);
      option.outdir = `${dist}/${option.outdir}`;
    }
    return option;
  });
}

export default async function esbuild(dist: string, esbuildOptions: BuildOptions[]): Promise<BuildResult<BuildOptions>[] | undefined> {
  if (esbuildOptions.length === 0)
    return;

  const options = resolveConfig(dist, esbuildOptions);

  return await Promise.all(
    options.map(esbuildOption =>
      buildAsync(esbuildOption),
    ),
  );
}
