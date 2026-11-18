import type { Command } from "@zotero-plugin/config";
import type { ReleaseContext, ReleaseProvider } from "./types.js";
import { execSync } from "node:child_process";
import { bump } from "./bump.js";
import { getConventionalChangelog, getGitCommits } from "./changelog.js";
import { githubProvider } from "./providers/github.js";

export const releaseProviders: ReleaseProvider[] = [githubProvider];

export interface Releaser extends Command {
  run: () => Promise<void>;
}

export async function createReleaser(ctx: ReleaseContext): Promise<Releaser> {
  return {
    run: () => release(ctx),
  };
}

/**
 * Runs release
 *
 * if is not CI，bump version, git add (package.json), git commit, git tag, git push;
 * if is CI, do not bump version, do not run git, create release (tag is `v${version}`) and upload xpi,
 *    then, create or update release (tag is "release"), update `update.json`.
 */
export async function release(ctx: ReleaseContext): Promise<void> {
  const startedAt = new Date();

  ctx.logger.debug(`Release config: ${ctx.config.release}`);

  await ctx.hooks.callHook("release:init", ctx);

  await bump(ctx);
  await ctx.hooks.callHook("release:push", ctx);

  ctx.changelog = await getChangelog(ctx);

  for (const provider of releaseProviders) {
    if (!provider.isEnabled(ctx))
      continue;

    ctx.logger.tip(`Releasing to ${provider.name}...`);
    await provider.run(ctx);
  }

  await ctx.hooks.callHook("release:done", ctx);
  ctx.logger.success(`Done in ${(Date.now() - startedAt.getTime()) / 1000} s.`);
}

async function getChangelog(ctx: ReleaseContext): Promise<string> {
  let changelog: string;
  const rawCommit = await getGitCommits(
    ctx.tag ?? ctx.config.release.bumpp.tag.replaceAll("%s", ctx.version),
    resolvedCommitMessage(ctx),
  );
  if (rawCommit.length === 0) {
    return "_No significant changes._";
  }

  const changelogConfig = ctx.config.release.changelog;
  if (typeof changelogConfig == "function") {
    changelog = changelogConfig(ctx, rawCommit);
  }
  else if (!!changelogConfig && typeof changelogConfig == "string") {
    changelog = execSync(changelogConfig).toString().trim();
  }
  else {
    changelog = await getConventionalChangelog(rawCommit);
  }
  ctx.logger.debug(`Got changelog:\n${changelog}\n`);
  return changelog;
}

function resolvedCommitMessage(ctx: ReleaseContext): string {
  return ctx.commitMessage
    ?? ctx.config.release.bumpp.commit.replaceAll("%s", ctx.version);
}

export { bump } from "./bump.js";
export { releaseDefaults, releaseTransform } from "./config.js";
export { githubProvider } from "./providers/github.js";
export type {
  GitHubConfig,
  ReleaseConfig,
  ReleaseContext,
  ReleaseHooks,
  ReleaseProvider,
  ResolvedReleaseConfig,
} from "./types.js";
export type { VersionBumpRelease } from "bumpp";
