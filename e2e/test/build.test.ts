import type { Project } from "../helpers/project";
import { resolve } from "node:path";
import AdmZip from "adm-zip";
import { outputFile, outputJSON, pathExists, readJSON } from "fs-extra/esm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCli } from "../helpers/cli";
import { clearEvents, readEvents } from "../helpers/events";
import { createProject } from "../helpers/project";
import { updateSnapshotDir } from "../helpers/snapshot";

/** The hooks of one `zobuild`, in order. */
const BUILD_HOOKS = [
  "build:init",
  "build:mkdir",
  "build:copyAssets",
  "build:makeManifest",
  "build:fluent",
  "build:bundle",
  "build:pack",
  "build:makeUpdateJSON",
  "build:done",
];

describe("build", () => {
  let project: Project;

  beforeAll(async () => {
    project = await createProject("build");
    const result = await runCli("zobuild", [], { cwd: project.dir });
    expect(result.code).toBe(0);
  });

  afterAll(async () => {
    await project.cleanup();
  });

  it("copies the static assets into dist/addon", async () => {
    expect(await project.read("dist/addon/bootstrap.js")).toContain("function startup");
    expect(await project.read("dist/addon/chrome/content/placeholder.txt")).toContain("Copied as an asset");
  });

  it("replaces define placeholders in the copied assets", async () => {
    const { version } = await readJSON(project.at("package.json"));

    const placeholder = await project.read("dist/addon/chrome/content/placeholder.txt");
    expect(placeholder).toContain(`version=${version}`);
    expect(placeholder).not.toContain("__buildTime__");
    expect(placeholder).toMatch(/buildTime=\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
  });

  it("bundles the scripts with esbuild into dist/addon", async () => {
    const index = await project.read("dist/addon/content/scripts/index.js");
    expect(index).toContain("extensions.scaffold-fixture");
    expect(index).toContain("globalThis.ScaffoldFixture");
    expect(await project.read("dist/addon/content/scripts/extra.js")).toContain("fixture-extra-bundle");
  });

  it("writes manifest.json with the resolved identity and update url", async () => {
    const manifest = await readJSON(project.at("dist/addon/manifest.json"));
    const { version } = await readJSON(project.at("package.json"));

    expect(manifest.name).toBe("Scaffold Fixture Plugin");
    expect(manifest.version).toBe(version);
    expect(manifest.applications.zotero.id).toBe("scaffold-fixture@example.com");
    expect(manifest.applications.zotero.update_url).toBe(
      "https://github.com/zotero-plugin-dev/zotero-plugin-scaffold/releases/download/release/update.json",
    );
    expect(manifest.applications.zotero.strict_min_version).toBe("6.999");
    expect(manifest.applications.zotero.strict_max_version).toBe("8.*");
  });

  it("prefixes locale file names and messages, and rewrites the xhtml references", async () => {
    expect(await pathExists(project.at("dist/addon/locale/en-US/prefs.ftl"))).toBe(false);

    const ftl = await project.read("dist/addon/locale/en-US/scaffold-fixture-prefs.ftl");
    expect(ftl).toContain("scaffold-fixture-fixture-section-general = General Settings");
    expect(ftl).toContain("scaffold-fixture-fixture-pref-boolean");
    expect(ftl).toContain(".label = A string preference");
    expect(ftl).toContain(".tooltiptext = It has a tooltip");

    const xhtml = await project.read("dist/addon/preference.xhtml");
    expect(xhtml).toContain("data-l10n-id=\"scaffold-fixture-fixture-section-general\"");
    expect(xhtml).toContain("data-l10n-id=\"ignored-message\"");
    expect(ftl).toContain("scaffold-fixture-ignored-message =");
  });

  it("prefixes prefs.js keys and the xhtml preference attributes", async () => {
    const prefs = await project.read("dist/addon/prefs.js");
    expect(prefs).toContain("pref(\"extensions.scaffold-fixture.stringPref\", \"0.0.0\");");
    expect(prefs).toContain("pref(\"extensions.scaffold-fixture.longNumberPref\", 2222222222222222);");

    const xhtml = await project.read("dist/addon/preference.xhtml");
    expect(xhtml).toContain("preference=\"extensions.scaffold-fixture.booleanPref\"");
  });

  it("generates the typings from the locale files and prefs.js", async () => {
    const i10n = await project.read("typings/i10n.d.ts");
    expect(i10n).toContain("| 'fixture-pref-boolean'");
    expect(i10n).toContain("| 'ignored-message'");
    expect(i10n).not.toContain("scaffold-fixture-");

    const prefs = await project.read("typings/prefs.d.ts");
    expect(prefs).toContain("\"stringPref\": string;");
    expect(prefs).toContain("\"longNumberPref\": number;");
  });

  it("writes update.json and update-beta.json for a release version", async () => {
    const update = await readJSON(project.at("dist/update.json"));
    const beta = await readJSON(project.at("dist/update-beta.json"));
    expect(update).toEqual(beta);

    const { version } = await readJSON(project.at("package.json"));

    const updates = update.addons["scaffold-fixture@example.com"].updates;
    expect(updates).toHaveLength(2);
    expect(updates[0].version).toBe("0.4.5");
    expect(updates[1].version).toBe(version);
    expect(updates[1].update_link).toBe(
      `https://github.com/zotero-plugin-dev/zotero-plugin-scaffold/releases/download/v${version}/scaffold-fixture.xpi`,
    );
    expect(updates[1].applications.zotero.strict_min_version).toBe("6.999");
    expect(updates[1].update_hash).toBeUndefined();
  });

  it("packs dist/addon into an xpi, whose entries are the built files", async () => {
    const zip = new AdmZip(project.at("dist/scaffold-fixture.xpi"));
    const entries = zip.getEntries()
      .map(entry => entry.entryName.replaceAll("\\", "/"))
      .filter(name => !name.endsWith("/"))
      .sort();

    expect(entries).toEqual([
      "bootstrap.js",
      "chrome/content/placeholder.txt",
      "content/scripts/extra.js",
      "content/scripts/index.js",
      "locale/en-US/scaffold-fixture-prefs.ftl",
      "locale/zh-CN/scaffold-fixture-prefs.ftl",
      "manifest.json",
      "preference.xhtml",
      "prefs.js",
    ]);

    expect(zip.readAsText("manifest.json")).toBe(await project.read("dist/addon/manifest.json"));
    expect(zip.readAsText("prefs.js")).toBe(await project.read("dist/addon/prefs.js"));
  });

  it("calls the build hooks once each, in order", async () => {
    expect(await readEvents(project.dir)).toEqual(BUILD_HOOKS);
  });

  it("warns about a pref number that does not fit in 32 bits", async () => {
    const result = await runCli("zobuild", [], { cwd: project.dir });
    expect(result.stdout).toContain("longNumberPref");
    expect(result.stdout).toContain("more than 4 bytes");
  });
});

describe("build: repeated runs", () => {
  let project: Project;

  beforeAll(async () => {
    project = await createProject("build-repeated");
    expect((await runCli("zobuild", [], { cwd: project.dir })).code).toBe(0);
  });

  afterAll(async () => {
    await project.cleanup();
  });

  it("clears dist before building again", async () => {
    const stale = project.at("dist/addon/stale.txt");
    await outputFile(stale, "stale");
    expect(await pathExists(stale)).toBe(true);

    await clearEvents(project.dir);
    expect((await runCli("zobuild", [], { cwd: project.dir })).code).toBe(0);

    expect(await pathExists(stale)).toBe(false);
    expect(await readEvents(project.dir)).toEqual(BUILD_HOOKS);
  });

  it("honours --dist", async () => {
    const result = await runCli("zobuild", ["--dist", "other-dist"], { cwd: project.dir });
    expect(result.code).toBe(0);
    expect(await pathExists(project.at("other-dist/addon/manifest.json"))).toBe(true);
  });

  it("does not pack or write update manifests with --dev", async () => {
    const result = await runCli("zobuild", ["--dev"], { cwd: project.dir });
    expect(result.code).toBe(0);

    expect(await pathExists(project.at("dist/scaffold-fixture.xpi"))).toBe(false);
    expect(await pathExists(project.at("dist/update.json"))).toBe(false);
    expect(await project.read("dist/addon/manifest.json")).toContain("Scaffold Fixture Plugin");
  });

  it("writes only update-beta.json for a prerelease version", async () => {
    const pkg = await readJSON(project.at("package.json"));
    const [major, minor, patch] = String(pkg.version).split(".");
    await outputJSON(project.at("package.json"), { ...pkg, version: `${major}.${minor}.${patch}-beta.1` }, { spaces: 2 });

    const result = await runCli("zobuild", [], { cwd: project.dir });
    expect(result.code).toBe(0);

    expect(await pathExists(project.at("dist/update.json"))).toBe(false);
    expect(await pathExists(project.at("dist/update-beta.json"))).toBe(true);
  });
});

describe("build: failure", () => {
  let project: Project;

  beforeAll(async () => {
    project = await createProject("build-failure");
  });

  afterAll(async () => {
    await project.cleanup();
  });

  it("exits with 1 when a bundle cannot be resolved", async () => {
    await project.write("src/index.ts", "import { doesNotExist } from \"./nope\";\nconsole.log(doesNotExist);\n");

    const result = await runCli("zobuild", [], { cwd: project.dir });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("nope");
  });
});

describe("build: snapshot", () => {
  let project: Project;

  beforeAll(async () => {
    project = await createProject("build-snapshot");
    const result = await runCli("zobuild", [], { cwd: project.dir });
    expect(result.code).toBe(0);
  });

  afterAll(async () => {
    await project.cleanup();
  });

  it("matches the recorded dist and typings snapshots", async () => {
    const version = (await readJSON(project.at("package.json"))).version as string;
    const options = {
      dirs: [project.dir],
      versions: [version],
    };

    expect(await updateSnapshotDir(project.at("dist"), resolve(import.meta.dirname, "..", "snap", "dist"), {
      ...options,
      ignore: ["**/*.xpi"],
    })).toEqual([]);

    expect(await updateSnapshotDir(project.at("typings"), resolve(import.meta.dirname, "..", "snap", "typings"), options))
      .toEqual([]);
  });
});
