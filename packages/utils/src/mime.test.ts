import { describe, expect, it } from "vitest";
import { getMimeTypeByFileName } from "./mime.js";

describe("mime", () => {
  describe("getMimeTypeByFileName", () => {
    it("should return application/json for json files", () => {
      expect(getMimeTypeByFileName("test.json")).toEqual("application/json");
    });

    it("should return application/x-xpinstall for xpi files", () => {
      expect(getMimeTypeByFileName("test.xpi")).toEqual("application/x-xpinstall");
    });

    it("should return undefined for unknown file types", () => {
      expect(getMimeTypeByFileName("test.unknown")).toBeUndefined();
    });
  });
});
