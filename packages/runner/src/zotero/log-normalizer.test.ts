import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { createMessageNormalizer, sanitizeZoteroMessage } from "./log-normalizer.js";

/**
 * Real capture from the zotero-linter output discussed in the issue:
 * Zotero dumps each `Zotero.debug()` message as
 * `zotero(level)(\x1b[31;40m+delta\x1b[0m): message\n\n`, where message may
 * itself contain `\n` because zotero-plugin-toolkit's `log()` joins its
 * arguments with `\n`.
 */
const realCapture
  = "zotero(3)(\x1B[31;40m+0008072\x1B[0m): [Linter]\n[Runner]\nAdd tasks at 12:48:13 PM\n\n"
    + "zotero(3)(+0000132): [Linter]\n[Runner]\nOptions map:\n{}\n\n"
    + "zotero(3)(+0000002): [Linter]\n[Runner]\n[ConcurrentCaller] Running function (1/1 running, 0 queued)\n\n"
    + "zotero(3)(+0000001): [Linter]\n[Runner]\nLinting item 2047\n\n"
    + "zotero(3)(+0000000): [Linter]\n[Runner]\nApplying correct-title-sentence-case\n\n"
    + "zotero(4)(+0000013): Item 2047 has not changed\n\n"
    + "zotero(3)(+0000001): [Linter]\n[Runner]\n[ConcurrentCaller] Done with function (0/1 running, 0 queued)\n\n"
    + "zotero(3)(+0000001): [Linter]\n[Runner]\n[ConcurrentCaller] All tasks are done\n\n"
    + "zotero(3)(+0000001): [Linter]\n[data-loader]\nData cache cleared\n\n"
    + "zotero(3)(+0000000): [Linter]\n[Runner]\nBatch tasks completed in 0.151s\n\n";

const expectedCleanLines = [
  "(3)(+0008072): [Linter] [Runner] Add tasks at 12:48:13 PM",
  "(3)(+0000132): [Linter] [Runner] Options map: {}",
  "(3)(+0000002): [Linter] [Runner] [ConcurrentCaller] Running function (1/1 running, 0 queued)",
  "(3)(+0000001): [Linter] [Runner] Linting item 2047",
  "(3)(+0000000): [Linter] [Runner] Applying correct-title-sentence-case",
  "(4)(+0000013): Item 2047 has not changed",
  "(3)(+0000001): [Linter] [Runner] [ConcurrentCaller] Done with function (0/1 running, 0 queued)",
  "(3)(+0000001): [Linter] [Runner] [ConcurrentCaller] All tasks are done",
  "(3)(+0000001): [Linter] [data-loader] Data cache cleared",
  "(3)(+0000000): [Linter] [Runner] Batch tasks completed in 0.151s",
];

describe("sanitizeZoteroMessage", () => {
  it("strips ANSI codes, the zotero prefix, and interior line breaks", () => {
    expect(sanitizeZoteroMessage(
      "zotero(3)(\x1B[31;40m+0008072\x1B[0m): [Linter]\n[Runner]\nAdd tasks at 12:48:13 PM",
    )).toBe("(3)(+0008072): [Linter] [Runner] Add tasks at 12:48:13 PM");
  });

  it("keeps messages without the zotero prefix intact", () => {
    expect(sanitizeZoteroMessage("(4)(+0000013): Item 2047 has not changed"))
      .toBe("(4)(+0000013): Item 2047 has not changed");
  });

  it("only strips the dump prefix, not a literal 'zotero' in the message", () => {
    expect(sanitizeZoteroMessage("zotero(3)(+0000001): zotero bug"))
      .toBe("(3)(+0000001): zotero bug");
  });

  it("returns an empty string for blank input", () => {
    expect(sanitizeZoteroMessage("")).toBe("");
    expect(sanitizeZoteroMessage("\n\n")).toBe("");
  });
});

