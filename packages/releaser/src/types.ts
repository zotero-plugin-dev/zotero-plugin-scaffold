import type { BaseContext, ResolvedBaseConfig } from "@zotero-plugin/config";
import type { VersionBumpRelease } from "bumpp";
import type { GitCommit } from "changelogen";

export interface ReleaseConfig {
  release: {
    /**
     * Configurations of bumpp.
     *
     * bumpp 包的部分配置。
     */
    bumpp: {
      /**
       * The release version or type. Can be one of the following:
       *
       * - A release type (e.g. "major", "minor", "patch", "prerelease", etc.)
       * - "prompt" to prompt the user for the version number
       *
       * In general, it is recommended to set this to "prompt".
       * If you need a command that always releases a certain type,
       * you can override this option on the command line.
       *
       * 发布的版本或类型，可以是以下其中之一：
       *
       * - 版本类型（如 “major”、“minor”、“patch”、“prerelease”等）
       * - “prompt” 以交互选择版本号
       *
       * 通常来说，建议将此项设置为 “prompt”。
       * 如果需要一个始终发布某类型的命令，可以在命令行中覆盖该选项。
       *
       * @default "prompt"
       */
      release: VersionBumpRelease;
      /**
       * The prerelease type (e.g. "alpha", "beta", "next").
       *
       * 预发布的类型，如 alpha，beta，next 等。
       *
       * @default "beta"
       */
      preid: string;
      /**
       * The commit message.
       *
       * Any `%s` placeholders in the message string will be replaced with the new version number.
       * If the message string does _not_ contain any `%s` placeholders,
       * then the new version number will be appended to the message.
       *
       * 提交说明模板。
       *
       * 模板中的 `%s` 占位符将被替换为新版本号。
       * 如果模板中不包含任何 `%s` 占位符，则新版本号将附加到模板末端。
       *
       * @default "chore(publish): release v%s"
       */
      commit: string;
      /**
       * The tag template.
       *
       * Any `%s` placeholders in the tag string will be replaced with the new version number.
       * If the tag string does _not_ contain any `%s` placeholders,
       * then the new version number will be appended to the tag.
       *
       * 标签模板。
       *
       * 模板中的 `%s` 占位符将被替换为新版本号。
       * 如果模板中不包含任何 `%s` 占位符，则新版本号将附加到模板末端。
       *
       * @default "v%s"
       */
      tag: string;
      /**
       * Indicates whether the git commit should include ALL files (`git commit --all`)
       * rather than just the files that were modified by `versionBump()`.
       *
       * 表示 git 提交是否包括所有文件（`git commit --all`），
       * 而不是只包含被 `versionBump()` 修改过的文件。
       *
       * @default false
       */
      all: boolean;
      /**
       * Prompt for confirmation.
       *
       * 选择版本号后是否要求二次确认。
       *
       * @default true
       */
      confirm: boolean;
      /**
       * Indicates whether to bypass git commit hooks (`git commit --no-verify`).
       *
       * 表示是否绕过 git commit hooks（`git commit --no-verify`）。
       *
       * @default false
       */
      noVerify: boolean;
      /**
       * Execute additional command after bumping and before committing.
       *
       * 在提升版本号之后，提交之前运行的额外命令。
       *
       * @default "" (falls back to "npm run build" when the release needs a build)
       */
      execute: string;
    };

    /**
     * Changelog.
     *
     * - '':  Use convention-based changelogs to generate changelogs grouped
     *        by type when the first commit is a convention-based commit.
     *        Otherwise, a list of commit messages.
     * - string: a command line with changelog output to stdout.
     * - function: a function that returns the changelog.
     *
     * 变更日志。
     *
     * - "": 使用约定式变更日志，当第一次提交是约定式提交时，将按类型分组生成变更日志。
     *       否则，则为提交消息的列表。
     * - string: 命令行，变更日志输出到 stdout
     * - function: 一个函数，返回变更日志。
     *
     * @default ""
     */
    changelog: string | ((ctx: ReleaseContext, commits: GitCommit[]) => string);

    /**
     * Release to GitHub.
     *
     * 发布到 GitHub。
     */
    github: {
      /**
       * Enable release to GitHub.
       *
       * Include uploading XPI asset to GitHub release and all following steps.
       *
       * - "ci" to only enable in ci
       * - "local" to only enable in non-ci
       * - "always" to always enable
       * - "false" to always disable
       *
       * 是否发布到 GitHub。
       *
       * 包括上传 XPI 制品到 GitHub release 及之后的所有步骤。
       *
       * - "ci"：仅在 CI 中启用
       * - "local"：仅在非 CI 中启用
       * - "always"：始终启用
       * - "false"：始终禁用
       *
       * @default "ci"
       */
      enable: "ci" | "local" | "always" | "false";
      /**
       * The information of remote repository.
       *
       * Will be extracted from the `repository` property in `package.json` by default.
       *
       * 远程仓库信息。
       *
       * 默认从 `package.json` 中的 `repository` 字段解析。
       *
       * @default {{owner}}/{{repo}}
       */
      repository: string;
      /**
       * Upload update.json to release.
       *
       * This is the tagName of the release when the value is a string.
       *
       * The assets of this release are replaced on every release, so it must stay
       * mutable: if the repository enables immutable releases, create this release
       * before enabling immutability, or set this option to `false` and host
       * update.json yourself.
       *
       * 将 update.json 上传到指定的 GitHub release。
       *
       * 当值为字符串时，其为 release 的 tagName。
       *
       * 该 release 的 asset 会在每次发布时被替换，因此它必须保持可变：如果仓库启用了
       * 不可变 release，请在启用前创建该 release，或者将此项设为 `false` 并自行托管
       * update.json。
       *
       * @default "release"
       */
      updater: string | false;
      /**
       * Comment to issues and prs included in release.
       *
       * 在 release 中涉及的 issue 与 PR 下发表评论。
       *
       * @todo Not implemented yet
       *
       * @default false
       */
      comment: boolean;
      /**
       * The function that returns the release note (Markdown) of the GitHub release.
       *
       * 返回 GitHub release 说明（Markdown）的函数。
       */
      releaseNote: (ctx: ReleaseContext) => string;
    };

    /**
     * The lifecycle hooks.
     *
     * 生命周期钩子。
     */
    hooks: Partial<ReleaseHooks>;
  };
}

export type ResolvedReleaseConfig = ReleaseConfig;

export interface ReleaseHooks {
  "release:init": (ctx: ReleaseContext) => void | Promise<void>;
  "release:push": (ctx: ReleaseContext) => void | Promise<void>;
  "release:done": (ctx: ReleaseContext) => void | Promise<void>;
}

/**
 * The context of the release command.
 */
export interface ReleaseContext extends BaseContext {
  config: ResolvedBaseConfig & ResolvedReleaseConfig;
}
