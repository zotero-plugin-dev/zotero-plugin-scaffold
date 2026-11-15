import type { Zo } from "./zo.js";
import * as spy from "@vitest/spy";
import { beforeAll, describe, expect, it } from "vitest";
import { TEST_API_EXPORTS, TEST_API_MODULES, TEST_API_NAMESPACES, testApiNamespaceMembers } from "./apis.js";

/**
 * The facade (`api/`) and the shim (`shim/`) are hand-written static files
 * while the registry (`apis.ts`) is the single source of truth. This test keeps
 * the three of them, plus the bundler redirect list, from drifting apart.
 *
 * A registry entry either contributes top-level members of the test API or
 * members of a namespace (`namespace: "zo"`, see `src/zo.ts`).
 */
describe("test API registry", () => {
  let shimExports: string[] = [];
  let facadeExports: string[] = [];
  let shimNamespaces: Record<string, Record<string, unknown>> = {};

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
    // The real libraries: the shim only reads the object, so stubbing it with
    // the library itself keeps this test about the export surface.
    g.__TEST_ZO__ ??= {
      fn: spy.fn,
      spyOn: spy.spyOn,
      isMockFunction: spy.isMockFunction,
      clearAllMocks: spy.clearAllMocks,
      resetAllMocks: spy.resetAllMocks,
      restoreAllMocks: spy.restoreAllMocks,
    } satisfies Zo;

    const shim = await import("./shim/index.js");
    const facade = await import("./api/index.js");
    shimExports = Object.keys(shim).sort();
    facadeExports = Object.keys(facade).sort();
    shimNamespaces = Object.fromEntries(
      TEST_API_NAMESPACES.map(name => [
        name,
        (shim as unknown as Record<string, Record<string, unknown>>)[name],
      ]),
    );
  });

  it("is a non-empty, unique list of modules", () => {
    expect(TEST_API_MODULES.length).toBeGreaterThan(0);
    const ids = TEST_API_MODULES.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("agrees with the shim exports", () => {
    // The top-level surface plus one export per namespace, and nothing else.
    expect(shimExports).toEqual([
      ...TEST_API_EXPORTS,
      ...TEST_API_NAMESPACES,
    ].sort());
  });

  it("agrees with the facade exports", () => {
    expect(facadeExports).toEqual(shimExports);
  });

  it("exposes every registry module through the facade", () => {
    const facade = new Set(facadeExports);
    for (const api of TEST_API_MODULES) {
      if (api.namespace) {
        expect(facade.has(api.namespace), `${api.id} should be reachable as ${api.namespace}`).toBe(true);
        continue;
      }
      for (const name of api.exports)
        expect(facade.has(name), `${api.id} should export ${name}`).toBe(true);
    }
  });

  it("agrees with the namespace members", () => {
    for (const [name, expected] of Object.entries(testApiNamespaceMembers())) {
      const actual = shimNamespaces[name];
      expect(actual, `${name} should be exported by the shim`).toBeDefined();
      expect(Object.keys(actual).sort(), `${name} members`).toEqual(expected);
    }
  });

  it("contributes every spy member through zo", () => {
    const zo = shimNamespaces.zo as unknown as Zo;

    expect(zo.fn).toBeTypeOf("function");
    expect(zo.spyOn).toBeTypeOf("function");
    // The namespace is a plain object of the library's functions, not the
    // library namespace itself: `createMockInstance` stays internal.
    expect(zo).not.toHaveProperty("createMockInstance");
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
