import { describe, expect, it } from "zotero-plugin-scaffold/test";

describe("playground plugin", () => {
  it("is registered on the Zotero global", () => {
    expect(Zotero.ScaffoldPlayground).toBeDefined();
    expect(Zotero.ScaffoldPlayground.initialized).toBe(true);
  });

  it("has the prefixed preferences of prefs.js", () => {
    expect(Zotero.Prefs.get("extensions.scaffold-playground.booleanPref", true)).toBe(true);
  });
});
