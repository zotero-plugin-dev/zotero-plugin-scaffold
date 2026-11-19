import type { CliProcess } from "../helpers/cli";
import type { Project } from "../helpers/project";
import process from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startCli } from "../helpers/cli";
import { clearEvents, waitForEvent } from "../helpers/events";
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

describe("zodev: signals", () => {
  let project: Project;

  beforeAll(async () => {
    project = await createProject("zodev-signals");
  });

  afterAll(async () => {
    killZoteroByProfile(defaultProfileOf(project.dir));
    await project.cleanup();
  });

  it("stops on SIGTERM, and can then boot again on the same profile", async () => {
    const first = await startDev(project);
    await waitForEvent(project.dir, "serve:ready");

    const stop = await stopDev(project, first, "SIGTERM");

    if (process.platform !== "win32") {
      expect(stop.result.signal).toBeNull();
      expect(stop.result.code).toBe(0);
      expect(stop.result.stdout).toContain("Shutting down by user request");
    }

    expect(stop.zoteroStillRunning).toBe(false);

    const second = await startDev(project);
    try {
      await waitForEvent(project.dir, "serve:ready", { timeoutMs: 180_000 });
    }
    finally {
      expect((await stopDev(project, second, "SIGTERM")).zoteroStillRunning).toBe(false);
    }
  });
});
