import { describe, expect, it } from "vitest";
import { compareVersions, parseMajorVersion } from "./zotero-version.js";

describe("zotero-version utilities", () => {
  describe("parseMajorVersion", () => {
    it("should parse beta version", () => {
      expect(parseMajorVersion("9.0-beta.21+1a89239a1")).toBe(9);
    });

    it("should parse release version", () => {
      expect(parseMajorVersion("9.0")).toBe(9);
    });

    it("should handle single digit version", () => {
      expect(parseMajorVersion("10.0")).toBe(10);
    });

    it("should throw on invalid format", () => {
      expect(() => parseMajorVersion("invalid")).toThrow("Invalid version format");
    });
  });

  describe("compareVersions", () => {
    it("should return -1 when v1 < v2", () => {
      expect(compareVersions("8.0", "9.0")).toBe(-1);
    });

    it("should return 0 when v1 === v2", () => {
      expect(compareVersions("9.0", "9.0")).toBe(0);
    });

    it("should return 1 when v1 > v2", () => {
      expect(compareVersions("9.0", "8.0")).toBe(1);
    });

    it("should handle beta versions", () => {
      expect(compareVersions("9.0-beta.20", "9.0-beta.21")).toBe(-1);
    });

    it("should handle mixed version formats", () => {
      expect(compareVersions("9.0", "9.0-beta.21")).toBe(-1);
    });

    it("should handle different lengths", () => {
      expect(compareVersions("9", "9.0.1")).toBe(-1);
    });
  });
});
