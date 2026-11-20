import type { Project } from "../helpers/project";
import { pathExists } from "fs-extra/esm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCli } from "../helpers/cli";
import { createProject } from "../helpers/project";

/** The command layer: what the bins accept, and what they do without Zotero. */

describe("cli", () => {
  let project: Project;

  beforeAll(async () => {
    project = await createProject("cli");
  });

  afterAll(async () => {
    await project.cleanup();
  });

  it("prints the version", async () => {
    const result = await runCli("zotero-plugin", ["--version"], { cwd: project.dir });
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("prints the command list for --help", async () => {
    const result = await runCli("zotero-plugin", ["--help"], { cwd: project.dir });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("build");
    expect(result.stdout).toContain("dev");
    expect(result.stdout).toContain("test");
    expect(result.stdout).toContain("release");
  });

  it("prints a usage line that names the bin, not the command", async () => {
    const result = await runCli("zobuild", ["--help"], { cwd: project.dir });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage: zobuild [options]");
    expect(result.stdout).not.toContain("Usage: zotero-plugin build");
  });

  it("reports an unknown command and keeps the exit code at 0", async () => {
    const result = await runCli("zotero-plugin", ["nope"], { cwd: project.dir });
    expect(result.stdout).toContain("Unknown command name");
    expect(result.stdout).toContain("nope");
  });

  it("accepts the test flags of the short bin", async () => {
    const result = await runCli("zotest", ["--help"], { cwd: project.dir });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("--no-watch");
    expect(result.stdout).toContain("--abort-on-fail");
  });

  it("accepts --dev on zobuild", async () => {
    const result = await runCli("zobuild", ["--dev"], { cwd: project.dir });
    expect(result.code).toBe(0);
    expect(await pathExists(project.at("dist/addon/manifest.json"))).toBe(true);
  });

  it("accepts --preid and -y on zorelease, and rejects a bad flag", async () => {
    const unknown = await runCli("zorelease", ["--nope"], { cwd: project.dir });
    expect(unknown.code).not.toBe(0);
    expect(`${unknown.stdout}${unknown.stderr}`).toContain("unknown option");
  });
});

describe("cli: missing prerequisites", () => {
  let project: Project;

  beforeAll(async () => {
    project = await createProject("cli-prerequisites");
  });

  afterAll(async () => {
    await project.cleanup();
  });

  /** Resolved while the command is created, so no build starts. */
  it("exits 1 with a message when the Zotero binary is not a file", async () => {
    // An explicit path is validated and never replaced by a detected install:
    // a stale or mistyped value has to be an error, not a silent detour.
    const result = await runCli("zodev", [], {
      cwd: project.dir,
      env: {
        ZOTERO_PLUGIN_ZOTERO_BIN_PATH: project.at("there-is-no-zotero-here"),
      },
    });

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("Zotero binary not found");
    expect(result.stdout).toContain("ZOTERO_PLUGIN_ZOTERO_BIN_PATH");
  });
});
