import { describe, expect, it, vi } from "vitest";

describe("zotero page (simulated)", () => {
  it("1 + 1 = 2", () => {
    expect(1 + 1).toBe(2);
  });

  it("chai-style assertions work", () => {
    expect({ a: 1 }).to.deep.equal({ a: 1 });
  });

  it("vi.fn works", () => {
    const fn = vi.fn((x) => x * 2);
    expect(fn(21)).toBe(42);
    expect(fn).toHaveBeenCalledWith(21);
  });

  it("vi.useFakeTimers works", () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    setTimeout(cb, 1000);
    vi.advanceTimersByTime(1000);
    expect(cb).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
