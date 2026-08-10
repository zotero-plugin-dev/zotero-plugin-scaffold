import type { Context } from "../../types/index.js";
import { describe, expect, it } from "vitest";
import { generateVitestConfig } from "./cli-config.js";

function makeContext(overrides: Record<string, any> = {}): Context {
  return {
    id: "my-plugin@example.com",
    dist: "dist",
    test: {
      entries: "test",
      prefs: {},
      vitest: { timeout: 10000 },
      abortOnFail: false,
      headless: false,
      startupDelay: 1000,
      waitForPlugin: "() => true",
      watch: true,
      hooks: {},
      ...overrides,
    },
  } as any;
}

describe("generateVitestConfig", () => {
  it("maps entries to include globs and wires the zotero pool", () => {
    const config = generateVitestConfig(makeContext());
    expect(config).toContain("include: [\"test/**/*.{spec,test}.?(c|m)[jt]s?(x)\"]");
    expect(config).toContain("import { zoteroPool } from \"zotero-plugin-scaffold/vitest\"");
    expect(config).toContain("isolate: false");
    expect(config).toContain("fileParallelism: false");
    expect(config).toContain("pluginId: \"my-plugin@example.com\"");
    expect(config).toContain("pluginDir: \"dist/addon\"");
  });

  it("maps abortOnFail to bail and the timeout", () => {
    const config = generateVitestConfig(makeContext({ abortOnFail: true, vitest: { timeout: 30000 } }));
    expect(config).toContain("bail: 1");
    expect(config).toContain("testTimeout: 30000");
    expect(config).toContain("hookTimeout: 30000");
  });

  it("maps multiple entries and extra prefs", () => {
    const config = generateVitestConfig(makeContext({
      entries: ["test", "test/integration"],
      prefs: { "extensions.zotero.debug.log": 5 },
    }));
    expect(config).toContain("\"test/**/*.{spec,test}.?(c|m)[jt]s?(x)\"");
    expect(config).toContain("\"test/integration/**/*.{spec,test}.?(c|m)[jt]s?(x)\"");
    expect(config).toContain("\"extensions.zotero.debug.log\":5");
  });
});
