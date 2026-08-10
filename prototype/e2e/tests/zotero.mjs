import { describe, expect, it, vi } from "vitest";

describe("real Zotero environment", () => {
  it("Zotero global is available", () => {
    // Zotero is a function (namespace constructor) with properties attached
    expect(typeof Zotero).toBe("function");
    expect(Zotero.Items).toBeTruthy();
  });

  it("Zotero.Items.get(1) returns false for a missing item", () => {
    expect(Zotero.Items.get(1)).toBe(false);
  });

  it("vi.fn works inside Zotero", () => {
    const fn = vi.fn((x) => x * 2);
    expect(fn(21)).toBe(42);
    expect(fn).toHaveBeenCalledWith(21);
  });

  it("chai-style assertions work", () => {
    expect({ a: 1 }).to.deep.equal({ a: 1 });
  });
});