describe("createMessageNormalizer", () => {
  it("emits one clean line per message from the real capture", () => {
    const lines: string[] = [];
    const normalizer = createMessageNormalizer(line => lines.push(line));

    normalizer.push(realCapture);
    normalizer.flush();

    expect(lines).toEqual(expectedCleanLines);
  });

  it("buffers messages split across arbitrary chunk boundaries", () => {
    const lines: string[] = [];
    const normalizer = createMessageNormalizer(line => lines.push(line));
    const cut = realCapture.indexOf("Applying correct-") + 1;

    normalizer.push(realCapture.slice(0, cut));
    normalizer.push(realCapture.slice(cut));
    normalizer.flush();

    expect(lines).toEqual(expectedCleanLines);
  });

  it("emits each message as it completes, before the stream ends", () => {
    const lines: string[] = [];
    const normalizer = createMessageNormalizer(line => lines.push(line));

    normalizer.push(realCapture);
    expect(lines).toEqual(expectedCleanLines);
  });

  it("flushes a trailing message without the \\n\\n terminator", () => {
    const lines: string[] = [];
    const normalizer = createMessageNormalizer(line => lines.push(line));

    normalizer.push("zotero(4)(+0000013): Item 2047 has not changed");
    normalizer.flush();

    expect(lines).toEqual(["(4)(+0000013): Item 2047 has not changed"]);
  });

  it("skips empty messages from consecutive \\n\\n separators", () => {
    const lines: string[] = [];
    const normalizer = createMessageNormalizer(line => lines.push(line));

    normalizer.push("zotero(3)(+0000001): hi\n\n\n\nzotero(3)(+0000002): bye\n\n");
    normalizer.flush();

    expect(lines).toEqual(["(3)(+0000001): hi", "(3)(+0000002): bye"]);
  });

  it("normalizes CRLF line endings to LF", () => {
    const lines: string[] = [];
    const normalizer = createMessageNormalizer(line => lines.push(line));

    normalizer.push("zotero(3)(+0000001): [Linter]\r\n[Runner]\r\nData cache cleared\r\n\r\n");
    normalizer.flush();

    expect(lines).toEqual(["(3)(+0000001): [Linter] [Runner] Data cache cleared"]);
  });

  it("keeps non-debug output (DevTools banner) line breaks intact", () => {
    const lines: string[] = [];
    const normalizer = createMessageNormalizer(line => lines.push(line));

    normalizer.push(
      "DevTools Server for Browser Toolbox listening on port: 60529\n"
      + "Starting Browser Toolbox D:\\Code\\zotero\\tools\\zotero-beta-build\\zotero.exe -foreground\n"
      + "Started devtools server on 60525\n"
      + "zotero(3)(+0000000): Using data directory C:\\Users\\northword\\Zotero\n\n",
    );
    normalizer.flush();

    expect(lines).toEqual([
      "DevTools Server for Browser Toolbox listening on port: 60529",
      "Starting Browser Toolbox D:\\Code\\zotero\\tools\\zotero-beta-build\\zotero.exe -foreground",
      "Started devtools server on 60525",
      "(3)(+0000000): Using data directory C:\\Users\\northword\\Zotero",
    ]);
  });

  it("flattens only zotero messages, not the raw lines around them", () => {
    const lines: string[] = [];
    const normalizer = createMessageNormalizer(line => lines.push(line));

    normalizer.push(
      "Started devtools server on 60525\n"
      + "zotero(3)(+0000001): [Linter]\n[Runner]\nAdd tasks at 12:48:13 PM\n\n"
      + "zotero(3)(+0000000): [Linter]\n[Runner]\nBatch tasks completed\n\n"
      + "DevTools: shutdown\n",
    );
    normalizer.flush();

    expect(lines).toEqual([
      "Started devtools server on 60525",
      "(3)(+0000001): [Linter] [Runner] Add tasks at 12:48:13 PM",
      "(3)(+0000000): [Linter] [Runner] Batch tasks completed",
      "DevTools: shutdown",
    ]);
  });

  it("keeps multi-line structured output (varDump JSON) readable", () => {
    const lines: string[] = [];
    const normalizer = createMessageNormalizer(line => lines.push(line));

    normalizer.push(
      "zotero(3)(+0000000): {\n"
      + "    \"userID\": 11729930\n"
      + "    \"username\": \"northword-dev\"\n"
      + "    \"displayName\": \"\"\n"
      + "    \"access\": {\n"
      + "        \"user\": {\n"
      + "            \"library\": true\n"
      + "            \"files\": true\n"
      + "            \"notes\": true\n"
      + "            \"write\": true\n"
      + "        }\n"
      + "        \"groups\": {\n"
      + "            \"all\": {\n"
      + "                \"library\": true\n"
      + "                \"write\": true\n"
      + "            }\n"
      + "        }\n"
      + "    }\n"
      + "}\n\n",
    );
    normalizer.flush();

    expect(lines).toEqual([
      "(3)(+0000000): {",
      "    \"userID\": 11729930",
      "    \"username\": \"northword-dev\"",
      "    \"displayName\": \"\"",
      "    \"access\": {",
      "        \"user\": {",
      "            \"library\": true",
      "            \"files\": true",
      "            \"notes\": true",
      "            \"write\": true",
      "        }",
      "        \"groups\": {",
      "            \"all\": {",
      "                \"library\": true",
      "                \"write\": true",
      "            }",
      "        }",
      "    }",
      "}",
    ]);
  });

  it("supports structured output followed by a flat message", () => {
    const lines: string[] = [];
    const normalizer = createMessageNormalizer(line => lines.push(line));

    normalizer.push(
      "zotero(3)(+0000000): {\n"
      + "    \"a\": 1\n"
      + "}\n\n"
      + "zotero(3)(+0000001): [Linter]\n[Runner]\nBatch tasks completed\n\n",
    );
    normalizer.flush();

    expect(lines).toEqual([
      "(3)(+0000000): {",
      "    \"a\": 1",
      "}",
      "(3)(+0000001): [Linter] [Runner] Batch tasks completed",
    ]);
  });

  it("does not corrupt multi-byte characters split across chunks", () => {
    const lines: string[] = [];
    const normalizer = createMessageNormalizer(line => lines.push(line));
    const raw = "zotero(3)(+0000001): [Linter] 数据 测试\n\n";
    const buf = Buffer.from(raw);
    const byteCut = Buffer.byteLength("zotero(3)(+0000001): [Linter] 数") + 1; // cut inside the 3-byte char

    normalizer.push(buf.subarray(0, byteCut));
    normalizer.push(buf.subarray(byteCut));
    normalizer.flush();

    expect(lines).toEqual(["(3)(+0000001): [Linter] 数据 测试"]);
  });
});
