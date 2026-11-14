import type { Metafile } from "esbuild";
import { describe, expect, it } from "vitest";
import { findImpactedTests } from "./test-bundler.js";

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
});
