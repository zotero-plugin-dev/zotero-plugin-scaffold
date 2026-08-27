import { describe, expect, it } from "vitest";
import { resolveDebugArgs } from "./server.js";

describe("resolveDebugArgs", () => {
  it.each([
    { debugOutput: false, expected: [] },
    { debugOutput: "window", expected: ["-ZoteroDebug"] },
    { debugOutput: "console", expected: ["-ZoteroDebugText"] },
  ] as const)("maps debugOutput $debugOutput to $expected", ({ debugOutput, expected }) => {
    expect(resolveDebugArgs([], debugOutput)).toEqual(expected);
  });

  it("keeps user startArgs untouched", () => {
    expect(resolveDebugArgs(["--foo"], "window"))
      .toEqual(["--foo", "-ZoteroDebug"]);
  });

  it("does not duplicate manually written debug args", () => {
    expect(resolveDebugArgs(["-ZoteroDebug"], "window"))
      .toEqual(["-ZoteroDebug"]);
    expect(resolveDebugArgs(["-ZoteroDebugText"], "console"))
      .toEqual(["-ZoteroDebugText"]);
  });

  it("does not append debug args when debugOutput is false", () => {
    expect(resolveDebugArgs(["-ZoteroDebug"], false))
      .toEqual(["-ZoteroDebug"]);
  });
});
