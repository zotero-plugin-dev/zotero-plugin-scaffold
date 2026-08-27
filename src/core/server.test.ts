import { describe, expect, it } from "vitest";
import { resolveDebugArgs } from "./server.js";

describe("resolveDebugArgs", () => {
  it("always appends -ZoteroDebugText to capture debug output", () => {
    expect(resolveDebugArgs([], false)).toEqual(["-ZoteroDebugText"]);
  });

  it("appends -ZoteroDebug only when debugOutputWindow is enabled", () => {
    expect(resolveDebugArgs([], true))
      .toEqual(["-ZoteroDebug", "-ZoteroDebugText"]);
  });

  it("keeps user startArgs untouched", () => {
    expect(resolveDebugArgs(["--foo"], false))
      .toEqual(["--foo", "-ZoteroDebugText"]);
  });

  it("does not duplicate manually written debug args", () => {
    expect(resolveDebugArgs(["-ZoteroDebugText"], true))
      .toEqual(["-ZoteroDebugText", "-ZoteroDebug"]);
    expect(resolveDebugArgs(["-ZoteroDebug", "-ZoteroDebugText"], true))
      .toEqual(["-ZoteroDebug", "-ZoteroDebugText"]);
  });
});
