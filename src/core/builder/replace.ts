import type { BuildConfig } from "../../types/config.js";
import { readFile, writeFile } from "node:fs/promises";
import { glob } from "tinyglobby";
import { logger } from "../../utils/logger.js";
import { toArray } from "../../utils/string.js";

export function replace(contents: string, from: RegExp | RegExp[], to: string | string[]) {
  const froms = Array.isArray(from) ? from : [from];
  const tos = Array.isArray(to)
    ? to
    : Array.from({ length: froms.length }, () => to);

  if (froms.length !== tos.length) {
    throw new Error("The lengths of 'from' and 'to' must be equal");
  }

  return froms.reduce((result, pattern, index) => result.replace(pattern, tos[index]), contents);
}

export async function replaceInFile({ files, from, to, isGlob = true }: {
  files: string | string[];
  from: RegExp | RegExp[];
  to: string | string[];
  isGlob?: boolean;
}) {
  const paths = isGlob ? await glob(files) : toArray(files);
  await Promise.all(paths.map(async (path) => {
    const contents = await readFile(path, "utf-8");
    const newContents = replace(contents, from, to);
    if (contents !== newContents)
      await writeFile(path, newContents);
  }));
}

export default async function replaceDefine(dist: string, define: BuildConfig["define"]) {
  // Replace all `placeholder.key` to `placeholder.value` for all files in `dist`
  const replaceMap = new Map(
    Object.keys(define).map(key => [
      new RegExp(`__${key}__`, "g"),
      define[key],
    ]),
  );
  logger.debug(`replace map: ${replaceMap}`);

  await replaceInFile({
    files: `${dist}/addon/**/*`,
    // files: [
    //   `${dist}/addon/**/*.html`,
    //   `${dist}/addon/**/*.xhtml`,
    //   `${dist}/addon/**/*.ftl`,
    //   `${dist}/addon/**/*.css`,
    //   `${dist}/addon/**/*.json`,
    // ],
    from: Array.from(replaceMap.keys()),
    to: Array.from(replaceMap.values()),
    // isGlob: false,
  });
}
