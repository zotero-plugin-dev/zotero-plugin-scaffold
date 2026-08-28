import type { Buffer } from "node:buffer";

/**
 * ANSI escape sequences (e.g. `\x1b[31;40m`, `\x1b[0m`) that Zotero embeds
 * in terminal output. Zotero's Debug Output window strips these, but they
 * land raw when stdout is captured to a file.
 */
// eslint-disable-next-line no-control-regex -- matching real ANSI escape bytes (ESC)
export const ANSI_ESCAPE_RE: RegExp = /\x1B\[[0-9;]*[a-z]/gi;

/**
 * Literal prefix Zotero prepends to every text-console debug message
 * (`dump("zotero" + output + "\n\n")` in Zotero's `xpcom/debug.js`).
 */
const ZOTERO_DUMP_PREFIX = "zotero";

/**
 * Start of a `Zotero.debug()` text-console message (`zotero(3)(+0000001): ...`).
 * All other stdout lines (e.g. the DevTools server startup banner) are NOT
 * debug messages and must keep their own line breaks.
 */
const ZOTERO_MESSAGE_START_RE = /^zotero\(\d+\)\(/;

export interface MessageNormalizer {
  push: (chunk: Buffer | string) => void;
  flush: () => void;
}

/**
 * Clean one raw `Zotero.debug()` message (`zotero(level)(...): text`) into a
 * single readable line, mirroring what Zotero's Debug Output window shows:
 *
 * - drops ANSI color codes (the delta is wrapped in `\x1b[31;40m`/`\x1b[0m`
 *   when it exceeds `debug.log.slowTime`, default 5000 ms);
 * - strips the leading `zotero` prefix added by `dump("zotero" + output + "\n\n")`;
 * - collapses interior line breaks to a single space — plugin loggers such as
 *   zotero-plugin-toolkit's `log()` join their arguments with `\n`, so one
 *   message may itself span several lines.
 */
export function sanitizeZoteroMessage(raw: string): string {
  const noAnsi = raw.replace(ANSI_ESCAPE_RE, "");
  const noPrefix = noAnsi.startsWith(ZOTERO_DUMP_PREFIX)
    ? noAnsi.slice(ZOTERO_DUMP_PREFIX.length)
    : noAnsi;
  return noPrefix.replace(/\s+/g, " ").trim();
}

/**
 * Normalize a raw Zotero stdout stream into readable log lines.
 *
 * Lines are processed one by one:
 * - a `Zotero.debug()` message (starts with `zotero(<level>)(` and is
 *   terminated by Zotero's own `\n\n`, see its `xpcom/debug.js`) is broken
 *   into one clean line per payload: the `zotero` prefix and ANSI codes are
 *   stripped, and non-indented continuation lines — separate arguments that
 *   plugin loggers such as zotero-plugin-toolkit joined with `\n` — are
 *   folded back into the previous line; indented continuation lines (multi-
 *   line structured output such as `Zotero.debug(object)`'s varDump) keep
 *   their own line breaks so they stay readable;
 * - any other stdout output (e.g. the DevTools server startup banner) keeps
 *   its own line breaks and only has ANSI codes stripped.
 *
 * Messages may arrive split across chunks or several per chunk, so partial
 * lines are buffered until the next `\n`. Text is decoded with a streaming
 * UTF-8 decoder so a multi-byte character spanning a chunk boundary is not
 * corrupted; `flush()` emits the trailing partial message on process exit.
 */
export function createMessageNormalizer(onMessage: (message: string) => void): MessageNormalizer {
  const decoder = new TextDecoder("utf-8");
  let buf = "";
  let inMessage = false; // collecting the lines of one zotero message
  let currentLine: string | null = null; // accumulated non-indented continuation lines

  const emit = (text: string): void => {
    if (text)
      onMessage(text);
  };

  // Emit the accumulated top-level line (message header included), cleaned up.
  const flushCurrentLine = (): void => {
    if (currentLine) {
      emit(sanitizeZoteroMessage(currentLine));
      currentLine = null;
    }
  };

  const handleLine = (line: string): void => {
    if (!inMessage) {
      if (ZOTERO_MESSAGE_START_RE.test(line)) {
        inMessage = true;
        currentLine = line;
        return;
      }
      // Raw non-debug output (e.g. the DevTools startup banner): keep its own line breaks.
      if (line)
        emit(line.replace(ANSI_ESCAPE_RE, ""));
      return;
    }
    // Inside a zotero message.
    if (line === "") {
      // Blank line = the `\n\n` terminator Zotero appends to every message.
      flushCurrentLine();
      inMessage = false;
      return;
    }
    if (/^\s/.test(line)) {
      // Indented continuation line: structured multi-line content (varDump JSON etc.),
      // keep its own line breaks.
      flushCurrentLine();
      emit(line.replace(ANSI_ESCAPE_RE, ""));
      return;
    }
    // Non-indented continuation line: a separate argument the logger joined with
    // `\n`, fold it into the current line.
    currentLine = currentLine ? `${currentLine} ${line}` : line;
  };

  return {
    push: (chunk: Buffer | string) => {
      buf += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
      // Normalize CRLF/CR so the `\n\n` terminator survives on Windows too.
      buf = buf.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const lines = buf.split("\n");
      buf = lines.pop()!; // The last segment may be an incomplete line; buffer it for the next chunk
      for (const line of lines)
        handleLine(line);
    },
    flush: () => {
      // `decoder.decode()` (without `{ stream: true }`) flushes any bytes held
      // back for a possibly-incomplete multi-byte character.
      const rest = buf + decoder.decode();
      buf = "";
      if (rest)
        handleLine(rest);
      // At process exit the message may lack the `\n\n` terminator: emit the leftover content.
      if (inMessage)
        flushCurrentLine();
      inMessage = false;
    },
  };
}
