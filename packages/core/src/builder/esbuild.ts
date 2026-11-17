import type { BuildOptions, BuildResult } from "esbuild";
import { build as buildAsync } from "esbuild";

export default async function esbuild(esbuildOptions: BuildOptions[]): Promise<BuildResult<BuildOptions>[] | undefined> {
  if (esbuildOptions.length === 0)
    return;

  return await Promise.all(
    esbuildOptions.map(esbuildOption =>
      buildAsync(esbuildOption),
    ),
  );
}
