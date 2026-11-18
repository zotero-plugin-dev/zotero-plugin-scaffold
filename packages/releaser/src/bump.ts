import type { VersionBumpOptions, VersionBumpProgress } from "bumpp";
import type { ReleaseContext } from "./types.js";
import { ProgressEvent, versionBump } from "bumpp";

export async function bump(ctx: ReleaseContext): Promise<void> {
  const bumppConfig: VersionBumpOptions = {
    ...ctx.config.release.bumpp,
    push: true,
    progress: progressLogger(ctx),
  };

  const { version } = ctx;
  if (bumppConfig.release === version) {
    ctx.logger.debug("Commit, tag, and push are disabled because new version = old version.");
    bumppConfig.commit = false;
    bumppConfig.tag = false;
    bumppConfig.push = false;
  }

  const result = await versionBump(bumppConfig);
  ctx.version = result.newVersion;
  ctx.tag = result.tag || ctx.config.release.bumpp.tag.replaceAll("%s", result.newVersion);
  ctx.commitMessage = result.commit || ctx.config.release.bumpp.commit.replaceAll("%s", result.newVersion);

  ctx.logger.debug(`The release context after bump: tag=${ctx.tag}, commitMessage=${ctx.commitMessage}`);
}

/**
 * bumpp 显示进度的回调
 *
 * @see https://github.com/antfu/bumpp/blob/main/src/cli/index.ts
 */
function progressLogger(ctx: ReleaseContext): (progress: VersionBumpProgress) => void {
  const { logger } = ctx;

  return ({
    event,
    script,
    updatedFiles,
    skippedFiles,
    newVersion,
  }: VersionBumpProgress): void => {
    switch (event) {
      case ProgressEvent.FileUpdated:
        logger.success(`Updated ${updatedFiles.pop()} to ${newVersion}`);
        break;

      case ProgressEvent.FileSkipped:
        logger.info(`${skippedFiles.pop()} did not need to be updated`);
        break;

      case ProgressEvent.GitCommit:
        logger.success("Git commit");
        break;

      case ProgressEvent.GitTag:
        logger.success("Git tag");
        break;

      case ProgressEvent.GitPush:
        logger.success("Git push");
        break;

      case ProgressEvent.NpmScript:
        logger.success(`Npm run ${script}`);
        break;
    }
  };
}
