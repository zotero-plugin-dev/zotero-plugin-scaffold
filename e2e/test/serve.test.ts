import type { CliProcess } from "../helpers/cli";
import type { Project } from "../helpers/project";
import { writeFile } from "node:fs/promises";
import process from "node:process";
import { pathExists } from "fs-extra/esm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startCli } from "../helpers/cli";
import { clearEvents, readEvents, waitForEvent } from "../helpers/events";
import { createProject } from "../helpers/project";
import { defaultProfileOf, killZoteroByProfile, waitForZoteroExit } from "../helpers/zotero";

async function startDev(project: Project): Promise<CliProcess> {
  await clearEvents(project.dir);
  return startCli("zodev", [], { cwd: project.dir });
}

interface StopResult {
  result: Awaited<CliProcess["exited"]>;
  /** Whether a Zotero is still using the profile, checked once after the stop. */
  zoteroStillRunning: boolean;
}

/** Stop a dev server, and only chase Zotero when the CLI did not. */
async function stopDev(project: Project, cli: CliProcess, signal: NodeJS.Signals = "SIGINT"): Promise<StopResult> {
  if (cli.child.exitCode === null && cli.child.signalCode === null)
    cli.child.kill(signal);

  const result = await cli.exited;
  const profile = defaultProfileOf(project.dir);

  if (result.signal !== null)
    killZoteroByProfile(profile);

  return { result, zoteroStillRunning: !(await waitForZoteroExit(profile)) };
}

describe("zodev", () => {
  let project: Project;

  beforeAll(async () => {
    project = await createProject("zodev");
  });

  afterAll(async () => {
    killZoteroByProfile(defaultProfileOf(project.dir));
    await project.cleanup();
  });

  it("builds, starts Zotero, reloads on a change, and stops on SIGINT", async () => {
    const cli = await startDev(project);
    let stop: StopResult;

    try {
      await waitForEvent(project.dir, "serve:ready");

      let events = await readEvents(project.dir);
      expect(events).toContain("serve:init");
      expect(events).toContain("serve:prebuild");
      expect(events).toContain("build:done");
      expect(events.indexOf("serve:ready")).toBeGreaterThan(events.indexOf("serve:prebuild"));
      expect(await pathExists(project.at(".scaffold/logs"))).toBe(true);

      await writeFile(
        project.at("src/config.ts"),
        "export const PREF_PREFIX = \"extensions.scaffold-fixture\";\n// touched by the e2e suite\n",
      );
      await waitForEvent(project.dir, "serve:onReloaded", { timeoutMs: 180_000 });

      events = await readEvents(project.dir);
      expect(events).toContain("serve:onChanged");
      expect(events.indexOf("serve:onChanged")).toBeLessThan(events.indexOf("serve:onReloaded"));
    }
    finally {
      stop = await stopDev(project, cli, "SIGINT");
    }

    if (process.platform !== "win32") {
      expect(stop.result.signal).toBeNull();
      expect(stop.result.code).toBe(0);
      expect(stop.result.stdout).toContain("Shutting down by user request");
    }

    expect(stop.zoteroStillRunning).toBe(false);
  });
});
