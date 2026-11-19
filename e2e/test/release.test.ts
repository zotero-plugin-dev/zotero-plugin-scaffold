import type { Project } from "../helpers/project";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCli } from "../helpers/cli";
import { readEvents } from "../helpers/events";
import { createProject, TMP_ROOT } from "../helpers/project";

const execFileAsync = promisify(execFile);

/** A fixed identity, so a developer's global git config cannot leak in. */
async function git(dir: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: dir,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "e2e",
      GIT_AUTHOR_EMAIL: "e2e@example.com",
      GIT_COMMITTER_NAME: "e2e",
      GIT_COMMITTER_EMAIL: "e2e@example.com",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
    },
  });
  return stdout.trim();
}

async function createRemote(): Promise<string> {
  const remote = join(TMP_ROOT, `remote-${Date.now()}-${Math.random().toString(36).slice(2)}.git`);
  await execFileAsync("git", ["init", "--bare", remote]);
  return remote;
}

/** One tagged commit, pushed: `getGitCommits()` diffs the new tag against it. */
async function initRepo(project: Project): Promise<string> {
  const remote = await createRemote();
  const version = await pkgVersion(project);

  await project.write(".gitignore", "node_modules\n.env\n.scaffold\ndist\ntypings\n");

  await git(project.dir, ["init", "-b", "main"]);
  await git(project.dir, ["remote", "add", "origin", remote]);
  await git(project.dir, ["add", "-A"]);
  await git(project.dir, ["commit", "-m", "feat: initial commit"]);
  await git(project.dir, ["tag", `v${version}`]);
  await git(project.dir, [
    "push",
    "-u",
    "--tags",
    "origin",
    "main",
  ]);

  return remote;
}

async function addCommit(project: Project, message: string): Promise<void> {
  await project.write("note.txt", `${message}\n`);
  await git(project.dir, ["add", "-A"]);
  await git(project.dir, ["commit", "-m", message]);
}

async function pkgVersion(project: Project): Promise<string> {
  return JSON.parse(await readFile(join(project.dir, "package.json"), "utf-8")).version;
}

function nextPatch(version: string): string {
  const [major, minor, patch] = version.split(".").map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

describe("release: unchanged version", () => {
  let project: Project;

  beforeAll(async () => {
    project = await createProject("release-same-version");
    await initRepo(project);
  });

  afterAll(async () => {
    await project.cleanup();
  });

  it("skips bump, commit, tag and push", async () => {
    const version = await pkgVersion(project);
    const head = await git(project.dir, ["rev-parse", "HEAD"]);

    const result = await runCli("zorelease", [version, "-y"], { cwd: project.dir });
    expect(result.code).toBe(0);

    expect(await pkgVersion(project)).toBe(version);
    expect(await git(project.dir, ["rev-parse", "HEAD"])).toBe(head);
    expect((await git(project.dir, ["tag"])).split("\n")).toEqual([`v${version}`]);
  });

  it("still runs the release hooks", async () => {
    const events = await readEvents(project.dir);
    expect(events).toEqual(["release:init", "release:push", "release:done"]);
  });
});

describe("release: bump", () => {
  let project: Project;
  let remote: string;

  beforeAll(async () => {
    project = await createProject("release-bump");
    remote = await initRepo(project);
  });

  afterAll(async () => {
    await project.cleanup();
  });

  it("bumps, commits, tags and pushes a patch release", async () => {
    await addCommit(project, "fix: correct a thing");
    const expected = {
      previous: await pkgVersion(project),
      next: nextPatch(await pkgVersion(project)),
    };

    const result = await runCli("zorelease", ["patch", "-y"], { cwd: project.dir });
    expect(result.code).toBe(0);

    expect(await pkgVersion(project)).toBe(expected.next);
    expect(await git(project.dir, ["log", "-1", "--pretty=%s"])).toBe(`chore(publish): release v${expected.next}`);
    expect((await git(project.dir, ["tag"])).split("\n").sort())
      .toEqual([`v${expected.previous}`, `v${expected.next}`]);

    expect((await execFileAsync("git", ["log", "--pretty=%s", "-1", "main"], { cwd: remote })).stdout.trim())
      .toBe(`chore(publish): release v${expected.next}`);
    expect((await execFileAsync("git", ["tag"], { cwd: remote })).stdout.trim().split("\n").sort())
      .toEqual([`v${expected.previous}`, `v${expected.next}`]);
  });

  it("generates the changelog of the commits since the previous tag", async () => {
    await addCommit(project, "feat: add a feature");
    await addCommit(project, "fix: fix a bug");

    const result = await runCli("zorelease", ["patch", "-y"], { cwd: project.dir });
    expect(result.code).toBe(0);

    expect(result.stdout).toContain("add a feature");
    expect(result.stdout).toContain("fix a bug");
  });

  it("bumps a prerelease with --preid", async () => {
    await addCommit(project, "feat: another feature");

    const result = await runCli("zorelease", ["prerelease", "--preid", "alpha", "-y"], { cwd: project.dir });
    expect(result.code).toBe(0);

    expect(await pkgVersion(project)).toMatch(/-alpha\.\d+$/);
  });

  it("writes only update-beta.json for the prerelease", async () => {
    const version = await pkgVersion(project);
    expect((await runCli("zobuild", [], { cwd: project.dir })).code).toBe(0);

    const beta = await project.read("dist/update-beta.json");
    expect(JSON.parse(beta).addons["scaffold-fixture@example.com"].updates.at(-1).version).toBe(version);
    await expect(project.read("dist/update.json")).rejects.toThrow();
  });
});

describe("release: push failure", () => {
  let project: Project;

  beforeAll(async () => {
    project = await createProject("release-push-failure");
    await project.write(".gitignore", "node_modules\n.env\n.scaffold\ndist\ntypings\n");
    await git(project.dir, ["init", "-b", "main"]);
    await git(project.dir, ["add", "-A"]);
    await git(project.dir, ["commit", "-m", "feat: initial commit"]);
    await git(project.dir, ["tag", `v${await pkgVersion(project)}`]);
  });

  afterAll(async () => {
    await project.cleanup();
  });

  it("exits 1 and reports the git error", async () => {
    await addCommit(project, "fix: a fix");
    const versionBefore = await pkgVersion(project);

    const result = await runCli("zorelease", ["patch", "-y"], { cwd: project.dir });

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("git push");
    expect(await pkgVersion(project)).toBe(nextPatch(versionBefore));
  });
});
