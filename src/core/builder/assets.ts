import { copy } from "fs-extra/esm";
import { glob } from "tinyglobby";
import { logger } from "../../utils/logger.js";
import { toArray } from "../../utils/string.js";

// We should ignore node_modules/ by default, glob this folder will be very slow
const DEFAULT_IGNORE = ["node_modules", ".git"];

// Copys files in `Config.build.assets` to `Config.dist`
export default async function copyAssets(
  source: string | string[],
  dist: string,
  assets: string | string[],
): Promise<void> {
  const sourceArr = toArray(source);
  const paths = await glob(assets, {
    ignore: [...DEFAULT_IGNORE, dist],
  });

  for (const file of paths) {
    const newPath = getNewPath(sourceArr, dist, file);
    await copy(file, newPath);
    logger.debug(`Copy ${file} to ${newPath}`);
  }
}

export function getNewPath(sources: string[], dist: string, path: string): string {
  const pattern = new RegExp(sources.join("|"));
  const relativePath = path.replace(pattern, "");
  return `${dist}/addon/${relativePath}`;
}
