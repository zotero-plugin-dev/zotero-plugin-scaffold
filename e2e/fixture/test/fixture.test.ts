import { describe, expect, it } from "zotero-plugin-scaffold/test";

describe("fixture plugin", () => {
  it("is registered on the Zotero global", () => {
    expect(Zotero.ScaffoldFixture).toBeDefined();
    expect(Zotero.ScaffoldFixture.initialized).toBe(true);
  });

  it("was started by Zotero, with the version of manifest.json", () => {
    expect(Zotero.ScaffoldFixture.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(Zotero.ScaffoldFixture.rootURI).toContain("dist/addon/");
  });

  it("has its bundled script, loaded through the chrome URL", () => {
    expect(Zotero.ScaffoldFixture.prefsPrefix).toBe("extensions.scaffold-fixture");
  });

  it("has the prefixed preferences of prefs.js", () => {
    expect(Zotero.Prefs.get("extensions.scaffold-fixture.booleanPref", true)).toBe(true);
    expect(Zotero.Prefs.get("extensions.scaffold-fixture.numberPref", true)).toBe(123);
    expect(Zotero.Prefs.get("extensions.scaffold-fixture.stringPref", true)).toBe("0.0.0");
  });

  it("has the preferences the config added to the test profile", () => {
    expect(Zotero.Prefs.get("extensions.scaffold-fixture.e2ePref", true)).toBe("from-config");
  });
});
