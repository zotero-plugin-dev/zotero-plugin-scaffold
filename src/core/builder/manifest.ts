import type { Context } from "../../types/index.js";
import type { Manifest } from "../../types/manifest.js";
import { toMerged } from "es-toolkit";
import { outputJSON, pathExists, readJSON } from "fs-extra/esm";
import { logger } from "../../utils/logger.js";

export default async function buildManifest(ctx: Context): Promise<void> {
  if (!ctx.build.makeManifest.enable)
    return;

  const { name, id, updateURL, dist, version } = ctx;

  const manifestPath = `${dist}/addon/manifest.json`;
  const manifestExists = await pathExists(manifestPath);
  const userData = (manifestExists ? await readJSON(manifestPath) : {}) as Partial<Manifest>;

  const template: Manifest = {
    ...(userData as Manifest),
    name: userData.name || name,
    version: userData.version || version,
    manifest_version: 2,
    applications: {
      zotero: {
        id,
        update_url: updateURL,
      },
    },
  };

  const data: Manifest = toMerged(userData, template);
  logger.debug(`manifest: ${JSON.stringify(data, null, 2)}`);

  outputJSON(manifestPath, data, { spaces: 2 });
}

// TODO: process i10n in manifest.json
export function locale(): void {
  //
}
