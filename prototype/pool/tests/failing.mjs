import { expect, it } from "vitest";

it("fails on purpose (expect exit code 1)", () => {
  expect(2 + 2).toBe(5);
});
