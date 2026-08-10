import { describe, expect, it } from "vitest";
import { zoteroPool } from "./index.js";
import { resolveOptions } from "./options.js";
import { findResourceConflict } from "./pool-worker.js";

describe("zoteroPool", () => {
  it("may be configured by multiple projects (run individually via --project)", () => {
    expect(() => zoteroPool()).not.toThrow();
    expect(() => zoteroPool({ profileDir: ".scaffold/p2-profile" })).not.toThrow();
  });
});

describe("resolveOptions", () => {
  const bin = { zoteroBin: "zotero" };

  it("derives per-project resource dirs from the project name", () => {
    const a = resolveOptions(bin, "api");
    const b = resolveOptions(bin, "ui");
    expect(a.profileDir).toBe(".scaffold/tester-profile-api");
    expect(a.dataDir).toBe(".scaffold/tester-data-api");
    expect(b.profileDir).not.toBe(a.profileDir);
  });

  it("keeps the plain defaults without a project name", () => {
    const o = resolveOptions(bin);
    expect(o.profileDir).toBe(".scaffold/tester-profile");
    expect(o.dataDir).toBe(".scaffold/tester-data");
  });

  it("explicit dirs override the derivation", () => {
    const o = resolveOptions({ ...bin, profileDir: "custom-profile", dataDir: "custom-data" }, "api");
    expect(o.profileDir).toBe("custom-profile");
    expect(o.dataDir).toBe("custom-data");
  });
});

describe("findResourceConflict", () => {
  const shared = { profileDir: "D:/p", dataDir: "D:/d" };
  const other = { profileDir: "D:/p2", dataDir: "D:/d2" };

  it("finds a worker sharing the same profile and data dirs", () => {
    const active = new Set([{ resources: shared }]);
    expect(findResourceConflict(active, shared)).toEqual(shared);
  });

  it("allows workers with distinct resource dirs to run in parallel", () => {
    const active = new Set([{ resources: shared }]);
    expect(findResourceConflict(active, other)).toBeUndefined();
  });

  it("returns undefined when no worker is active", () => {
    expect(findResourceConflict(new Set(), shared)).toBeUndefined();
  });
});
