import type { Project } from "../helpers/project";
import { outputJSON, pathExists, readJSON } from "fs-extra/esm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCli } from "../helpers/cli";
import { createProject } from "../helpers/project";

/** Line-ending agnostic: a CRLF checkout must not silently match nothing. */
function withoutPrefsPrefix(config: string): string {
  const pattern = /^ {4}prefs: \{\r?\n {6}prefix: "extensions\.scaffold-fixture",\r?\n {4}\},\r?\n/m;

  return config.replace(pattern, "");
}

/** c12 loads the config, `.env` and `package.json` from `cwd`. */
describe("config", () => {
  let project: Project;

  beforeAll(async () => {
    project = await createProject("config");
  });

  afterAll(async () => {
    await project.cleanup();
  });

  it("loads a TypeScript config from the project root", async () => {
    const result = await runCli("zobuild", [], { cwd: project.dir });
    expect(result.code).toBe(0);

    const manifest = await readJSON(project.at("dist/addon/manifest.json"));
    expect(manifest.name).toBe("Scaffold Fixture Plugin");
  });

  it("reads ZOTERO_PLUGIN_* from the project .env", async () => {
    await project.write(".env", "ZOTERO_PLUGIN_PROFILE_PATH=/nonexistent/profile\n");

    const result = await runCli("zobuild", [], { cwd: project.dir });
    expect(result.code).toBe(0);
  });

  it("resolves package.json identity fields as defaults", async () => {
    const pkg = await readJSON(project.at("package.json"));
    expect(pkg.name).toBe("scaffold-fixture-plugin");
  });

  it("renders template placeholders in updateURL and xpiDownloadLink", async () => {
    const { version } = await readJSON(project.at("package.json"));
    const update = await readJSON(project.at("dist/update.json"));
    const entry = update.addons["scaffold-fixture@example.com"].updates.at(-1);

    expect(entry.update_link).toContain("github.com/zotero-plugin-dev/zotero-plugin-scaffold");
    expect(entry.update_link).toContain(`/v${version}/scaffold-fixture.xpi`);

    const manifest = await readJSON(project.at("dist/addon/manifest.json"));
    expect(manifest.applications.zotero.update_url).toContain("/release/update.json");
  });

  it("lets a CLI override win over the config file", async () => {
    const result = await runCli("zobuild", ["--dist", "cli-dist"], { cwd: project.dir });
    expect(result.code).toBe(0);
    expect(await pathExists(project.at("cli-dist/addon/manifest.json"))).toBe(true);
  });

  it("switches NODE_ENV per command, which decides whether it packs", async () => {
    expect((await runCli("zobuild", [], { cwd: project.dir })).code).toBe(0);
    expect(await pathExists(project.at("dist/scaffold-fixture.xpi"))).toBe(true);

    expect((await runCli("zobuild", ["--dev"], { cwd: project.dir })).code).toBe(0);
    expect(await pathExists(project.at("dist/scaffold-fixture.xpi"))).toBe(false);
  });
});

describe("config: compatibility and overrides", () => {
  let project: Project;

  beforeAll(async () => {
    project = await createProject("config-overrides");
  });

  afterAll(async () => {
    await project.cleanup();
  });

  it("falls back to package.json#config.prefsPrefix for the old template", async () => {
    await project.write("zotero-plugin.config.ts", withoutPrefsPrefix(await project.read("zotero-plugin.config.ts")));

    const pkg = await readJSON(project.at("package.json"));
    await outputJSON(project.at("package.json"), {
      ...pkg,
      config: { prefsPrefix: "extensions.old-template" },
    }, { spaces: 2 });

    const result = await runCli("zobuild", [], { cwd: project.dir });
    expect(result.code).toBe(0);

    expect(await project.read("dist/addon/prefs.js")).toContain("pref(\"extensions.old-template.stringPref\"");
  });

  it("uses the namespace as the default prefs prefix", async () => {
    await project.write("zotero-plugin.config.ts", withoutPrefsPrefix(await project.read("zotero-plugin.config.ts")));

    const pkg = await readJSON(project.at("package.json"));
    await outputJSON(project.at("package.json"), {
      ...pkg,
      config: {},
    }, { spaces: 2 });

    const result = await runCli("zobuild", [], { cwd: project.dir });
    expect(result.code).toBe(0);

    expect(await project.read("dist/addon/prefs.js")).toContain("pref(\"extensions.scaffold-fixture.stringPref\"");
  });

  it("fails when package.json cannot be found", async () => {
    const { rename } = await import("node:fs/promises");
    await rename(project.at("package.json"), project.at("package.json.bak"));

    const result = await runCli("zobuild", [], { cwd: project.dir });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("package.json");

    await rename(project.at("package.json.bak"), project.at("package.json"));
  });
});

describe("config: hooks", () => {
  let project: Project;

  beforeAll(async () => {
    project = await createProject("config-hooks");
  });

  afterAll(async () => {
    await project.cleanup();
  });

  it("registers the hooks of every slice, however deeply nested", async () => {
    const result = await runCli("zobuild", [], { cwd: project.dir });
    expect(result.code).toBe(0);

    expect(await project.read(".scaffold/events.jsonl")).toContain("build:init");
    expect(await project.read(".scaffold/events.jsonl")).not.toContain("serve:init");
  });

  it("rejects a config that is not valid TypeScript", async () => {
    const config = await project.read("zotero-plugin.config.ts");
    await project.write("zotero-plugin.config.ts", `${config}\nthis is not typescript;\n`);

    const result = await runCli("zobuild", [], { cwd: project.dir });
    expect(result.code).toBe(1);
  });
});
