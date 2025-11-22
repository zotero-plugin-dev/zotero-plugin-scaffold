import type { GitCommit } from "changelogen";
import { execSync } from "node:child_process";
import process from "node:process";
import { generateMarkDown, getGitDiff, loadChangelogConfig, parseCommits } from "changelogen";
import { escapeRegExp } from "es-toolkit";

export async function getConventionalChangelog(commits: GitCommit[]) {
  // If user do not use Conventional Commit,
  // return commit messages directly.
  if (!commits[0].type) {
    return commits.map(c => c.message).join("\n");
  }

  const resolvedCommits = commits.map((c) => {
    if (c.type === "remove") {
      c.isBreaking = true;
    }
    return c;
  });

  const _config = await loadChangelogConfig(process.cwd(), {
    types: {
      add: { title: "🚀 Enhancements", semver: "minor" },
      change: { title: "🩹 Fixes", semver: "patch" },
      remove: { title: "🩹 Fixes", semver: "minor" },
    },
    hideAuthorEmail: true,
  });
  const md = await generateMarkDown(resolvedCommits, _config);
  return md.split("\n").slice(3).join("\n");
}

export async function getGitCommits(currentTag: string, commitMessageTemplate: string): Promise<GitCommit[]> {
  /**
   * Get all git tags
   *
   * @example
   *
   * ```bash
   * $ git tag -l --sort=v:refname
   * v2.0.9
   * v2.0.10
   * v2.0.11
   * v2.0.12
   * v2.0.13
   * v2.0.13-beta.1
   * v2.0.13-beta.2
   * v2.0.13-beta.3
   * v2.0.14
   * ```
   */
  const tags = execSync("git tag -l --sort=v:refname").toString().trim().split("\n");

  const currentTagIndex = tags.indexOf(currentTag);
  if (currentTagIndex === -1)
    throw new Error(`Tag "${currentTag}" not found.`);

  let previousTagIndex = currentTagIndex - 1;
  let previousTag: string | undefined;

  if (currentTagIndex === 0) {
    // If the current tag is the first tag, get all logs before this one
    previousTag = undefined;
  }
  // Otherwise, get log between this tag and previous one
  else if (currentTag.includes("-")) {
    // If current tag is pre-release, previous one should be any (include prerelease and official)
    previousTag = tags[previousTagIndex];
  }
  else {
    // If current tag is official release, previous one should be official too
    // Find the last non-pre-release tag
    while (previousTagIndex >= 0 && tags[previousTagIndex].includes("-")) {
      previousTagIndex--;
    }
    if (previousTagIndex < 0)
    // If no previous official release is found, get all logs up to the currentTag
      previousTag = undefined;
    else
      previousTag = tags[previousTagIndex];
  }

  // const commitMessage = this.ctx.release.bumpp.commit;
  const filterRegex = new RegExp(escapeRegExp(commitMessageTemplate));
  const rawCommits = (await getGitDiff(previousTag, currentTag)).filter(c => !filterRegex.test(c.message));
  // @ts-expect-error we know options only needs scopeMap
  return parseCommits(rawCommits, { scopeMap: {} });

  // if (previousTag)
  //   return execSync(`git log --pretty=format:"* %s (%h)" ${previousTag}..${currentTag}`).toString().trim();
  // else
  //   return execSync(`git log --pretty=format:"* %s (%h)" ${currentTag}`).toString().trim();
}
