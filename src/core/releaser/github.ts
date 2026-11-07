import type { Context } from "../../types/index.js";
import { readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import process from "node:process";
import { Octokit } from "@octokit/rest";
import { glob } from "tinyglobby";
import { getMimeTypeByFileName } from "../../utils/mime.js";
import { ReleaseBase } from "./base.js";

/**
 * The subset of the GitHub release object used by the releaser.
 */
interface GitHubRelease {
  id: number;
  draft: boolean;
  immutable?: boolean;
}

interface GitHubReleaseAsset {
  id: number;
  name: string;
}

export default class GitHub extends ReleaseBase {
  client: Octokit;
  constructor(ctx: Context) {
    super(ctx);
    this.client = this.getClient();
  }

  async run(): Promise<Context> {
    this.checkFiles();

    this.logger.info("Uploading XPI to GitHub...");
    await this.uploadXPI();

    this.logger.info("Refreshing update manifest...");
    await this.refreshUpdateManifest();

    return this.ctx;
  }

  /**
   * Create the release of the current version and upload the XPI.
   *
   * The release is created as a draft and published only after all assets are
   * uploaded, so that the process is compatible with
   * [immutable releases](https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/immutable-releases):
   * the assets of a published immutable release can neither be added nor deleted.
   *
   * @see https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/immutable-releases
   */
  async uploadXPI(): Promise<void> {
    const { version, dist, xpiName } = this.ctx;
    const tag = this.versionTag;
    const assetName = `${xpiName}.xpi`;
    const assetPath = join(dist, assetName);

    let release = await this.findReleaseByTag(tag);

    if (release && !release.draft) {
      const publishedAssets = await this.listAssets(release.id);
      if (publishedAssets.some(asset => asset.name === assetName)) {
        this.logger.warn(`Release "${tag}" already contains "${assetName}", skip uploading the XPI.`);
        return;
      }

      if (release.immutable) {
        this.logger.error(
          `GitHub does not allow adding assets to the published immutable release "${tag}". `
          + `Please bump a new version and release again, note that the tag "${tag}" cannot be reused.`,
        );
        throw new Error(`Unable to upload "${assetName}" to the immutable release "${tag}".`);
      }
    }

    if (!release) {
      this.logger.debug(`Creating draft release "${tag}"...`);
      release = await this.createRelease({
        ...this.remote,
        tag_name: tag,
        name: `Release v${version}`,
        body: await this.getChangelog(),
        draft: true,
        prerelease: version.includes("-"),
      });
    }

    if (!release)
      throw new Error("Create release failed!");

    await this.replaceAsset(release.id, assetPath);

    if (release.draft) {
      this.logger.debug(`Publishing release "${tag}"...`);
      const published = await this.publishRelease(release.id, {
        prerelease: version.includes("-"),
        makeLatest: true,
      });
      if (published?.immutable)
        this.logger.debug(`Release "${tag}" is immutable and covered by a release attestation.`);
    }
  }

  async getReleaseByTag(tag: string): Promise<GitHubRelease | undefined> {
    return await this.client.rest.repos
      .getReleaseByTag({
        ...this.remote,
        tag,
      })
      .catch((e) => {
        this.logger.debug(`Release with tag ${tag} not found. ${e}`);
        return undefined;
      })
      .then((res) => {
        if (res && res.status === 200) {
          this.logger.debug(`Found release with tag "${tag}", id=${res.data.id}, immutable=${res.data.immutable}.`);
          return res.data;
        }
      });
  }

  /**
   * Find the release with the given tag, including drafts.
   *
   * `getReleaseByTag` does not return drafts, but a draft keeps the tag name it
   * will use once published, so it must be reused to retry a failed release.
   */
  async findReleaseByTag(tag: string): Promise<GitHubRelease | undefined> {
    const published = await this.getReleaseByTag(tag);
    if (published)
      return published;

    const releases = await this.client.paginate(
      this.client.rest.repos.listReleases,
      {
        ...this.remote,
        per_page: 100,
      },
    );

    const draft = releases.find(release => release.draft && release.tag_name === tag);
    if (draft)
      this.logger.debug(`Found draft release with tag "${tag}", id=${draft.id}.`);

    return draft;
  }

  async createRelease(
    options: Parameters<Octokit["rest"]["repos"]["createRelease"]>[0],
  ): Promise<GitHubRelease | undefined> {
    this.logger.debug("Creating release...");
    this.logger.debug(options);
    return await this.client.rest.repos
      .createRelease(options)
      .catch((e) => {
        this.logger.error(e);
        throw new Error("Create release failed.");
      })
      .then((res) => {
        if (res.status === 201) {
          this.logger.debug(`Create release "${res.data.tag_name}" success, id: ${res.data.id}.`);
          return res.data;
        }
      });
  }

  /**
   * Publish a draft release.
   *
   * For repositories with immutable releases enabled, the release becomes
   * immutable as soon as it is published, so all assets must be uploaded before.
   */
  async publishRelease(
    releaseID: number,
    options: { prerelease: boolean; makeLatest?: boolean },
  ): Promise<GitHubRelease | undefined> {
    const { prerelease, makeLatest = false } = options;
    this.logger.debug(`Publishing release ${releaseID} (prerelease=${prerelease}, makeLatest=${makeLatest})...`);
    return await this.client.rest.repos
      .updateRelease({
        ...this.remote,
        release_id: releaseID,
        draft: false,
        prerelease,
        // Drafts and prereleases cannot be marked as the latest release.
        ...(makeLatest && !prerelease ? { make_latest: "true" } : {}),
      })
      .then((res) => {
        this.logger.debug(`Publish release ${releaseID} success, immutable=${res.data.immutable}.`);
        return res.data;
      });
  }

  async listAssets(releaseID: number): Promise<GitHubReleaseAsset[]> {
    return await this.client.paginate(
      this.client.rest.repos.listReleaseAssets,
      {
        ...this.remote,
        release_id: releaseID,
        per_page: 100,
      },
    );
  }

  /**
   * Upload an asset, replacing the asset with the same name if it exists.
   */
  async replaceAsset(releaseID: number, assetPath: string): Promise<void> {
    const assetName = basename(assetPath);
    const existing = (await this.listAssets(releaseID))
      .find(asset => asset.name === assetName);

    if (existing) {
      this.logger.debug(`Deleting existed asset "${assetName}" (id: ${existing.id}) in release ${releaseID}...`);
      await this.client.rest.repos.deleteReleaseAsset({
        ...this.remote,
        asset_id: existing.id,
      });
    }

    await this.uploadAsset(releaseID, assetPath);
  }

  async uploadAsset(releaseID: number, asset: string): Promise<{ id: number }> {
    const assetName = basename(asset);
    this.logger.debug(`Uploading ${assetName} to release ${releaseID}`);
    return await this.client.rest.repos
      .uploadReleaseAsset({
        ...this.remote,
        release_id: releaseID,
        data: await readFile(asset) as unknown as string,
        headers: {
          "content-type": getMimeTypeByFileName(asset) || "application/octet-stream",
          "content-length": (await stat(asset)).size,
        },
        name: assetName,
      })
      .catch((error) => {
        if (isImmutableReleaseError(error))
          this.logImmutableHint();
        throw error;
      })
      .then((res) => {
        this.logger.debug(`Upload "${res.data.name}" success, assetId: ${res.data.id}`);
        return res.data;
      });
  }

  async refreshUpdateManifest(): Promise<void> {
    const updater = this.ctx.release.github.updater;
    if (!updater) {
      this.logger.debug(`Skip refresh update.json because release.github.updater = false`);
      return;
    }

    const { dist } = this.ctx;

    const manifests = (await glob(`${dist}/update*.json`))
      .map(p => basename(p));

    const release = await this.findReleaseByTag(updater);

    // Create the manifest release as a draft and publish it after the manifests
    // are uploaded, so that a failed upload does not leave an empty release.
    if (!release || release.draft) {
      const draft = release ?? await this.createRelease({
        ...this.remote,
        tag_name: updater,
        name: "Release Manifest",
        body: this.manifestBody,
        draft: true,
        prerelease: true,
      });

      if (!draft)
        throw new Error("Create the release for update.json failed.");

      for (const manifest of manifests)
        await this.replaceAsset(draft.id, join(dist, manifest));

      const published = await this.publishRelease(draft.id, { prerelease: true });

      if (published?.immutable) {
        this.logger.warn(
          `The release "${updater}" was published as an immutable release, so \`update.json\` cannot be updated in it by the next release. `
          + `Create this release while immutable releases are disabled, then enable immutability.`,
        );
      }

      return;
    }

    if (release.immutable) {
      this.logger.error(
        `The release "${updater}" is immutable, so \`update.json\` cannot be uploaded to it.`,
      );
      this.logImmutableHint();
      throw new Error(`Unable to update the immutable release "${updater}".`);
    }

    const existedAssets = await this.listAssets(release.id);

    for (const manifest of manifests) {
      const existedAsset = existedAssets.find(asset => asset.name === manifest);
      if (!existedAsset)
        continue;

      this.logger.debug(`Delete existed asset ${manifest} in release ${updater}`);
      await this.client.rest.repos.deleteReleaseAsset({
        ...this.remote,
        asset_id: existedAsset.id,
      });
    }

    for (const manifest of manifests)
      await this.uploadAsset(release.id, join(dist, manifest));

    await this.client.rest.repos.updateRelease({
      ...this.remote,
      release_id: release.id,
      name: "Release Manifest",
      body: this.manifestBody,
      prerelease: true,
      make_latest: "false",
    });
  }

  async getChangelog(): Promise<string> {
    const { release } = this.ctx;
    const { github } = release;
    const { releaseNote } = github;
    return releaseNote(this.ctx);
  }

  getClient(): Octokit {
    if (!process.env.GITHUB_TOKEN)
      throw new Error("No GITHUB_TOKEN.");
    const client = new Octokit({
      auth: process.env.GITHUB_TOKEN,
      userAgent: "zotero-plugin-scaffold",
    });

    return client;
  }

  get remote(): {
    owner: string;
    repo: string;
  } {
    const [owner, repo] = this.ctx.release.github.repository.split("/");
    return {
      owner,
      repo,
    };
  }

  /**
   * The tag of the release of the current version, e.g. `v1.0.0`.
   */
  get versionTag(): string {
    return this.ctx.release.bumpp
      .tag!
      .toString()
      .replaceAll("%s", this.ctx.version);
  }

  get manifestBody(): string {
    return `This release is used to host \`update.json\`, please do not delete or modify it! \n Updated in UTC ${new Date().toISOString()} for version ${this.ctx.version}`;
  }

  /**
   * Explain how to handle immutable releases, called when an immutable release
   * blocks the current operation.
   */
  logImmutableHint(): void {
    this.logger.error(
      [
        "GitHub immutable releases cannot be changed after publication:",
        "assets can neither be added nor deleted, and tag names cannot be reused.",
        "Only releases published after immutable releases were enabled are affected,",
        "so releases created before enabling it can still be updated.",
        "",
        "To host update.json on a GitHub release, publish it once while immutable",
        "releases are disabled, then enable immutability.",
        "Alternatively, host update.json yourself and set `release.github.updater: false`.",
        "",
        "See https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/immutable-releases",
      ].join("\n"),
    );
  }
}

/**
 * Whether the error was raised because the release is immutable.
 */
function isImmutableReleaseError(error: unknown): boolean {
  if (typeof error !== "object" || error === null)
    return false;

  const { message, status } = error as { message?: unknown; status?: unknown };
  return status === 422
    && typeof message === "string"
    && message.includes("immutable release");
}
