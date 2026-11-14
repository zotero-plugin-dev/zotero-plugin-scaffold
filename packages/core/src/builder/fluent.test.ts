import { logger } from "@zotero-plugin/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FluentManager,
  generateFluentDts,
  MessageManager,
  processHTMLFile,
} from "./fluent.js";

vi.mock("@zotero-plugin/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@zotero-plugin/utils")>();
  return {
    ...actual,
    logger: {
      debug: vi.fn(),
      warn: vi.fn(),
    },
  };
});

describe("fluent-manager", () => {
  let manager: FluentManager;

  beforeEach(() => {
    manager = new FluentManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("getMessages()", () => {
    it("should return all message IDs", () => {
      manager.parse(`
welcome = Welcome
about = About { welcome }
`);
      const messages = manager.getMessages();
      expect(messages).toEqual(["welcome", "about"]);
    });
  });

  describe("prefix()", () => {
    it("should prefix message IDs correctly", () => {
      manager.parse(`
welcome = Welcome
about = About { welcome }
test-prefixed = Test { welcome }
`);
      manager.prefixMessages("test");
      expect(manager.serialize()).toBe([
        "test-welcome = Welcome",
        "test-about = About { test-welcome }",
        "test-prefixed = Test { test-welcome }",
        "",
      ]
        .join("\n"));
    });
  });
});

describe("processHTMLFile", () => {
  const namespace = "myNamespace";
  const ignores = ["ignoredMessage"];
  const allMessages = new Set(["validMessage1", "validMessage2"]);
  const filePath = "path/to/file.html";

  it("should replace data-l10n-id with namespace-prefixed ID", () => {
    const inputContent = `<div data-l10n-id="validMessage1"></div>`;

    const { processedContent, foundMessages } = processHTMLFile(inputContent, namespace, allMessages, ignores, filePath);

    expect(processedContent).toBe("<div data-l10n-id=\"myNamespace-validMessage1\"></div>");
    expect(foundMessages.includes("validMessage1")).toBe(true);
  });

  it("should skip ignored IDs", () => {
    const inputContent = `<div data-l10n-id="ignoredMessage"></div>`;
    const { processedContent, foundMessages } = processHTMLFile(inputContent, namespace, allMessages, ignores, filePath);

    expect(processedContent).toBe("<div data-l10n-id=\"ignoredMessage\"></div>");
    expect(foundMessages.includes("ignoredMessage")).toBe(true);
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining("Skipped ignored ID:"));
  });

  it("should warn when an FTL message is missing", () => {
    const inputContent = `<div data-l10n-id="missingMessage"></div>`;

    const { processedContent, foundMessages } = processHTMLFile(inputContent, namespace, allMessages, ignores, filePath);

    expect(processedContent).toBe("<div data-l10n-id=\"missingMessage\"></div>");
    expect(foundMessages.includes("missingMessage")).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("does not exist in any locale, skip renaming it"));
  });

  it("should not modify the content if no matching messages are found", () => {
    const inputContent = `<div data-l10n-id="validMessage3"></div>`;
    const { processedContent, foundMessages } = processHTMLFile(inputContent, namespace, allMessages, ignores, filePath);

    expect(processedContent).toBe("<div data-l10n-id=\"validMessage3\"></div>"); // No replacement
    expect(foundMessages.includes("validMessage3")).toBe(true); // No message found
  });
});

describe("message-manager", () => {
  let messageManager: MessageManager;
  const ignores = ["ignore"];

  beforeEach(() => {
    messageManager = new MessageManager(ignores);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should add FTL messages for a specific locale", () => {
    const locale = "en";
    const messages = ["welcome", "goodbye"];

    messageManager.addMessages(locale, messages);

    const ftlMessages = messageManager.getFTLMessagesByLocale(locale);

    expect(ftlMessages.has("welcome")).toBe(true);
    expect(ftlMessages.has("goodbye")).toBe(true);
  });

  it("should add HTML messages", () => {
    const messages = ["about", "contact"];

    messageManager.addMessages("html", messages);

    const htmlMessages = messageManager.getHTMLMessages();

    expect(htmlMessages.has("about")).toBe(true);
    expect(htmlMessages.has("contact")).toBe(true);
  });

  it("should validate missing HTML messages in FTL locales", () => {
    messageManager.addMessages("en", ["welcome", "goodbye"]);
    messageManager.addMessages("fr", ["welcome"]);
    messageManager.addMessages("html", ["welcome", "goodbye"]);

    messageManager.validateMessages();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/I10N id .*goodbye.* missing in locale: fr/),
    );
  });

  it("should not trigger a warning when HTML messages are present in all FTL locales", () => {
    messageManager.addMessages("en", ["welcome", "about"]);
    messageManager.addMessages("fr", ["welcome", "about"]);
    messageManager.addMessages("html", ["about", "welcome"]);

    messageManager.validateMessages();

    // No warnings should be logged for "about" and "welcome"
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("should return all FTL messages", () => {
    messageManager.addMessages("en", ["welcome", "about"]);
    messageManager.addMessages("fr", ["welcome"]);

    const allMessages = messageManager.getFTLMessages();

    expect(allMessages).toEqual(new Set(["welcome", "about"]));
  });

  it("should return an empty set when no FTL messages exist for a locale", () => {
    messageManager.addMessages("en", ["welcome", "about"]);

    const frMessages = messageManager.getFTLMessagesByLocale("fr");

    expect(frMessages.size).toBe(0);
  });

  it("should return empty HTML messages if none have been added", () => {
    const htmlMessages = messageManager.getHTMLMessages();

    expect(htmlMessages.size).toBe(0);
  });
});

describe("generateFluentDts", () => {
  it("should generate TypeScript definitions for Fluent messages", () => {
    const messages = ["welcome", "about"];
    const expectedDts = `// Generated by zotero-plugin-scaffold
/* prettier-ignore */
/* eslint-disable */
// @ts-nocheck
export type FluentMessageId =
  | 'about'
  | 'welcome';
`;

    expect(generateFluentDts(messages)).toBe(expectedDts);
  });
});
