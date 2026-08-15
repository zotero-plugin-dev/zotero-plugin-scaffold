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
    expect(tests.some(name => /^sample\.spec-[0-9a-f]{8}\.js$/.test(name))).toBe(true);

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
    const artifact = (await readdir(join(outDir, "content", "tests")))
      .find(name => /^sample\.spec-[0-9a-f]{8}\.js$/.test(name))!;
    const testBundle = await readFile(join(outDir, "content", "tests", artifact), "utf8");
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
    expect(tests.some(name => /^abc-sample\.spec-[0-9a-f]{8}\.js$/.test(name))).toBe(true);
    expect(Object.values(manifest).some(value => /^tests\/abc-sample\.spec-[0-9a-f]{8}\.js$/.test(value))).toBe(true);
  });

  it("keeps flattened artifact names unique so no test file is dropped", async () => {
    // Regression: src/a_b.test.ts and src/a/b.test.ts (and x.spec.ts vs
    // x.spec.mts) used to flatten to the same artifact name, so the later
    // entry overwrote the earlier one and one test file silently vanished.
    await writeFile(join(testDir, "a_b.spec.mjs"), "export const one = 1;\n");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(testDir, "a"), { recursive: true });
    await writeFile(join(testDir, "a", "b.spec.mjs"), "export const two = 2;\n");

    const manifest = await buildTesterPlugin({
      outDir,
      port: 12345,
      testDir,
      testFiles: ["**/*.spec.mjs"],
    });

    // sample.spec.mjs (from beforeEach) plus the two colliding files: all
    // three must be bundled, and the two that used to flatten to the same
    // name (`a_b.spec.mjs` vs `a/b.spec.mjs`) must stay distinct.
    const values = Object.values(manifest);
    expect(values).toHaveLength(3);
    expect(new Set(values).size).toBe(3);
    const flattened = values.filter(value => /\/a_b\.spec-[0-9a-f]{8}\.js$/.test(value));
    expect(flattened).toHaveLength(2);
    const artifacts = (await readdir(join(outDir, "content", "tests")))
      .filter(name => name.endsWith(".js"));
    expect(artifacts).toHaveLength(3);
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
