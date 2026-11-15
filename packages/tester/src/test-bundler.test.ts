import type { Metafile } from "esbuild";
import type { TestRuntimeOptions } from "./types.js";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateHtml, serializeTestOptions } from "./test-bundler-template/index.js";
import { createTestApiPlugin, findImpactedTests, resolveRuntimeEntry } from "./test-bundler.js";
import { VITEST_EXPECT_MARKER, VITEST_SPY_MARKER } from "./test-markers.js";

describe("findImpactedTests", () => {
  const mockMetafileOutputs = {
    outputs: {
      ".scaffold/test/resource/content/units/test1.spec.js": {
        entryPoint: "test/test1.spec.ts",
        inputs: {
          "test/test1.spec.ts": {},
          "src/moduleA.ts": {},
          "src/moduleB.ts": {},
        },
      },
      ".scaffold/test/resource/content/units/test2.spec.js": {
        entryPoint: "test/test2.spec.ts",
        inputs: {
          "test/test2.spec.ts": {},
          "src/moduleC.ts": {},
        },
      },
      ".scaffold/test/resource/content/units/test3.spec.js": {
        entryPoint: "test/test3.spec.ts",
        inputs: {
          "test/test3.spec.ts": {},
          "src/moduleC.ts": {},
        },
      },
    },
  } as unknown as Metafile;

  it("returns affected test file when a test file itself is changed", () => {
    const result = findImpactedTests("test/test1.spec.ts", mockMetafileOutputs);
    expect(result).toEqual(["units/test1.spec.js"]);
  });

  it("returns affected test files when a source file is changed", () => {
    const result = findImpactedTests("src/moduleA.ts", mockMetafileOutputs);
    expect(result).toEqual(["units/test1.spec.js"]);
  });

  it("returns multiple affected test files when multiple tests depend on the changed file", () => {
    const result = findImpactedTests("src/moduleC.ts", mockMetafileOutputs);
    expect(result).toEqual(["units/test2.spec.js", "units/test3.spec.js"]);
  });

  it("returns an empty array if no test file is affected", () => {
    const result = findImpactedTests("src/unrelated.ts", mockMetafileOutputs);
    expect(result).toEqual([]);
  });

  it("returns an empty array without a metafile", () => {
    expect(findImpactedTests("src/moduleA.ts", undefined)).toEqual([]);
  });
});

/**
 * Acceptance tests of the RFC "tester 包测试运行时重构" (§8): the test bundles
 * must not contain any test library code, and the test page must only load the
 * prebuilt runtime plus the units.
 */
