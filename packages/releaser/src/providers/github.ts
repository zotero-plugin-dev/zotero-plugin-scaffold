import type { ReleaseContext, ReleaseProvider } from "../types.js";
import { readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import process from "node:process";
import { Octokit } from "@octokit/rest";
import { getMimeTypeByFileName } from "@zotero-plugin/utils";
import { glob, globSync } from "tinyglobby";
import { isEnabled } from "../config.js";

interface GitHubRelease {
  id: number;
  draft: boolean;
  immutable?: boolean;
}

interface GitHubReleaseAsset {
  id: number;
  name: string;
}

export const githubProvider: ReleaseProvider = {
  name: "github",
  isEnabled: ctx => isEnabled(ctx.config.release.github.enable),
  run: ctx => releaseToGitHub(ctx),
};

async function releaseToGitHub(ctx: ReleaseContext): Promise<void> {
  checkFiles(ctx);

  const client = createClient();

  ctx.logger.info("Uploading XPI to GitHub...");
  await uploadXPI(ctx, client);

  ctx.logger.info("Refreshing update manifest...");
  await refreshUpdateManifest(ctx, client);
}

/**
 * Create the release of the current version and upload the XPI.
 *
 * The release is created as a draft and published only after all assets are
 * uploaded, so that the process is compatible with
 * [immutable releases](https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/immutable-releases):
 * the assets of a published immutable release can neither be added nor deleted.
 */
export async function uploadXPI(ctx: ReleaseContext, client: Octokit): Promise<void> {
  const { dist, xpiName } = ctx.config;
  const { version } = ctx;
  const tag = getVersionTag(ctx);
  const assetName = `${xpiName}.xpi`;
  const assetPath = join(dist, assetName);

  let release = await findReleaseByTag(ctx, client, tag);

  if (release && !release.draft) {
    const publishedAssets = await listAssets(ctx, client, release.id);
    if (publishedAssets.some(asset => asset.name === assetName)) {
      ctx.logger.warn(`Release "${tag}" already contains "${assetName}", skip uploading the XPI.`);
      return;
    }

    if (release.immutable) {
      ctx.logger.error(
        `GitHub does not allow adding assets to the published immutable release "${tag}". `
        + `Please bump a new version and release again, note that the tag "${tag}" cannot be reused.`,
      );
      throw new Error(`Unable to upload "${assetName}" to the immutable release "${tag}".`);
    }
  }

  if (!release) {
    ctx.logger.debug(`Creating draft release "${tag}"...`);
    release = await createRelease(ctx, client, {
      ...getRemote(ctx),
      tag_name: tag,
      name: `Release v${version}`,
      body: getReleaseNote(ctx),
      draft: true,
      prerelease: version.includes("-"),
    });
  }

  if (!release)
    throw new Error("Create release failed!");

  await replaceAsset(ctx, client, release.id, assetPath);

  if (release.draft) {
    ctx.logger.debug(`Publishing release "${tag}"...`);
    const published = await publishRelease(ctx, client, release.id, {
      prerelease: version.includes("-"),
      makeLatest: true,
    });
    if (published?.immutable)
      ctx.logger.debug(`Release "${tag}" is immutable and covered by a release attestation.`);
  }
}

export async function refreshUpdateManifest(ctx: ReleaseContext, client: Octokit): Promise<void> {
  const updater = ctx.config.release.github.updater;
  if (!updater) {
    ctx.logger.debug(`Skip refresh update.json because release.github.updater = false`);
    return;
  }

  const { dist } = ctx.config;

  const manifests = (await glob(`${dist}/update*.json`))
    .map(p => basename(p));

  const release = await findReleaseByTag(ctx, client, updater);

  // Create the manifest release as a draft and publish it after the manifests
  // are uploaded, so that a failed upload does not leave an empty release.
  if (!release || release.draft) {
    const draft = release ?? await createRelease(ctx, client, {
      ...getRemote(ctx),
      tag_name: updater,
      name: "Release Manifest",
      body: getManifestBody(ctx),
      draft: true,
      prerelease: true,
    });

    if (!draft)
      throw new Error("Create the release for update.json failed.");

    for (const manifest of manifests)
      await replaceAsset(ctx, client, draft.id, join(dist, manifest));

    const published = await publishRelease(ctx, client, draft.id, { prerelease: true });

    if (published?.immutable) {
      ctx.logger.warn(
        `The release "${updater}" was published as an immutable release, so \`update.json\` cannot be updated in it by the next release. `
        + `Create this release while immutable releases are disabled, then enable immutability.`,
      );
    }

    return;
  }

  if (release.immutable) {
    ctx.logger.error(
      `The release "${updater}" is immutable, so \`update.json\` cannot be uploaded to it.`,
    );
    logImmutableHint(ctx);
    throw new Error(`Unable to update the immutable release "${updater}".`);
  }

  const existedAssets = await listAssets(ctx, client, release.id);

  for (const manifest of manifests) {
    const existedAsset = existedAssets.find(asset => asset.name === manifest);
    if (!existedAsset)
      continue;

    ctx.logger.debug(`Delete existed asset ${manifest} in release ${updater}`);
    await client.rest.repos.deleteReleaseAsset({
      ...getRemote(ctx),
      asset_id: existedAsset.id,
    });
  }

  for (const manifest of manifests)
    await uploadAsset(ctx, client, release.id, join(dist, manifest));

  await client.rest.repos.updateRelease({
    ...getRemote(ctx),
    release_id: release.id,
    name: "Release Manifest",
    body: getManifestBody(ctx),
    prerelease: true,
    make_latest: "false",
  });
}

async function getReleaseByTag(
  ctx: ReleaseContext,
  client: Octokit,
  tag: string,
): Promise<GitHubRelease | undefined> {
  return await client.rest.repos
    .getReleaseByTag({
      ...getRemote(ctx),
      tag,
    })
    .catch((e) => {
      ctx.logger.debug(`Release with tag ${tag} not found. ${e}`);
      return undefined;
    })
    .then((res) => {
      if (res && res.status === 200) {
        ctx.logger.debug(`Found release with tag "${tag}", id=${res.data.id}, immutable=${res.data.immutable}.`);
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
async function findReleaseByTag(
  ctx: ReleaseContext,
  client: Octokit,
  tag: string,
): Promise<GitHubRelease | undefined> {
  const published = await getReleaseByTag(ctx, client, tag);
  if (published)
    return published;

  const releases = await client.paginate(
    client.rest.repos.listReleases,
    {
      ...getRemote(ctx),
      per_page: 100,
    },
  );

  const draft = releases.find(release => release.draft && release.tag_name === tag);
  if (draft)
    ctx.logger.debug(`Found draft release with tag "${tag}", id=${draft.id}.`);

  return draft;
}

async function createRelease(
  ctx: ReleaseContext,
  client: Octokit,
  options: Parameters<Octokit["rest"]["repos"]["createRelease"]>[0],
): Promise<GitHubRelease | undefined> {
  ctx.logger.debug("Creating release...");
  ctx.logger.debug(options);
  return await client.rest.repos
    .createRelease(options)
    .catch((e) => {
      ctx.logger.error(e);
      throw new Error("Create release failed.");
    })
    .then((res) => {
      if (res.status === 201) {
        ctx.logger.debug(`Create release "${res.data.tag_name}" success, id: ${res.data.id}.`);
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
async function publishRelease(
  ctx: ReleaseContext,
  client: Octokit,
  releaseID: number,
  options: { prerelease: boolean; makeLatest?: boolean },
): Promise<GitHubRelease | undefined> {
  const { prerelease, makeLatest = false } = options;
  ctx.logger.debug(`Publishing release ${releaseID} (prerelease=${prerelease}, makeLatest=${makeLatest})...`);
  return await client.rest.repos
    .updateRelease({
      ...getRemote(ctx),
      release_id: releaseID,
      draft: false,
      prerelease,
      // Drafts and prereleases cannot be marked as the latest release.
      ...(makeLatest && !prerelease
        ? { make_latest: "true" }
        : {}),
    })
    .then((res) => {
      ctx.logger.debug(`Publish release ${releaseID} success, immutable=${res.data.immutable}.`);
      return res.data;
    });
}

async function listAssets(
  ctx: ReleaseContext,
  client: Octokit,
  releaseID: number,
): Promise<GitHubReleaseAsset[]> {
  return await client.paginate(
    client.rest.repos.listReleaseAssets,
    {
      ...getRemote(ctx),
      release_id: releaseID,
      per_page: 100,
    },
  );
}

async function replaceAsset(
  ctx: ReleaseContext,
  client: Octokit,
  releaseID: number,
  assetPath: string,
): Promise<void> {
  const assetName = basename(assetPath);
  const existing = (await listAssets(ctx, client, releaseID))
    .find(asset => asset.name === assetName);

  if (existing) {
    ctx.logger.debug(`Deleting existed asset "${assetName}" (id: ${existing.id}) in release ${releaseID}...`);
    await client.rest.repos.deleteReleaseAsset({
      ...getRemote(ctx),
      asset_id: existing.id,
    });
  }

  await uploadAsset(ctx, client, releaseID, assetPath);
}

async function uploadAsset(
  ctx: ReleaseContext,
  client: Octokit,
  releaseID: number,
  asset: string,
): Promise<{ id: number }> {
  const assetName = basename(asset);
  ctx.logger.debug(`Uploading ${assetName} to release ${releaseID}`);
  return await client.rest.repos
    .uploadReleaseAsset({
      ...getRemote(ctx),
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
        logImmutableHint(ctx);
      throw error;
    })
    .then((res) => {
      ctx.logger.debug(`Upload "${res.data.name}" success, assetId: ${res.data.id}`);
      return res.data;
    });
}

function getReleaseNote(ctx: ReleaseContext): string {
  return ctx.config.release.github.releaseNote(ctx);
}

function createClient(): Octokit {
  if (!process.env.GITHUB_TOKEN)
    throw new Error("No GITHUB_TOKEN.");

  return new Octokit({
    auth: process.env.GITHUB_TOKEN,
    userAgent: "zotero-plugin-scaffold",
  });
}

function getRemote(ctx: ReleaseContext): { owner: string; repo: string } {
  const [owner, repo] = ctx.config.release.github.repository.split("/");
  return { owner, repo };
}

function getVersionTag(ctx: ReleaseContext): string {
  return ctx.tag
    ?? ctx.config.release.bumpp.tag.replaceAll("%s", ctx.version);
}

function getManifestBody(ctx: ReleaseContext): string {
  return `This release is used to host \`update.json\`, please do not delete or modify it! \n Updated in UTC ${new Date().toISOString()} for version ${ctx.version}`;
}

function checkFiles(ctx: ReleaseContext): void {
  const { dist } = ctx.config;

  if (globSync(`${dist}/*.xpi`).length === 0)
    throw new Error("No xpi file found, are you sure you have run build?");
}

/**
 * Explain how to handle immutable releases, called when an immutable release
 * blocks the current operation.
 */
function logImmutableHint(ctx: ReleaseContext): void {
  ctx.logger.error(
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

function isImmutableReleaseError(error: unknown): boolean {
  if (typeof error !== "object" || error === null)
    return false;

  const { message, status } = error as { message?: unknown; status?: unknown };
  return status === 422
    && typeof message === "string"
    && message.includes("immutable release");
}
