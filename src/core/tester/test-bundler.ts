/**
 * Test impact analysis for watch mode.
 *
 * Bundles test files with rolldown and maps source files → test artifacts via
 * the rolldown metafile, so a source change can select the affected tests to
 * rerun. (The tester plugin bundler itself lives in `bundler.ts`.)
 */
import type { OutputChunk, RolldownOutput } from "rolldown";
import { relative } from "node:path";
import { cwd } from "node:process";
import { normalizePath } from "../../utils/string.js";

interface _MetaData extends Pick<OutputChunk, "fileName" | "name" | "moduleIds"> {}
export type MetaData = _MetaData[];

export function transformRolldownOutputToMetafile(output?: RolldownOutput["output"]): MetaData {
  if (!output) {
    return [];
  }

  return output
    .flat()
    .filter(r => r.type === "chunk")
    .map(r => ({
      fileName: normalizePath(r.fileName),
      name: r.name,
      moduleIds: r.moduleIds.map(id => relative(cwd(), id)).map(normalizePath),
    }));
}

/**
 * Determines which test files are impacted by a given changed file based on
 * rolldown build output.
 *
 * This function analyzes the build metadata to find test files that depend on
 * the changed file either directly as an entry point or indirectly as an input.
 *
 * @param {string} changedFilePath - The file path of the changed source file.
 * @param {MetaData} buildMetadata - The transformed rolldown build outputs.
 * @returns {string[]} An array of impacted test file names that need to be re-executed.
 */
export function findImpactedTests(
  changedFilePath: string,
  buildMetadata: MetaData,
): string[] {
  const normalizedPath = normalizePath(changedFilePath);
  const impacted: string[] = [];

  for (const module of buildMetadata) {
    if (module.moduleIds.includes(normalizedPath)) {
      impacted.push(module.fileName);
    }
  }

  return impacted;
}
