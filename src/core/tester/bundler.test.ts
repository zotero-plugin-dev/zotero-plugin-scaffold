import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTesterPlugin } from "./bundler.js";

let outDir: string;
let testDir: string;

beforeEach(async () => {
  outDir = await mkdtemp(join(tmpdir(), "zotero-tester-"));
  testDir = await mkdtemp(join(tmpdir(), "zotero-tests-"));
  await writeFile(join(testDir, "sample.spec.mjs"), "export {};\n");
});

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await rm(outDir, { recursive: true, force: true });
  await rm(testDir, { recursive: true, force: true });
});

describe("buildTesterPlugin", () => {
  it("produces the expected plugin layout", async () => {
    await buildTesterPlugin({
      outDir,
      port: 12345,
      testDir,
      testFiles: ["**/*.spec.mjs"],
    });

    const root = await readdir(outDir);
    expect(root.sort()).toEqual(["bootstrap.js", "content", "manifest.json"]);

    const content = await readdir(join(outDir, "content"));
    expect(content).toContain("index.html");
    expect(content).toContain("runtime.js");
    expect(content).toContain("setup.js");
    expect(content).toContain("tests");

    const tests = await readdir(join(outDir, "content", "tests"));
    expect(tests).toContain("sample.spec.js");

    const manifest = JSON.parse(
      await readFile(join(outDir, "manifest.json"), "utf8"),
    );
    expect(manifest).toBeDefined();
  });

  it("injects the bridge port into bootstrap.js", async () => {
    await buildTesterPlugin({ outDir, port: 43210, testDir, testFiles: [] });
    const bootstrap = await readFile(join(outDir, "bootstrap.js"), "utf8");
    expect(bootstrap).toContain("port=43210");
    expect(bootstrap).not.toContain("__PORT__");
    expect(bootstrap).not.toContain("__CHROME_REF__");
  });

  it("redirects runtime imports to the shared chunk in setup.js", async () => {
    await buildTesterPlugin({ outDir, port: 12345, testDir, testFiles: [] });
    const setup = await readFile(join(outDir, "content", "setup.js"), "utf8");
    // no bare specifiers may survive the bundle (chrome:// cannot load them)
    expect(setup).not.toMatch(/from "vitest"|from "birpc"|from "flatted"/);
  });

  it("exports format from the runtime chunk (console spy dependency)", async () => {
    // Regression: the page's console.ts imports { format } from
    // vitest/internal/browser, redirected to runtime.js — if the chunk does
    // not re-export it, the page fails on load with a SyntaxError.
    await buildTesterPlugin({ outDir, port: 12345, testDir, testFiles: [] });
    const runtime = await readFile(join(outDir, "content", "runtime.js"), "utf8");
    expect(runtime).toContain("format");
  });

  it("bundles test files importing the shared runtime chunk", async () => {
    await writeFile(
      join(testDir, "sample.spec.mjs"),
      "import { describe, it, expect } from \"vitest\";\n"
      + "describe(\"x\", () => { it(\"y\", () => { expect(1).toBe(1); }); });\n",
    );
    await buildTesterPlugin({ outDir, port: 12345, testDir, testFiles: ["**/*.spec.mjs"] });
    const testBundle = await readFile(join(outDir, "content", "tests", "sample.spec.js"), "utf8");
    expect(testBundle).toContain("from \"../runtime.js\"");
  });

  it("stamps test artifact names and returns the manifest", async () => {
    await writeFile(join(testDir, "sample.spec.mjs"), "export {};\n");
    const manifest = await buildTesterPlugin({
      outDir,
      port: 12345,
      testDir,
      testFiles: ["**/*.spec.mjs"],
      stamp: "abc",
    });
    const tests = await readdir(join(outDir, "content", "tests"));
    expect(tests).toContain("abc-sample.spec.js");
    expect(Object.values(manifest)).toContain("tests/abc-sample.spec.js");
  });

  it("bakes the waitForPlugin polling block exactly once into setup.js", async () => {
    // Regression: page/index.ts once duplicated the whole polling loop, which
    // made the page wait up to 2x30s before the first test.
    await buildTesterPlugin({
      outDir,
      port: 12345,
      testDir,
      testFiles: [],
      waitForPlugin: "() => Zotero.MyPlugin.initialized",
    });
    const setup = await readFile(join(outDir, "content", "setup.js"), "utf8");
    expect(setup.match(/Timed out waiting for the plugin/g) ?? []).toHaveLength(1);
  });
});
