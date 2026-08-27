import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import { createLineSplitter } from "./zotero-runner.js";

describe("createLineSplitter", () => {
  it("splits full lines in a single chunk", () => {
    const onLine = vi.fn();
    const splitter = createLineSplitter(onLine);
    splitter.push("line1\nline2\n");

    expect(onLine).toHaveBeenCalledTimes(2);
    expect(onLine).toHaveBeenNthCalledWith(1, "line1");
    expect(onLine).toHaveBeenNthCalledWith(2, "line2");
  });

  it("buffers a partial line across chunks", () => {
    const onLine = vi.fn();
    const splitter = createLineSplitter(onLine);
    splitter.push("lin");
    splitter.push("e1\nline2");

    expect(onLine).toHaveBeenCalledTimes(1);
    expect(onLine).toHaveBeenCalledWith("line1");

    // 末尾无换行的半行在 flush 时输出
    splitter.flush();
    expect(onLine).toHaveBeenCalledTimes(2);
    expect(onLine).toHaveBeenLastCalledWith("line2");
  });

  it("handles CRLF line endings", () => {
    const onLine = vi.fn();
    const splitter = createLineSplitter(onLine);
    splitter.push("line1\r\nline2\r\n");

    expect(onLine).toHaveBeenCalledTimes(2);
    expect(onLine).toHaveBeenNthCalledWith(1, "line1");
    expect(onLine).toHaveBeenNthCalledWith(2, "line2");
  });

  it("flushes the trailing line without newline on close", () => {
    const onLine = vi.fn();
    const splitter = createLineSplitter(onLine);
    splitter.push("line1\nline2");

    splitter.flush();
    expect(onLine).toHaveBeenCalledTimes(2);
    expect(onLine).toHaveBeenLastCalledWith("line2");
  });

  it("ignores empty chunks and does not emit empty lines on flush", () => {
    const onLine = vi.fn();
    const splitter = createLineSplitter(onLine);
    splitter.push("");
    splitter.flush();

    expect(onLine).not.toHaveBeenCalled();
  });

  it("handles Buffer chunks", () => {
    const onLine = vi.fn();
    const splitter = createLineSplitter(onLine);
    splitter.push(Buffer.from("line1\n"));
    splitter.push(Buffer.from("line2"));

    splitter.flush();
    expect(onLine).toHaveBeenCalledTimes(2);
    expect(onLine).toHaveBeenNthCalledWith(1, "line1");
    expect(onLine).toHaveBeenNthCalledWith(2, "line2");
  });
});
