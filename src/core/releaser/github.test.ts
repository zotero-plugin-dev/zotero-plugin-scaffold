import type { Octokit } from "@octokit/rest";
import type { Context } from "../../types/index.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../utils/logger.js";
import GitHub from "./github.js";

interface ReleaseStub {
  id: number;
  draft: boolean;
  immutable?: boolean;
  tag_name?: string;
}

interface AssetStub {
  id: number;
  name: string;
}

interface OctokitStubOptions {
  /** The release returned by `getReleaseByTag`, or undefined to simulate a 404. */
  releaseByTag?: ReleaseStub;
  /** Releases returned by `listReleases`, e.g. an unfinished draft. */
  releases?: ReleaseStub[];
  /** Assets returned by `listReleaseAssets`. */
  assets?: AssetStub[];
}

function createOctokitStub(options: OctokitStubOptions = {}) {
  const calls: string[] = [];

  const createRelease = vi.fn(async (params: { tag_name: string; draft?: boolean; prerelease?: boolean }) => {
    calls.push(`create:${params.tag_name}:draft=${params.draft}`);
    return {
      status: 201,
      data: {
        id: 10,
        tag_name: params.tag_name,
        draft: params.draft ?? false,
        prerelease: params.prerelease ?? false,
        immutable: false,
        assets: [],
      },
    };
  });

  const uploadReleaseAsset = vi.fn(async (params: { name: string }) => {
    calls.push(`upload:${params.name}`);
    return { data: { id: 11, name: params.name } };
  });

  const updateRelease = vi.fn(async (params: { release_id: number; draft?: boolean; prerelease?: boolean }) => {
    calls.push(`update:${params.release_id}:draft=${params.draft}:prerelease=${params.prerelease}`);
    return {
      data: {
        id: params.release_id,
        draft: params.draft ?? false,
        prerelease: params.prerelease ?? false,
        immutable: params.draft === false,
        assets: [],
      },
    };
  });

  const deleteReleaseAsset = vi.fn(async (params: { asset_id: number }) => {
    calls.push(`delete-asset:${params.asset_id}`);
    return { data: undefined };
  });

  const getReleaseByTag = vi.fn(async () => {
    if (options.releaseByTag)
      return { status: 200, data: options.releaseByTag };
    throw Object.assign(new Error("Not Found"), { status: 404 });
  });

  const listReleases = vi.fn(async () => ({ data: options.releases ?? [] }));
  const listReleaseAssets = vi.fn(async () => ({ data: options.assets ?? [] }));

  const client = {
    rest: {
      repos: {
        createRelease,
        deleteReleaseAsset,
        getReleaseByTag,
        listReleaseAssets,
        listReleases,
        updateRelease,
        uploadReleaseAsset,
      },
    },
    paginate: vi.fn(async (fn: (params: unknown) => Promise<{ data: unknown[] }>, params: unknown) => {
      return (await fn(params)).data;
    }),
  };

  return {
    calls,
    client: client as unknown as Octokit,
    createRelease,
    deleteReleaseAsset,
    getReleaseByTag,
    listReleaseAssets,
    updateRelease,
    uploadReleaseAsset,
  };
}

const originalToken = process.env.GITHUB_TOKEN;
const tempDirs: string[] = [];

async function createReleaser(
  stub: ReturnType<typeof createOctokitStub>,
  overrides: { version?: string } = {},
): Promise<GitHub> {
  const dist = await mkdtemp(join(tmpdir(), "scaffold-releaser-"));
  tempDirs.push(dist);
  await writeFile(join(dist, "my-plugin.xpi"), "xpi");
  await writeFile(join(dist, "update.json"), "{}");
  await writeFile(join(dist, "update-beta.json"), "{}");

  const ctx = {
    version: overrides.version ?? "1.2.3",
    // tinyglobby requires POSIX separators in glob patterns on Windows.
    dist: dist.replaceAll("\\", "/"),
    xpiName: "my-plugin",
    logger,
    release: {
      bumpp: { tag: "v%s" },
      github: {
        repository: "owner/repo",
        updater: "release",
        releaseNote: () => "changelog",
      },
    },
  } as unknown as Context;

  const releaser = new GitHub(ctx);
  releaser.client = stub.client;
  return releaser;
}