describe("test bundle purity", () => {
  let dir: string;
  let entry: string;

  const SAMPLE_TEST = `import { describe, expect, it, zo } from "zotero-plugin-scaffold/test";

describe("sample", () => {
  it("adds", () => {
    expect(1 + 1).toBe(2);
    expect({ a: 1 }).toEqual({ a: 1 });
  });

  it("spies", () => {
    // A bundle is free to use the zo namespace: its members are read from the
    // runtime, so the sample exercises exactly that path as well.
    const mock = zo.fn();
    mock();
    expect(mock).toHaveBeenCalled();
    expect(zo.spyOn({ m: () => 1 }, "m").mock).toBeDefined();
  });
});
`;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "scaffold-test-bundler-"));
    await mkdir(join(dir, "test"), { recursive: true });
    entry = join(dir, "test", "sample.spec.ts");
    await writeFile(entry, SAMPLE_TEST, "utf8");
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("does not inline mocha or chai into the test bundle", async () => {
    const result = await build({
      entryPoints: [entry],
      outdir: join(dir, "units"),
      bundle: true,
      platform: "browser",
      target: "firefox115",
      metafile: true,
      write: false,
      absWorkingDir: dir,
      plugins: [
        createTestApiPlugin(),
      ],
    });

    const inputs = Object.keys(result.metafile?.inputs ?? {});
    // The only non-test input is the shim of the tester package itself.
    expect(inputs.some(path => /(?:^|[\\/])node_modules[\\/]/.test(path))).toBe(false);
    expect(inputs.some(path => /(?:^|[\\/])(?:mocha|chai)(?:[\\/]|$)/.test(path))).toBe(false);

    const text = result.outputFiles.map(file => file.text).join("\n");
    expect(text).toContain("describe");
    // Markers of the libraries themselves, none of which may survive.
    expect(text).not.toContain("Mocha");
    expect(text).not.toContain("AssertionError");
    expect(text).not.toContain("deep-eql");
    // Nor `@vitest/expect`, see `VITEST_EXPECT_MARKER`.
    expect(text).not.toContain(VITEST_EXPECT_MARKER);
    // Nor `@vitest/spy`, see `VITEST_SPY_MARKER`.
    expect(text).not.toContain(VITEST_SPY_MARKER);
    // A test bundle is user code plus the shim reads, far below the size of
    // the libraries themselves (the runtime is ~700KB, see the test below).
    expect(text.length).toBeLessThan(10_000);
  });

  it("bundles the test runtime together with the libraries", async () => {
    const result = await build({
      entryPoints: [
        resolveRuntimeEntry(),
      ],
      bundle: true,
      format: "iife",
      platform: "browser",
      target: "firefox115",
      write: false,
      logLevel: "silent",
    });

    const text = result.outputFiles.map(file => file.text).join("\n");
    // The runtime is the one place that does contain the libraries...
    expect(text).toContain("Mocha");
    // ...including `@vitest/expect`, see `VITEST_EXPECT_MARKER`.
    expect(text).toContain(VITEST_EXPECT_MARKER);
    // ...and `@vitest/spy`, see `VITEST_SPY_MARKER`.
    expect(text).toContain(VITEST_SPY_MARKER);
    expect(text.length).toBeGreaterThan(100_000);
    // ...bundled as a self-executing script, not as an ES module.
    expect(text).not.toMatch(/^import\s/m);
    expect(text).not.toMatch(/^export\s/m);
  });
});

describe("generateHtml", () => {
  const options: TestRuntimeOptions = {
    timeout: 10_000,
    port: 34_567,
    abortOnFail: false,
    exitOnFinish: true,
  };

  it("loads the prebuilt runtime and the units only", () => {
    const html = generateHtml(options, ["units/a.spec.js", "units/b.spec.js"]);
    const sources = [
      ...html.matchAll(/<script\b[^>]+\bsrc="([^"]+)"/g),
    ].map(match => match[1]);

    expect(sources).toEqual([
      "chrome://zotero/content/include.js",
      "test-runtime.js",
      "units/a.spec.js",
      "units/b.spec.js",
    ]);
    expect(html).not.toContain("mocha.js");
    expect(html).not.toContain("chai.js");
  });

  it("injects the runtime options and keeps mocha.run() last", () => {
    const html = generateHtml(options, ["units/a.spec.js"]);

    expect(html).toContain("window.__TEST_OPTIONS__ = {");
    expect(html).toContain("\"port\":34567");
    expect(html.trimEnd()).toContain("mocha.run();");
    // The options are injected before the runtime is loaded, otherwise the
    // runtime would fall back to its defaults.
    expect(html.indexOf("__TEST_OPTIONS__ =")).toBeLessThan(html.indexOf("test-runtime.js"));
  });

  it("escapes characters that would break the XHTML parse", () => {
    expect(serializeTestOptions(options)).not.toMatch(/[<&]/);

    // Defensive check: a future string option must not be able to break the page.
    const injected = serializeTestOptions({ ...options, future: "<&>" } as unknown as TestRuntimeOptions);
    expect(injected).not.toContain("<");
    expect(injected).toContain("\\u003c");
    expect(injected).toContain("\\u0026");
  });
});
