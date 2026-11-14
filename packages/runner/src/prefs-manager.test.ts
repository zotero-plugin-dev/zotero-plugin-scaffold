import { beforeEach, describe, expect, it } from "vitest";
import { PrefsManager } from "./prefs-manager.js";

describe("prefs-manager", () => {
  let prefsManager: PrefsManager;

  beforeEach(() => {
    prefsManager = new PrefsManager("pref");
  });

  describe("parse", () => {
    it("should correctly parse a string value", () => {
      const result = prefsManager.parse(`pref("test.string", "hello");`);
      expect(result).toEqual({ "test.string": "hello" });
    });

    it("should correctly parse a template literal value", () => {
      const result = prefsManager.parse(`pref("test.string", \`111\`);`);
      expect(result).toEqual({ "test.string": "111" });
    });

    it("should correctly parse a number value", () => {
      const result = prefsManager.parse(`pref("test.number", 42);`);
      expect(result).toEqual({ "test.number": 42 });
    });

    it("should correctly parse a boolean value (true)", () => {
      const result = prefsManager.parse(`pref("test.boolean.true", true);`);
      expect(result).toEqual({ "test.boolean.true": true });
    });

    it("should correctly parse a boolean value (false)", () => {
      const result = prefsManager.parse(`pref("test.boolean.false", false);`);
      expect(result).toEqual({ "test.boolean.false": false });
    });

    it.skip("should correctly parse a null value", () => {
      const result = prefsManager.parse(`pref("test.null", null);`);
      expect(result).toEqual({ "test.null": "null" });
    });

    it("should correctly parse -1", () => {
      const result = prefsManager.parse(`pref("test.unary-expression", -1);`);
      expect(result).toEqual({ "test.unary-expression": -1 });
    });

    it("should correctly parse a stringified number", () => {
      const result = prefsManager.parse(`pref("test.stringified.number", "123");`);
      expect(result).toEqual({ "test.stringified.number": "123" });
    });

    it("should correctly parse a stringified boolean (true)", () => {
      const result = prefsManager.parse(`pref("test.stringified.true", "true");`);
      expect(result).toEqual({ "test.stringified.true": "true" });
    });

    it("should correctly parse a stringified boolean (false)", () => {
      const result = prefsManager.parse(`pref("test.stringified.false", "false");`);
      expect(result).toEqual({ "test.stringified.false": "false" });
    });

    it("should correctly parse prefs.js without `;`", () => {
      const result = prefsManager.parse(`pref("test.withoutsimi", "false")`);
      expect(result).toEqual({ "test.withoutsimi": "false" });
    });

    it("should correctly parse prefs.js with space", () => {
      const result = prefsManager.parse(`pref(  " test.withspace " ,  "abc def");`);
      expect(result).toEqual({ "test.withspace": "abc def" });
    });

    it("should correctly parse prefs.js with break line", () => {
      const result = prefsManager.parse(`pref(
        "test.withspace",
        "abc"
        );`);
      expect(result).toEqual({ "test.withspace": "abc" });
    });

    it("should correctly parse prefs.js with break line and trim comma", () => {
      const result = prefsManager.parse(`pref(
        "test.withspace",
        "abc,",
        );`);
      expect(result).toEqual({ "test.withspace": "abc," });
    });

    it("should correctly parse a prefs.js file", async () => {
      const fakePrefsContent = `
pref("test.string", "hello");
pref("test.number", 42);
pref("test.boolean.true", true);
`;
      const result = prefsManager.parse(fakePrefsContent);
      expect(result).toEqual({
        "test.string": "hello",
        "test.number": 42,
        "test.boolean.true": true,
      });
    });
  });

  describe("setPref", () => {
    it("should correctly set a value", () => {
      prefsManager.setPref("test", "hello");
      expect(typeof prefsManager.getPref("test")).toBe("string");
      expect(prefsManager.getPref("test")).toBe("hello");
    });

    it("should correctly set a null value and remove the preference", () => {
      prefsManager.setPref("test.null", "value");
      prefsManager.setPref("test.null", null);
      expect(prefsManager.getPrefs()).toEqual({});
      expect(prefsManager.getPref("test.null")).toBeUndefined();
    });
  });

  describe("setPrefs", () => {
    it("should correctly set multiple preferences", () => {
      prefsManager.setPrefs({
        "test.string": "hello",
        "test.number": 42,
        "test.boolean": true,
      });

      expect(prefsManager.getPref("test.string")).toBe("hello");
      expect(prefsManager.getPref("test.number")).toBe(42);
      expect(prefsManager.getPref("test.boolean")).toBe(true);
    });
  });

  describe("getPrefs", () => {
    it("should return all preferences", () => {
      prefsManager.setPrefs({
        "test.string": "hello",
        "test.number": 42,
      });

      const prefs = prefsManager.getPrefs();
      expect(prefs).toEqual({
        "test.string": "hello",
        "test.number": 42,
      });
    });
  });

  describe("clearPrefs", () => {
    it("should clear all preferences", () => {
      prefsManager.setPrefs({
        "test.string": "hello",
        "test.number": 42,
      });

      prefsManager.clearPrefs();
      expect(prefsManager.getPrefs()).toEqual({});
    });
  });

  describe("getPrefsWithPrefix", () => {
    it("should return preferences with the specified prefix", () => {
      prefsManager.setPrefs({
        "other.key": "value3",
      });

      expect(prefsManager.getPrefsWithPrefix("prefix")).toEqual({
        "prefix.other.key": "value3",
      });
    });

    it("should skip preferences that already contain a prefix", () => {
      prefsManager.setPrefs({
        "prefix.key1": "value1",
      });

      expect(prefsManager.getPrefsWithPrefix("prefix")).toEqual({
        "prefix.key1": "value1",
      });
    });
  });

  describe("getPrefsWithoutPrefix", () => {
    it("should return preferences without the specified prefix", () => {
      prefsManager.setPrefs({
        "prefix.key1": "value1",
        "key2": "value2",
      });

      expect(prefsManager.getPrefsWithoutPrefix("prefix")).toEqual({
        key1: "value1",
        key2: "value2",
      });
    });
  });

  describe("render", () => {
    it("should correctly render a prefs.js", () => {
      prefsManager.setPrefs({
        "test.string": "hello",
        "test.quote": "{\"key\": \"value\"}",
        "test.singleQuote": "{key: value}",
        "test.path": "C:\\path\\to\\file",
        "test.number": 42,
        "test.-1": -1,
        "test.boolean": true,
      });

      const result = [
        "pref(\"test.string\", \"hello\");",
        "pref(\"test.quote\", '{\"key\": \"value\"}');",
        "pref(\"test.singleQuote\", \"{key: value}\");",
        "pref(\"test.path\", \"C:\\\\path\\\\to\\\\file\");",
        "pref(\"test.number\", 42);",
        "pref(\"test.-1\", -1);",
        "pref(\"test.boolean\", true);",
        "",
      ].join("\n");

      expect(prefsManager.render()).toBe(result);
    });
  });
});

describe("prefs-manager (user_pref)", () => {
  let prefsManager: PrefsManager;

  beforeEach(() => {
    prefsManager = new PrefsManager("user_pref");
  });

  it("should parse user_pref", () => {
    const result = prefsManager.parse(`user_pref("test.string", "hello");`);
    expect(result).toEqual({ "test.string": "hello" });
  });

  it("should correctly render user_pref", () => {
    prefsManager.setPrefs({
      "test.string": "hello",
      "test.number": 42,
    });

    const result = [
      "user_pref(\"test.string\", \"hello\");",
      "user_pref(\"test.number\", 42);",
      "",
    ].join("\n");

    expect(prefsManager.render()).toBe(result);
  });
});
