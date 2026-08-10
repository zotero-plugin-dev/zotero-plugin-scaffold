import { describe, expect, it } from "vitest";
import { zoteroPool } from "./index.js";

describe("zoteroPool", () => {
  it("creates the pool once", () => {
    expect(() => zoteroPool()).not.toThrow();
  });

  it("rejects a second pool (multiple projects would race on Zotero resources)", () => {
    expect(() => zoteroPool()).toThrow(/Only one project may use zoteroPool/);
  });
});
