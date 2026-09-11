import type { Context } from "../../types/index.js";
import type { Manifest } from "../../types/manifest.js";
import { toMerged } from "es-toolkit";
import { outputJSON, pathExists, readJSON } from "fs-extra/esm";
import { logger } from "../../utils/logger.js";
import { compareVersions, getZoteroVersionInfo, parseMajorVersion } from "../../utils/zotero-version.js";

/**
 * Check and update strict_max_version in manifest
 */
async function checkStrictMaxVersion(manifest: Manifest): Promise<void> {
  try {
    const versionInfo = await getZoteroVersionInfo();
    const latestBeta = versionInfo.beta.mac; // All platforms have the same version
    const latestRelease = versionInfo.release.mac;

    const currentMaxVersion = manifest.applications?.zotero?.strict_max_version;

    if (!currentMaxVersion) {
      // Auto-fill with latest beta major version + 1
      const majorVersion = parseMajorVersion(latestBeta);
      const autoFilledVersion = `${majorVersion + 1}.0`;
      manifest.applications.zotero.strict_max_version = autoFilledVersion;
      logger.info(`Auto-filled strict_max_version to ${autoFilledVersion} (latest beta: ${latestBeta})`);
    }
    else {
      // Check if current version is outdated
      if (compareVersions(currentMaxVersion, latestRelease) < 0) {
        logger.warn(`strict_max_version (${currentMaxVersion}) is older than the latest Zotero release (${latestRelease})`);
        logger.warn(`To update, run: npx zotero-plugin manifest:update-max-version`);
      }
    }
  }
  catch (error) {
    logger.debug(`Failed to check Zotero version: ${error}`);
    // Don't fail the build if version check fails
  }
}

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

  // Check and update strict_max_version
  await checkStrictMaxVersion(data);

  logger.debug(`manifest: ${JSON.stringify(data, null, 2)}`);

  outputJSON(manifestPath, data, { spaces: 2 });
}

// TODO: process i10n in manifest.json
export function locale(): void {
  //
}
