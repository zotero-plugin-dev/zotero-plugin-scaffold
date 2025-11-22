import type { Context } from "../../types/index.js";
import type { Manifest } from "../../types/manifest.js";
import { toMerged } from "es-toolkit";
import { outputJSON, readJSON } from "fs-extra/esm";
import { logger } from "../../utils/logger.js";

export default async function buildManifest(ctx: Context) {
  if (!ctx.build.makeManifest.enable)
    return;

  const { name, id, updateURL, dist, version } = ctx;

  const userData = await readJSON(
    `${dist}/addon/manifest.json`,
  ) as Manifest;
  const template: Manifest = {
    ...userData,
    ...((!userData.name && name) && { name }),
    ...(version && { version }),
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

  outputJSON(`${dist}/addon/manifest.json`, data, { spaces: 2 });
}

// TODO: process i10n in manifest.json
export function locale() {
  //
}
