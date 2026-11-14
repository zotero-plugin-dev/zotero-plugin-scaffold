import type { MetaData } from "./test-bundler.js";
import { describe, expect, it } from "vitest";
import { findImpactedTests } from "./test-bundler.js";

describe("findImpactedTests", () => {
  const mockBuildMetadata: MetaData = [
    {
      fileName: "test1.spec.js",
      name: "",
      moduleIds: ["src/moduleA.ts", "src/moduleB.ts", "test/test1.spec.ts"],
    },
    {
      fileName: "test2.spec.js",
      name: "",
      moduleIds: ["test/test2.spec.ts", "src/moduleC.ts"],
    },
    {
      fileName: "test3.spec.js",
      name: "",
      moduleIds: ["test/test3.spec.ts", "src/moduleC.ts"],
    },
  ];

  it("returns affected test file when a test file itself is changed", () => {
    const result = findImpactedTests("test/test1.spec.ts", mockBuildMetadata);
    expect(result).toEqual(["test1.spec.js"]);
  });

  it("returns affected test files when a source file is changed", () => {
    const result = findImpactedTests("src/moduleA.ts", mockBuildMetadata);
    expect(result).toEqual(["test1.spec.js"]);
  });

  it("returns multiple affected test files when multiple tests depend on the changed file", () => {
    const result = findImpactedTests("src/moduleC.ts", mockBuildMetadata);
    expect(result).toEqual(["test2.spec.js", "test3.spec.js"]);
  });

  it("returns an empty array if no test file is affected", () => {
    const result = findImpactedTests("src/unrelated.ts", mockBuildMetadata);
    expect(result).toEqual([]);
  });
});
