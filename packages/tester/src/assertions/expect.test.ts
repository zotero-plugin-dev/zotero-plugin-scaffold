import { describe, expect, it } from "vitest";
import { assert, expect as jestExpect } from "./expect.js";

interface AssertionLikeError {
  message: string;
  actual?: unknown;
  expected?: unknown;
  showDiff?: boolean;
}

describe("jest-style expect", () => {
  it("supports jest matchers", () => {
    jestExpect(1 + 1).toBe(2);
    jestExpect({ a: 1 }).toEqual({ a: 1 });
    jestExpect([1, 2]).toContain(2);
    jestExpect({ a: 1, b: 2 }).toEqual(jestExpect.objectContaining({ a: 1 }));
    jestExpect(() => {
      throw new TypeError("boom");
    }).toThrow(TypeError);
  });

  it("keeps chai assertions", () => {
    jestExpect(1).to.equal(1);
    assert.isTrue(true);
  });

  it("reports jest-style messages", () => {
    let error: AssertionLikeError | undefined;

    try {
      jestExpect({ a: 1 }).toEqual({ a: 2 });
    }
    catch (e) {
      error = e as AssertionLikeError;
    }

    expect(error?.message).toBe("expected { a: 1 } to deeply equal { a: 2 }");
    expect(error?.actual).toEqual({ a: 1 });
    expect(error?.expected).toEqual({ a: 2 });
    expect(error?.showDiff).toBe(true);
  });

  it("supports expect.extend", () => {
    jestExpect.extend({
      toBeFive(received: unknown) {
        return {
          pass: received === 5,
          message: () => `expected ${received} to be 5`,
        };
      },
    });

    (jestExpect(5) as unknown as { toBeFive: () => void }).toBeFive();
  });

  it("throws for the features which need vitest's runner", () => {
    expect(() => jestExpect.soft(1)).toThrow(/not supported/);
    expect(() => jestExpect.poll(() => 1)).toThrow(/not supported/);
  });
});
