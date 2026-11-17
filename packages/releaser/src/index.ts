import type { ReleaseContext } from "./types.js";
import { execSync } from "node:child_process";
import { Base } from "@zotero-plugin/config";
import { Bump } from "./bump.js";
import { getConventionalChangelog, getGitCommits } from "./changelog.js";
import { isEnabled } from "./config.js";
import { GitHub } from "./github.js";

export class Releaser extends Base<ReleaseContext> {
  constructor(ctx: ReleaseContext) {
    super(ctx);
  }

  /**
   * Runs release
   *
   * if is not CI，bump version, git add (package.json), git commit, git tag, git push;
   * if is CI, do not bump version, do not run git, create release (tag is `v${version}`) and upload xpi,
   *    then, create or update release (tag is "release"), update `update.json`.
   */
  async run(): Promise<void> {
    const t = new Date();

    const isGitHubEnabled = isEnabled(this.ctx.config.release.github.enable);

    this.logger.debug(`Release config: ", ${this.ctx.config.release}`);

    // Releaser ready
    await this.ctx.hooks.callHook("release:init", this.ctx);

    // Bump version, Git
    await new Bump(this.ctx).run();
    await this.ctx.hooks.callHook("release:push", this.ctx);

    // Get changelog
    this.ctx.changelog = await this.getChangelog();

    // Publish to GitHub
    if (isGitHubEnabled) {
      await new GitHub(this.ctx).run();
    }

    // TODO: Publish to Zotero's official market

    await this.ctx.hooks.callHook("release:done", this.ctx);
    this.logger.success(
      `Done in ${(Date.now() - t.getTime()) / 1000} s.`,
    );
  }

  async getChangelog(): Promise<string> {
    let changelog: string;
    const rawCommit = await getGitCommits(
      this.ctx.tag ?? this.ctx.config.release.bumpp.tag.replaceAll("%s", this.ctx.version),
      this.resolvedCommitMessage,
    );
    if (rawCommit.length === 0) {
      return "_No significant changes._";
    }

    const changelogConfig = this.ctx.config.release.changelog;
    if (typeof changelogConfig == "function") {
      changelog = changelogConfig(this.ctx, rawCommit);
    }
    else if (!!changelogConfig && typeof changelogConfig == "string") {
      changelog = execSync(changelogConfig).toString().trim();
    }
    else {
      changelog = await getConventionalChangelog(rawCommit);
    }
    this.logger.debug(`Got changelog:\n${changelog}\n`);
    return changelog;
  }

  exit(): void {}

  get resolvedCommitMessage(): string {
    return this.ctx.commitMessage
      ?? this.ctx.config.release.bumpp.commit.replaceAll("%s", this.ctx.version);
  }
}

export { Bump } from "./bump.js";
export { releaseDefaults, releaseTransform } from "./config.js";
export { GitHub } from "./github.js";
export type {
  ReleaseConfig,
  ReleaseContext,
  ReleaseHooks,
  ResolvedReleaseConfig,
} from "./types.js";
export type { VersionBumpRelease } from "bumpp";
