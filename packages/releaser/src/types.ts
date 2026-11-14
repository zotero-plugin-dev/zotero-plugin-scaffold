import type { BaseContext } from "@zotero-plugin/config";
import type { RecursivePartial } from "@zotero-plugin/utils";
import type { VersionBumpRelease } from "bumpp";
import type { GitCommit } from "changelogen";

export interface ReleaseConfig {
  /**
   * Configurations of bumpp.
   */
  bumpp: {
    /**
     * The release version or type. Can be one of the following:
     *
     * - A release type (e.g. "major", "minor", "patch", "prerelease", etc.)
     * - "prompt" to prompt the user for the version number
     *
     * @default "prompt"
     */
    release: VersionBumpRelease;
    /**
     * The prerelease type (e.g. "alpha", "beta", "next").
     *
     * @default "beta"
     */
    preid: string;
    /**
     * The commit message.
     *
     * Any `%s` placeholders in the message string will be replaced with the new version number.
     *
     * @default "chore(publish): release %s"
     */
    commit: string;
    /**
     * The tag template.
     *
     * @default "v%s"
     */
    tag: string;
    /**
     * Indicates whether the git commit should include ALL files (`git commit --all`).
     *
     * @default false
     */
    all: boolean;
    /**
     * Prompt for confirmation.
     *
     * @default true
     */
    confirm: boolean;
    /**
     * Indicates whether to bypass git commit hooks (`git commit --no-verify`).
     *
     * @default false
     */
    noVerify: boolean;
    /**
     * Execute additional command after bumping and before committing.
     *
     * @default "npm run build"
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
   * @default ""
   */
  changelog: string | ((ctx: ReleaseContext, commits: GitCommit[]) => string);

  /**
   * Release to GitHub.
   */
  github: {
    /**
     * Enable release to GitHub.
     *
     * - "ci" to only enable in ci
     * - "local" to only enable in non-ci
     * - "always" to always enable
     * - "false" to always disable
     *
     * @default "ci"
     */
    enable: "ci" | "local" | "always" | "false";
    /**
     * The information of remote repository.
     *
     * Will be extracted from the `repository` property in `package.json` by default.
     *
     * @default {{owner}}/{{repo}}
     */
    repository: string;
    /**
     * Upload update.json to release.
     *
     * This is the tagName of the release when the value is a string.
     *
     * @default "release"
     */
    updater: string | false;
    /**
     * Comment to issues and prs included in release.
     *
     * @todo Not implemented yet
     *
     * @default false
     */
    comment: boolean;
    releaseNote: (ctx: ReleaseContext) => string;
  };

  hooks: Partial<ReleaseHooks>;
}

export interface ReleaseHooks {
  "release:init": (ctx: ReleaseContext) => void | Promise<void>;
  "release:push": (ctx: ReleaseContext) => void | Promise<void>;
  "release:done": (ctx: ReleaseContext) => void | Promise<void>;
}

export interface ReleaseUserConfig {
  release?: RecursivePartial<ReleaseConfig>;
}

/**
 * The context of the release command.
 */
export interface ReleaseContext extends BaseContext {
  release: ReleaseConfig;
}
