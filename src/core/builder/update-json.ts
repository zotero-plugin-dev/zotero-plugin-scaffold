import type { Context } from "../../types/index.js";
import type { Manifest } from "../../types/manifest.js";
import type { UpdateJSON } from "../../types/update-json.js";
import { createHash } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import { readJSON, writeJson } from "fs-extra/esm";
import { logger } from "../../utils/logger.js";

export function generateHash(
  filePath: string,
  algorithm: "sha256" | "sha512" | string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash(algorithm);
    const stream = createReadStream(filePath);

    stream.on("data", (data) => {
      hash.update(data);
    });

    stream.on("end", () => {
      const fileHash = hash.digest("hex");
      resolve(`${algorithm}:${fileHash}`);
    });

    stream.on("error", (error) => {
      reject(error);
    });
  });
}

export function generateHashSync(
  filePath: string,
  algorithm: "sha256" | "sha512" | string,
): string {
  const data = readFileSync(filePath);
  const hash = createHash(algorithm).update(data).digest("hex");
  return `${algorithm}:${hash}`;
}

export default async function buildUpdateJson(ctx: Context) {
  const { dist, xpiName, id, version, xpiDownloadLink, build } = ctx;

  const manifest = await readJSON(
    `${dist}/addon/manifest.json`,
  ) as Manifest;
  const min = manifest.applications?.zotero?.strict_min_version;
  const max = manifest.applications?.zotero?.strict_max_version;

  const updateHash = await generateHash(`${dist}/${xpiName}.xpi`, "sha512");

  const data: UpdateJSON = {
    addons: {
      [id]: {
        updates: [
          ...build.makeUpdateJson.updates,
          {
            version,
            update_link: xpiDownloadLink,
            ...(build.makeUpdateJson.hash && {
              update_hash: updateHash,
            }),
            applications: {
              zotero: {
                ...(min && { strict_min_version: min }),
                ...(max && { strict_max_version: max }),
              },
            },
          },
        ],
      },
    },
  };

  await writeJson(`${dist}/update-beta.json`, data, { spaces: 2 });
  if (!ctx.templateData.isPreRelease)
    await writeJson(`${dist}/update.json`, data, { spaces: 2 });

  logger.debug(
    `Prepare Update.json for ${
      ctx.templateData.isPreRelease
        ? "\u001B[31m Prerelease \u001B[0m"
        : "\u001B[32m Release \u001B[0m"
    }`,
  );
}
