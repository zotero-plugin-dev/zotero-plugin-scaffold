import { describe, expect, it } from "vitest";
import { toPosix } from "./path.js";

describe("toPosix", () => {
  it("normalizes the separators of every platform", () => {
    expect(toPosix(String.raw`test\unit\a.spec.ts`)).toBe("test/unit/a.spec.ts");
    expect(toPosix("test/unit/a.spec.ts")).toBe("test/unit/a.spec.ts");
  });
});
