import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkGitIgnore } from "./gitignore.js";
import { logger } from "./logger.js";

/** Silence outside a git repository matters as much as the reminder itself. */
describe("checkGitIgnore", () => {
  let dir: string;
  const cwd = process.cwd();
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "scaffold-gitignore-"));
    process.chdir(dir);
    warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
  });

  afterEach(async () => {
    warn.mockRestore();
    process.chdir(cwd);
    await rm(dir, { recursive: true, force: true });
  });

  it("says nothing outside a git repository", async () => {
    await writeFile(".gitignore", "node_modules\n.env\n.scaffold\n");

    await checkGitIgnore();

    expect(warn).not.toHaveBeenCalled();
    expect(await readdir(dir)).toContain(".gitignore");
  });

  it("warns once about the entries a project is missing", async () => {
    await writeFile(".gitignore", "node_modules\n");
    await mkdir(".git", { recursive: true });

    await checkGitIgnore();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain(".env");
    expect(warn.mock.calls[0][0]).toContain(".scaffold");
    expect(warn.mock.calls[0][0]).not.toContain("node_modules");
  });

  it("asks for a .gitignore when the repository has none", async () => {
    await mkdir(".git", { recursive: true });

    await checkGitIgnore();

    expect(warn).toHaveBeenCalledWith("No .gitignore file found");
  });
});
