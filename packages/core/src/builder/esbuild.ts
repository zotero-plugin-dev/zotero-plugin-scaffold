import type { BuildOptions, BuildResult } from "esbuild";
import type { BuilderContext } from "../types.js";
import { context } from "esbuild";

export interface EsbuildManager {
  rebuild: () => Promise<BuildResult<BuildOptions>[]>;
  dispose: () => Promise<void>;
}

export async function createEsbuildManager(ctx: BuilderContext): Promise<EsbuildManager> {
  const options = [...ctx.config.build.esbuildOptions] as BuildOptions[];
  const contexts = await Promise.all(options.map(option => context(option)));

  let chain: Promise<unknown> = Promise.resolve();
  let disposed = false;

  const rebuildAll = async (): Promise<BuildResult<BuildOptions>[]> =>
    await Promise.all(contexts.map(c => c.rebuild()));

  return {
    rebuild() {
      if (disposed)
        throw new Error("The esbuild manager has been disposed.");

      const result = chain.then(rebuildAll, rebuildAll);
      chain = result.then(() => undefined, () => undefined);
      return result;
    },

    async dispose() {
      disposed = true;
      await Promise.allSettled(
        contexts.splice(0).map(async (c) => {
          await c.cancel().catch(() => {});
          await c.dispose();
        }),
      );
    },
  };
}
