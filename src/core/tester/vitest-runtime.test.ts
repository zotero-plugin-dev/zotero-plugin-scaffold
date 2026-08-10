import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateVitestSetup } from "./test-bundler-template/index.js";
import { bundleVitestRuntime, createVitestAliasPlugin } from "./test-bundler.js";

/**
 * End-to-end test of the Vitest-in-Zotero prototype.
 *
 * Simulates the test page (`index.xhtml`) inside a real Zotero instance:
 * bundles the Vitest runtime and a sample test file exactly like `TestBundler`
 * does, generates `setup.js` from the real template, then loads it in a plain
 * Node child process with a fake `Zotero` global and asserts the reported
 * events.
 *
 * The page is loaded in a child process (not directly in this test) because
 * Vitest's own module runner intercepts dynamic `import()` and would try to
 * resolve the bundled test files through Vite, which does not happen inside
 * real Zotero.
 */
describe("vitest runtime inside Zotero", () => {
  let dir: string;
  let events: Array<{ type: string; data: any }>;
  let quitCode: number | undefined;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "vitest-zotero-"));

    // 1. Bundle the shared runtime chunk (same code path as TestBundler)
    await bundleVitestRuntime(join(dir, "vitest-runtime.js"));

    // 2. Write a sample test file that imports from "vitest"
    const testSource = `
import { describe, it, expect, vi } from "vitest";
import { assert } from "chai";

describe("demo suite", () => {
  it("passes", () => {
    expect(1 + 1).toBe(2);
  });

  it("supports vi.fn and chai-style assertions", () => {
    const fn = vi.fn(() => 42);
    expect(fn()).toBe(42);
    expect(fn).toHaveBeenCalledOnce();
    expect({ a: [1, 2] }).to.deep.equal({ a: [1, 2] });
    assert.isNotEmpty([1]);
  });

  it("fails with a diff", () => {
    expect({ a: 1 }).toEqual({ a: 2 });
  });

  it.skip("skipped", () => {});
});
`;
    await mkdir(join(dir, "test-src"));
    await writeFile(join(dir, "test-src", "sample.test.js"), testSource);

    // 3. Bundle the test file with the vitest alias plugin, like TestBundler
    await build({
      entryPoints: [join(dir, "test-src", "sample.test.js")],
      outdir: join(dir, "units"),
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "firefox115",
      plugins: [createVitestAliasPlugin()],
    });

    // 4. Generate setup.js from the real template
    const setup = generateVitestSetup({
      port: 9199,
      timeout: 5000,
      abortOnFail: false,
      exitOnFinish: true,
      testFiles: ["units/sample.test.js"],
    });
    await writeFile(join(dir, "setup.js"), setup);

    // 5. Simulate the Zotero page in a child process and collect the events
    const helper = `
import { pathToFileURL } from "node:url";
globalThis.window = globalThis;
globalThis.document = { querySelector: () => ({ innerText: "" }) };
const events = [];
let quitCode;
let resolveQuit;
const quitPromise = new Promise((r) => { resolveQuit = r; });
globalThis.Zotero = {
  HTTP: {
    request: async (_method, _url, { body }) => {
      events.push(JSON.parse(body));
      return { status: 200, responseText: "{}" };
    },
  },
  Utilities: {
    Internal: {
      quit: (code) => { quitCode = code; resolveQuit(); },
    },
  },
};
await import(pathToFileURL(process.argv[2] + "/setup.js").href);
await quitPromise;
console.log(JSON.stringify({ events, quitCode }));
`;
    await writeFile(join(dir, "helper.mjs"), helper);

    const out = execFileSync(process.execPath, [join(dir, "helper.mjs"), dir], {
      encoding: "utf8",
    });
    const result = JSON.parse(out.trim().split("\n").at(-1)!);
    events = result.events;
    quitCode = result.quitCode;
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reports the expected event types", () => {
    const types = new Set(events.map(e => e.type));
    expect(types).toEqual(new Set(["start", "suite", "suite end", "pass", "fail", "pending", "end"]));
  });

  it("reports the suite title", () => {
    const suites = events.filter(e => e.type === "suite");
    expect(suites.map(s => s.data.title)).toEqual(["demo suite"]);
  });

  it("reports passing tests", () => {
    const passes = events.filter(e => e.type === "pass");
    expect(passes.map(p => p.data.title)).toEqual([
      "passes",
      "supports vi.fn and chai-style assertions",
    ]);
    expect(passes[0].data.fulltest).toBe("demo suite passes");
    expect(passes[0].data.duration).toBeGreaterThanOrEqual(0);
  });

  it("reports failing tests with actual/expected for the diff", () => {
    const fails = events.filter(e => e.type === "fail");
    expect(fails).toHaveLength(1);
    expect(fails[0].data.title).toBe("fails with a diff");
    expect(fails[0].data.error.message).toContain("expected");
    expect(fails[0].data.error.actual).toBeDefined();
    expect(fails[0].data.error.expected).toBeDefined();
  });

  it("reports skipped tests as pending", () => {
    const pendings = events.filter(e => e.type === "pending");
    expect(pendings.map(p => p.data.title)).toEqual(["skipped"]);
  });

  it("reports the final summary and exits Zotero with code 0", () => {
    const end = events.find(e => e.type === "end");
    expect(end?.data).toMatchObject({ passed: 2, failed: 1, aborted: false });
    expect(quitCode).toBe(0);
  });
});
