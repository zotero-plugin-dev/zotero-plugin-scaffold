import { readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { outputFile, pathExists, remove } from "fs-extra/esm";
import { glob } from "tinyglobby";

/** Normalizes only the parts a run varies, never a difference in behaviour. */
const BUILD_TIME_RE = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/g;

export interface NormalizeOptions {
  dirs?: string[];
  versions?: string[];
}

export function normalize(content: string, options: NormalizeOptions = {}): string {
  const { dirs = [], versions = [] } = options;
  let result = content.replaceAll("\r\n", "\n");

  for (const dir of dirs) {
    result = result.replaceAll(dir, "<cwd>");
    result = result.replaceAll(dir.replaceAll("\\", "/"), "<cwd>");
  }

  for (const version of versions)
    result = result.replaceAll(version, "<version>");

  return result.replaceAll(BUILD_TIME_RE, "<buildTime>");
}

/** Every file below `dir`, as POSIX paths relative to it, sorted. */
export async function listFiles(dir: string, ignore: string[] = []): Promise<string[]> {
  const files = await glob("**/*", {
    cwd: dir,
    onlyFiles: true,
    dot: false,
    ignore,
  });

  return files.map(file => file.replaceAll("\\", "/")).sort();
}

export interface SnapshotOptions extends NormalizeOptions {
  ignore?: string[];
  update?: boolean;
}

/** Empty means the two agree. */
export async function diffDir(
  actualDir: string,
  snapshotDir: string,
  options: SnapshotOptions = {},
): Promise<string[]> {
  const actual = await listFiles(actualDir, options.ignore ?? []);
  const expected = await listFiles(snapshotDir, options.ignore ?? []);

  const differences: string[] = [];

  for (const file of expected) {
    if (!actual.includes(file)) {
      differences.push(`missing: ${file}`);
      continue;
    }

    const actualContent = normalize(await readFile(join(actualDir, file), "utf-8"), options);
    const expectedContent = normalize(await readFile(join(snapshotDir, file), "utf-8"), options);
    if (actualContent !== expectedContent)
      differences.push(`differs: ${file}`);
  }

  for (const file of actual) {
    if (!expected.includes(file))
      differences.push(`unexpected: ${file}`);
  }

  return differences;
}

/** Writes a missing snapshot; `UPDATE_SNAPSHOTS=1` refreshes an existing one. */
export async function updateSnapshotDir(
  actualDir: string,
  snapshotDir: string,
  options: SnapshotOptions = {},
): Promise<string[]> {
  const exists = await pathExists(snapshotDir);
  const differences = exists
    ? await diffDir(actualDir, snapshotDir, options)
    : [];

  if (exists && differences.length === 0)
    return [];

  if (!exists || options.update || process.env.UPDATE_SNAPSHOTS === "1") {
    await remove(snapshotDir);
    for (const file of await listFiles(actualDir, options.ignore ?? [])) {
      const content = normalize(await readFile(join(actualDir, file), "utf-8"), options);
      await outputFile(join(snapshotDir, file), content);
    }

    return [];
  }

  return differences;
}