describe("releaser/github", () => {
  beforeEach(() => {
    process.env.GITHUB_TOKEN = "test-token";
    logger.setLogLevel("ERROR");
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
  });

  afterAll(() => {
    if (originalToken === undefined)
      delete process.env.GITHUB_TOKEN;
    else
      process.env.GITHUB_TOKEN = originalToken;
  });

  describe("uploadXPI", () => {
    it("creates a draft, uploads the XPI, then publishes the release", async () => {
      const stub = createOctokitStub();
      const releaser = await createReleaser(stub);

      await releaser.uploadXPI();

      expect(stub.calls).toEqual([
        "create:v1.2.3:draft=true",
        "upload:my-plugin.xpi",
        "update:10:draft=false:prerelease=false",
      ]);
      expect(stub.createRelease).toHaveBeenCalledWith(expect.objectContaining({
        tag_name: "v1.2.3",
        draft: true,
        prerelease: false,
      }));
      expect(stub.updateRelease.mock.calls[0][0]).toMatchObject({
        draft: false,
        make_latest: "true",
      });
    });

    it("does not mark a prerelease as latest", async () => {
      const stub = createOctokitStub();
      const releaser = await createReleaser(stub, { version: "1.3.0-beta.1" });

      await releaser.uploadXPI();

      expect(stub.createRelease).toHaveBeenCalledWith(expect.objectContaining({
        prerelease: true,
        draft: true,
      }));
      expect(stub.updateRelease.mock.calls[0][0]).not.toHaveProperty("make_latest");
    });

    it("reuses an unfinished draft release instead of creating a new one", async () => {
      const stub = createOctokitStub({
        releases: [{ id: 12, draft: true, tag_name: "v1.2.3" }],
        assets: [{ id: 13, name: "my-plugin.xpi" }],
      });
      const releaser = await createReleaser(stub);

      await releaser.uploadXPI();

      expect(stub.createRelease).not.toHaveBeenCalled();
      expect(stub.calls).toEqual([
        "delete-asset:13",
        "upload:my-plugin.xpi",
        "update:12:draft=false:prerelease=false",
      ]);
    });

    it("skips uploading when the published release already has the XPI", async () => {
      const stub = createOctokitStub({
        releaseByTag: { id: 5, draft: false, immutable: true },
        assets: [{ id: 6, name: "my-plugin.xpi" }],
      });
      const releaser = await createReleaser(stub);

      await releaser.uploadXPI();

      expect(stub.calls).toEqual([]);
    });

    it("uploads to a mutable published release, e.g. released before enabling immutability", async () => {
      const stub = createOctokitStub({
        releaseByTag: { id: 5, draft: false, immutable: false },
      });
      const releaser = await createReleaser(stub);

      await releaser.uploadXPI();

      expect(stub.calls).toEqual(["upload:my-plugin.xpi"]);
      expect(stub.createRelease).not.toHaveBeenCalled();
    });

    it("throws when the immutable release has no XPI", async () => {
      const stub = createOctokitStub({
        releaseByTag: { id: 5, draft: false, immutable: true },
      });
      const releaser = await createReleaser(stub);

      await expect(releaser.uploadXPI()).rejects.toThrow(/immutable release "v1.2.3"/);
      expect(stub.calls).toEqual([]);
    });
  });

  describe("refreshUpdateManifest", () => {
    it("creates the manifest release as a draft and publishes it after uploading", async () => {
      const stub = createOctokitStub();
      const releaser = await createReleaser(stub);

      await releaser.refreshUpdateManifest();

      expect(stub.createRelease).toHaveBeenCalledWith(expect.objectContaining({
        tag_name: "release",
        draft: true,
        prerelease: true,
      }));
      expect(stub.calls.filter(call => call.startsWith("upload:")).sort()).toEqual([
        "upload:update-beta.json",
        "upload:update.json",
      ]);
      expect(stub.calls.at(-1)).toBe("update:10:draft=false:prerelease=true");
    });

    it("replaces the manifests of a mutable manifest release", async () => {
      const stub = createOctokitStub({
        releaseByTag: { id: 7, draft: false, immutable: false },
        assets: [{ id: 8, name: "update.json" }],
      });
      const releaser = await createReleaser(stub);

      await releaser.refreshUpdateManifest();

      expect(stub.deleteReleaseAsset).toHaveBeenCalledTimes(1);
      expect(stub.deleteReleaseAsset).toHaveBeenCalledWith(expect.objectContaining({ asset_id: 8 }));
      expect(stub.uploadReleaseAsset).toHaveBeenCalledTimes(2);
    });

    it("throws with a hint when the manifest release is immutable", async () => {
      const stub = createOctokitStub({
        releaseByTag: { id: 7, draft: false, immutable: true },
      });
      const releaser = await createReleaser(stub);

      await expect(releaser.refreshUpdateManifest()).rejects.toThrow(/immutable release "release"/);
      expect(stub.deleteReleaseAsset).not.toHaveBeenCalled();
      expect(stub.uploadReleaseAsset).not.toHaveBeenCalled();
    });
  });
});
