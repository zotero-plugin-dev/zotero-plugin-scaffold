import type { VersionBumpOptions, VersionBumpProgress } from "bumpp";
import type { Context } from "../../types/index.js";
import { ProgressEvent, versionBump } from "bumpp";
import { ReleaseBase } from "./base.js";

export default class Bump extends ReleaseBase {
  constructor(ctx: Context) {
    super(ctx);
  }

  async run(): Promise<void> {
    const bumppConfig: VersionBumpOptions = {
      ...this.ctx.release.bumpp,
      push: true,
      progress: this.bumppProgress,
    };

    const { version } = this.ctx;
    if (bumppConfig.release === version) {
      this.logger.debug("Commit, tag, and push are disabled because new version = old version.");
      bumppConfig.commit = false;
      bumppConfig.tag = false;
      bumppConfig.push = false;
    }

    const result = await versionBump(bumppConfig);
    this.ctx.version = result.newVersion;
    this.ctx.release.bumpp.tag = result.tag || this.ctx.release.bumpp.tag.toString().replace("%s", result.newVersion);
    this.ctx.release.bumpp.commit = result.commit || this.ctx.release.bumpp.commit.toString().replace("%s", result.newVersion);

    this.logger.debug(`The release context after bump: ", ${this.ctx.release}`);
  }

  /**
   * bumpp 显示进度的回调
   *
   * @see https://github.com/antfu/bumpp/blob/main/src/cli/index.ts
   */
  get bumppProgress() {
    return ({
      event,
      script,
      updatedFiles,
      skippedFiles,
      newVersion,
    }: VersionBumpProgress): void => {
      switch (event) {
        case ProgressEvent.FileUpdated:
          this.logger.success(`Updated ${updatedFiles.pop()} to ${newVersion}`);
          break;

        case ProgressEvent.FileSkipped:
          this.logger.info(`${skippedFiles.pop()} did not need to be updated`);
          break;

        case ProgressEvent.GitCommit:
          this.logger.success("Git commit");
          break;

        case ProgressEvent.GitTag:
          this.logger.success("Git tag");
          break;

        case ProgressEvent.GitPush:
          this.logger.success("Git push");
          break;

        case ProgressEvent.NpmScript:
          this.logger.success(`Npm run ${script}`);
          break;
      }
    };
  }
}
