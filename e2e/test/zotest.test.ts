import type { Project } from "../helpers/project";
import { outputFile, pathExists, readJSON } from "fs-extra/esm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCli } from "../helpers/cli";
import { readEvents } from "../helpers/events";
import { createProject } from "../helpers/project";

/** The in-Zotero assertions live in `fixture/test/`; here we see the CLI only. */

describe("zotest", () => {
  let project: Project;

  beforeAll(async () => {
    project = await createProject("zotest");
  });

  afterAll(async () => {
    await project.cleanup();
  });

  it("runs the fixture tests in Zotero, and leaves a complete run on disk", async () => {
    const result = await runCli("zotest", ["--no-watch"], { cwd: project.dir });

    expect(result.stdout).toContain("Test run completed");
    expect(result.stdout).toContain("5 passed");
    expect(result.stdout).not.toContain("0 passed");
    expect(result.code).toBe(0);

    for (const path of ["profile", "data", "resource"]) {
      expect(await pathExists(project.at(`.scaffold/test/${path}`)), path).toBe(true);
    }

    const manifest = await readJSON(project.at(".scaffold/test/resource/manifest.json"));
    expect(manifest.applications.zotero.id).toBe("scaffold-test@northword.cn");

    const unitPath = ".scaffold/test/resource/content/units/fixture.test.js";
    expect(await pathExists(project.at(unitPath))).toBe(true);
    expect((await project.read(unitPath)).length).toBeLessThan(50 * 1024);

    const events = await readEvents(project.dir);
    expect(events.slice(0, 1)).toEqual(["test:init"]);
    expect(events.filter(event => event.startsWith("build:"))).toEqual([
      "build:init",
      "build:mkdir",
      "build:copyAssets",
      "build:makeManifest",
      "build:fluent",
      "build:bundle",
      "build:done",
    ]);
    expect(events.slice(-3)).toEqual(["test:prebuild", "test:bundleTests", "test:run"]);
  });

  it("reports a failing test, and runs only the file a filter selects", async () => {
    await project.write(
      "test/second.test.ts",
      [
        "import { describe, expect, it } from \"zotero-plugin-scaffold/test\";",
        "",
        "describe(\"second suite\", () => {",
        "  it(\"passes\", () => {",
        "    expect(true).toBe(true);",
        "  });",
        "});",
        "",
        "describe(\"a failing suite\", () => {",
        "  it(\"fails\", () => {",
        "    expect(1).toBe(2);",
        "  });",
        "});",
        "",
      ].join("\n"),
    );

    try {
      const result = await runCli("zotest", ["--no-watch", "second"], { cwd: project.dir });

      expect(result.code).toBe(1);
      expect(result.stdout).toContain("1 failed");
      expect(result.stdout).toContain("a failing suite");

      expect(result.stdout).toContain("second suite");
      expect(result.stdout).not.toContain("fixture plugin");
    }
    finally {
      await project.write("test/second.test.ts", "");
    }
  });

  it("refuses to run when no test file matches, instead of passing silently", async () => {
    const result = await runCli("zotest", ["--no-watch", "no-such-filter"], { cwd: project.dir });

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("No test file matched");
  });
});

describe("zotest: configuration", () => {
  let project: Project;

  beforeAll(async () => {
    project = await createProject("zotest-config");

    const config = await project.read("zotero-plugin.config.ts");
    await project.write(
      "zotero-plugin.config.ts",
      config
        .replace("    entries: [\"test\"],", "    entries: [\"test\"],\n    filter: [\"fixture\"],")
        .replace("startupDelay: 500", "startupDelay: 1500")
        .replace(
          "waitForPlugin: \"() => !!Zotero.ScaffoldFixture\"",
          "waitForPlugin: \"() => !!Zotero.SomethingThatNeverExists\"",
        )
        // Stops after the artifacts and before the launch.
        .replace(
          "      \"test:bundleTests\": ev(\"test:bundleTests\"),",
          "      \"test:bundleTests\": () => process.exit(0),",
        ),
    );

    await outputFile(
      project.at("test/other.test.ts"),
      [
        "import { describe, expect, it } from \"zotero-plugin-scaffold/test\";",
        "",
        "describe(\"other suite\", () => {",
        "  it(\"runs\", () => {",
        "    expect(true).toBe(true);",
        "  });",
        "});",
        "",
      ].join("\n"),
    );
  });

  afterAll(async () => {
    await project.cleanup();
  });

  it("bundles only the files test.filter selects", async () => {
    const result = await runCli("zotest", ["--no-watch"], { cwd: project.dir });

    expect(result.code).toBe(0);

    const units = project.at(".scaffold/test/resource/content/units");
    expect(await pathExists(`${units}/fixture.test.js`)).toBe(true);
    expect(await pathExists(`${units}/other.test.js`)).toBe(false);

    const html = await project.read(".scaffold/test/resource/content/index.xhtml");
    expect(html).toContain("units/fixture.test.js");
    expect(html).not.toContain("units/other.test.js");
  });

  it("writes test.startupDelay and test.waitForPlugin into the runner plugin", async () => {
    const bootstrap = await project.read(".scaffold/test/resource/bootstrap.js");

    expect(bootstrap).toContain("await Zotero.Promise.delay(1500)");

    expect(bootstrap).toContain("() => !!Zotero.SomethingThatNeverExists");
    expect(bootstrap).toMatch(/timeout = 1e4/);
  });

  it("never started Zotero", async () => {
    expect(await pathExists(project.at(".scaffold/test/profile"))).toBe(true);
    expect(await pathExists(project.at(".scaffold/test/profile/prefs.js"))).toBe(false);

    const manifest = await readJSON(project.at(".scaffold/test/resource/manifest.json"));
    expect(manifest.applications.zotero.id).toBe("scaffold-test@northword.cn");
  });
});
