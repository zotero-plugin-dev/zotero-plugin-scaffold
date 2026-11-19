import type { Project } from "../helpers/project";
import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { pathExists, readJSON } from "fs-extra/esm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SCAFFOLD_PACKAGE_DIR } from "../helpers/cli";
import { createProject } from "../helpers/project";

/** What a user installs: the tarball and the `exports` it resolves. */

const execFileAsync = promisify(execFile);

/** Node refuses to spawn a `.cmd` directly, so go through `cmd.exe`. */
function runNpm(args: string[]): Promise<{ stdout: string }> {
  return process.platform === "win32"
    ? execFileAsync("cmd.exe", ["/c", "npm", ...args], { cwd: SCAFFOLD_PACKAGE_DIR })
    : execFileAsync("npm", args, { cwd: SCAFFOLD_PACKAGE_DIR });
}

const BINS = [
  "zotero-plugin",
  "zobuild",
  "zodev",
  "zotest",
  "zorelease",
];

const EXPORT_SUBPATHS: [key: string, specifier: string][] = [
  [".", "zotero-plugin-scaffold"],
  ["./cli", "zotero-plugin-scaffold/cli"],
  ["./test", "zotero-plugin-scaffold/test"],
  ["./vendor", "zotero-plugin-scaffold/vendor"],
];

async function readScaffoldPkg(): Promise<Record<string, any>> {
  return readJSON(join(SCAFFOLD_PACKAGE_DIR, "package.json"));
}

describe("package: exports", () => {
  it("has an entry for each documented subpath", async () => {
    const pkg = await readScaffoldPkg();

    for (const [subpath] of EXPORT_SUBPATHS)
      expect(Object.keys(pkg.exports)).toContain(subpath);

    expect(pkg.main).toBe("./dist/index.js");
    expect(pkg.module).toBe("./dist/index.js");
    expect(pkg.types).toBe("./dist/index.d.ts");
  });

  it("resolves every subpath through Node itself", async () => {
    for (const [, specifier] of EXPORT_SUBPATHS) {
      const resolved = new URL(import.meta.resolve(specifier));

      expect(await pathExists(fileURLToPath(resolved))).toBe(true);
      expect(resolved.pathname).toMatch(/\/dist\//);
    }
  });

  it("ships the declaration files every subpath points at", async () => {
    const pkg = await readScaffoldPkg();

    const declared = Object.entries(pkg.exports as Record<string, any>)
      .flatMap(([, value]) => Object.values(value as Record<string, string>))
      .filter(file => file.endsWith(".d.ts") || file.endsWith(".d.mts"));

    expect(declared.length).toBeGreaterThan(0);

    for (const file of declared)
      expect(await pathExists(join(SCAFFOLD_PACKAGE_DIR, file)), file).toBe(true);
  });

  it("can be imported by a project that only depends on the package", async () => {
    const project = await createProject("package-import");
    try {
      await project.write("import-check.mjs", `
        import * as root from "zotero-plugin-scaffold";
        import { replaceInFile } from "zotero-plugin-scaffold/vendor";

        if (typeof root.defineConfig !== "function")
          throw new Error("root entry has no defineConfig");
        if (typeof root.loadConfig !== "function")
          throw new Error("root entry has no loadConfig");
        if (typeof replaceInFile !== "function")
          throw new Error("vendor entry has no replaceInFile");

        console.log("ok");
      `);

      const { stdout } = await execFileAsync(process.execPath, ["import-check.mjs"], {
        cwd: project.dir,
        env: { ...process.env, NO_COLOR: "1" },
      });
      expect(stdout.trim()).toBe("ok");
    }
    finally {
      await project.cleanup();
    }
  });
});

describe("package: bins", () => {
  it("declares one bin entry per command", async () => {
    const pkg = await readScaffoldPkg();
    expect(Object.keys(pkg.bin).sort()).toEqual([...BINS].sort());
  });

  it("points every bin at a file with a shebang", async () => {
    const pkg = await readScaffoldPkg();

    for (const name of BINS) {
      const file = join(SCAFFOLD_PACKAGE_DIR, pkg.bin[name]);
      expect(await pathExists(file), file).toBe(true);

      // Without it, `npx zobuild` fails on a Unix install.
      const content = await readFile(file, "utf-8");
      expect(content.startsWith("#!/usr/bin/env node"), name).toBe(true);
    }
  });

  it("installs the bins of the package that e2e resolves", async () => {
    for (const name of BINS) {
      const shim = join(import.meta.dirname, "..", "node_modules", ".bin", name);
      expect(await pathExists(shim), shim).toBe(true);
      expect((await stat(shim)).isFile()).toBe(true);
    }
  });

  it("runs a bin through the shim a user gets", async () => {
    const project = await createProject("package-bin-shim");
    try {
      const shim = join(import.meta.dirname, "..", "node_modules", ".bin", "zotero-plugin");

      const { stdout } = await execFileAsync("sh", [shim, "--version"], {
        cwd: project.dir,
        env: { ...process.env, NO_COLOR: "1" },
      });

      const pkg = await readScaffoldPkg();
      expect(stdout.trim()).toBe(pkg.version);
    }
    finally {
      await project.cleanup();
    }
  });
});

describe("package: tarball", () => {
  let project: Project;
  let files: string[];

  beforeAll(async () => {
    project = await createProject("package-tarball");

    const { stdout } = await runNpm([
      "pack",
      "--dry-run",
      "--json",
      "--ignore-scripts",
    ]);

    // Keyed by package name, not an array.
    const packed = Object.values(JSON.parse(stdout) as Record<string, { files: { path: string }[] }>)[0];
    files = packed.files.map(file => file.path.replaceAll("\\", "/"));
  });

  afterAll(async () => {
    await project.cleanup();
  });

  it("contains only bin, dist and the readme", async () => {
    const unexpected = files.filter(file =>
      !file.startsWith("bin/")
      && !file.startsWith("dist/")
      && file !== "package.json"
      && file !== "README.md"
      && file !== "LICENSE",
    );

    expect(unexpected).toEqual([]);
  });

  it("contains every declared bin and export target", async () => {
    const pkg = await readScaffoldPkg();

    const declared = [
      ...Object.values(pkg.bin as Record<string, string>),
      ...Object.values(pkg.exports as Record<string, any>)
        .flatMap((value: Record<string, string>) => Object.values(value)),
    ].map(file => file.replace(/^\.\//, ""));

    for (const file of declared)
      expect(files, file).toContain(file);
  });

  it("contains the shared chunks the entry points import", async () => {
    const shared = files.filter(file => file.startsWith("dist/shared/"));
    expect(shared.length).toBeGreaterThan(0);
  });
});

describe("package: dist is what the bins run", () => {
  it("has no import of the TypeScript sources", async () => {
    const pkg = await readScaffoldPkg();
    const entry = join(SCAFFOLD_PACKAGE_DIR, pkg.main);
    const content = await readFile(entry, "utf-8");

    expect(content).not.toMatch(/from ["'][^"']*src\//);
    expect(content).not.toMatch(/\.ts["']/);
  });
});
