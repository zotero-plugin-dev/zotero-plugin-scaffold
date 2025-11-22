import type { Context } from "../../types/index.js";
import { execSync } from "node:child_process";
import { isCI } from "std-env";
import { Base } from "../base.js";
import Bump from "./bump.js";
import { getConventionalChangelog, getGitCommits } from "./changelog.js";
import GitHub from "./github.js";

export default class Release extends Base {
  constructor(ctx: Context) {
    super(ctx);
  }

  /**
   * Runs release
   *
   * if is not CI，bump version, git add (package.json), git commit, git tag, git push;
   * if is CI, do not bump version, do not run git, create release (tag is `v${version}`) and upload xpi,
   *    then, create or update release (tag is "release"), update `update.json`.
   */
  async run() {
    const t = new Date();

    const { release, version } = this.ctx;

    // Parse release config
    if (release.bumpp.release === "prompt" && isCI) {
      this.logger.warn("Config `release.bumpp.release == 'prompt'` will do nothing because in CI enviroment.");
      this.ctx.release.bumpp.release = version;
    }

    if (release.bumpp.confirm && isCI) {
      this.logger.warn("Config `release.bumpp.confirm` will do nothing because in CI enviroment.");
      this.ctx.release.bumpp.confirm = false;
    }

    const isBumpNeeded = this.ctx.release.bumpp.release !== version;
    const isGitHubEnabled = this.isEnabled(release.github.enable);
    const isPublishNeeded = isGitHubEnabled;

    if (isPublishNeeded && !release.bumpp.execute) {
      this.logger.warn(`The current release needs to run the build after bumping the version number, please configure the build script in 'config.release.bumpp.execute'${isBumpNeeded ? "" : " or run build before run release"}.`);
      this.ctx.release.bumpp.execute ||= "npm run build";
    }

    this.logger.debug(`Release config: ", ${this.ctx.release}`);

    // Releaser ready
    await this.ctx.hooks.callHook("release:init", this.ctx);

    // Bump version, Git
    await new Bump(this.ctx).run();
    await this.ctx.hooks.callHook("release:push", this.ctx);

    // Get changelog
    this.ctx.release.changelog = await this.getChangelog();

    // Publish to GitHub
    if (isGitHubEnabled) {
      await new GitHub(this.ctx).run();
    }

    // TODO: Publish to Zotero's official market

    await this.ctx.hooks.callHook("release:done", this.ctx);
    this.logger.success(
      `Done in ${(new Date().getTime() - t.getTime()) / 1000} s.`,
    );
  }

  async getChangelog() {
    const { commit, tag } = this.ctx.release.bumpp;
    let changelog: string;
    const rawCommit = await getGitCommits(tag, commit);
    if (rawCommit.length === 0) {
      return "_No significant changes._";
    }

    const changelogConfig = this.ctx.release.changelog;
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

  private isEnabled(enable: string) {
    if (enable === "always")
      return true;
    if (enable === "ci" && isCI)
      return true;
    if (enable === "local" && !isCI)
      return true;
    return false;
  }

  exit() {}

  get resolvedCommitMessage() {
    return this.ctx.release.bumpp.commit.replace("%s", this.ctx.version);
  }
}
