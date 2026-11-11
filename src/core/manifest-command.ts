import type { Manifest } from "../types/manifest.js";
import { basename } from "node:path";
import process from "node:process";
import { pathExists, readJSON, writeJSON } from "fs-extra/esm";
import { getZoteroVersionInfo, parseMajorVersion } from "../utils/zotero-version.js";
import { Base } from "./base.js";

export default class ManifestCommand extends Base {
  /**
   * Update strict_max_version in manifest.json
   */
  async updateMaxVersion(manifestPath?: string): Promise<void> {
    // Determine the manifest file path
    let targetPath: string | null = null;
    if (manifestPath) {
      targetPath = manifestPath;
    }
    else {
      // Search for manifest.json in common locations
      const possiblePaths = [
        "manifest.json",
        "src/manifest.json",
        "addon/manifest.json",
      ];

      for (const p of possiblePaths) {
        if (await pathExists(p)) {
          targetPath = p;
          break;
        }
      }

      if (!targetPath) {
        this.logger.error("manifest.json not found in current directory or common locations");
        this.logger.error("Please specify the path to manifest.json");
        process.exit(1);
      }
    }

    if (!await pathExists(targetPath)) {
      this.logger.error(`manifest.json not found at ${targetPath}`);
      process.exit(1);
    }

    try {
      const manifest = await readJSON(targetPath) as Manifest;

      // Fetch latest version info
      const versionInfo = await getZoteroVersionInfo();
      const latestBeta = versionInfo.beta.mac;

      // Calculate new version
      const majorVersion = parseMajorVersion(latestBeta);
      const newMaxVersion = `${majorVersion + 1}.0`;

      // Update manifest
      if (!manifest.applications) {
        manifest.applications = { zotero: { id: "", update_url: "" } };
      }
      if (!manifest.applications.zotero) {
        manifest.applications.zotero = { id: "", update_url: "" };
      }

      const oldMaxVersion = manifest.applications.zotero.strict_max_version;
      manifest.applications.zotero.strict_max_version = newMaxVersion;

      // Write back to file
      await writeJSON(targetPath, manifest, { spaces: 2 });

      this.logger.success(`Updated strict_max_version in ${basename(targetPath)}`);
      if (oldMaxVersion) {
        this.logger.info(`  ${oldMaxVersion} -> ${newMaxVersion}`);
      }
      else {
        this.logger.info(`  Added: ${newMaxVersion}`);
      }
      this.logger.info(`Latest Zotero beta: ${latestBeta}`);
    }
    catch (error) {
      this.logger.error(`Failed to update manifest: ${error}`);
      process.exit(1);
    }
  }

  async run(): Promise<void> {
    // This is a no-op, subcommands should be called directly
    this.logger.info("Use 'zotero-plugin manifest:update-max-version' to update strict_max_version");
  }

  exit(): void {
    // No cleanup needed
  }
}
