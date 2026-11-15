import { beforeAll, describe, expect, it } from "vitest";
import { TEST_API_EXPORTS, TEST_API_MODULES } from "./apis.js";

/**
 * The facade (`api/`) and the shim (`shim/`) are hand-written static files
 * while the registry (`apis.ts`) is the single source of truth. This test keeps
 * the three of them, plus the bundler redirect list, from drifting apart.
 */
describe("test API registry", () => {
  let shimExports: string[] = [];
  let facadeExports: string[] = [];

  beforeAll(async () => {
    // The shim guards on the Zotero host object and reads the globals installed
    // by the test runtime, so both have to be stubbed before importing it.
    const g = globalThis as unknown as Record<string, unknown>;
    g.Zotero ??= {};
    g.chai ??= {
      assert: () => {},
      config: {},
      expect: () => {},
      use: () => {},
    };
    g.expect ??= () => {};
    g.assert ??= {};

    const shim = await import("./shim/index.js");
    const facade = await import("./api/index.js");
    shimExports = Object.keys(shim).sort();
    facadeExports = Object.keys(facade).sort();
  });

  it("is a non-empty, unique list of modules", () => {
    expect(TEST_API_MODULES.length).toBeGreaterThan(0);
    const ids = TEST_API_MODULES.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("agrees with the shim exports", () => {
    expect(shimExports).toEqual([...TEST_API_EXPORTS].sort());
  });

  it("agrees with the facade exports", () => {
    expect(facadeExports).toEqual(shimExports);
  });

  it("exposes every registry module through the facade", () => {
    const facade = new Set(facadeExports);
    for (const api of TEST_API_MODULES) {
      for (const name of api.exports)
        expect(facade.has(name), `${api.id} should export ${name}`).toBe(true);
    }
  });

  it("redirects every registry id and the public entry points", async () => {
    const { isTestApiSpecifier } = await import("./test-bundler.js");

    const redirected = [
      ...TEST_API_MODULES.map(m => m.id),
      // sub-paths of a registry id are redirected as well
      ...TEST_API_MODULES.map(m => `${m.id}/sub-path`),
      // the public entry points users import
      "zotero-plugin-scaffold/test",
      "@zotero-plugin/tester/api",
    ];
    for (const id of redirected)
      expect(isTestApiSpecifier(id), `${id} should be redirected`).toBe(true);

    for (const id of [
      "fs-extra",
      "zotero-plugin-scaffold",
      "@zotero-plugin/tester",
      "mochawesome",
    ])
      expect(isTestApiSpecifier(id), `${id} should be left alone`).toBe(false);
  });
});
