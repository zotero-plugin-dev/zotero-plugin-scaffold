import process from "node:process";
import readline from "node:readline";
import { styleText } from "node:util";
import { isPlainObject } from "es-toolkit";
import { isDebug } from "std-env";

/**
 * Log level enumeration
 */
export enum LOG_LEVEL {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
}

export type LogLevelType = keyof typeof LOG_LEVEL;

// Configuration constants
const SYMBOLS = {
  SUCCESS: styleText("green", "✔"),
  INFO: styleText("blue", "ℹ"),
  FAIL: styleText("red", "✖"),
  TIP: styleText("blue", "→"),
  ERROR: styleText("bgRed", " ERROR "),
  WARN: styleText("bgYellow", " WARN "),
  DEBUG: styleText("grey", "⚙"),
  NONE: "",
};

const DEFAULT_OPTIONS = {
  SPACE: 0,
  LEVEL: LOG_LEVEL.INFO,
  SYMBOL: "",
  NEW_LINE: false,
} as const;

interface LoggerOptions {
  space?: number;
  newLine?: boolean;
}

interface LogMethodConfig {
  level: LOG_LEVEL;
  symbol: string;
  defaultSpace?: number;
  wrapNewLine?: boolean;
}

/**
 * Centralized log method configuration
 */
const LOG_METHODS_CONFIG: Record<string, LogMethodConfig> = {
  error: {
    level: LOG_LEVEL.ERROR,
    symbol: SYMBOLS.ERROR,
    wrapNewLine: true,
  },
  warn: {
    level: LOG_LEVEL.WARN,
    symbol: SYMBOLS.WARN,
    wrapNewLine: true,
  },
  tip: {
    level: LOG_LEVEL.INFO,
    symbol: SYMBOLS.TIP,
  },
  info: {
    level: LOG_LEVEL.INFO,
    symbol: SYMBOLS.INFO,
  },
  debug: {
    level: LOG_LEVEL.DEBUG,
    symbol: SYMBOLS.DEBUG,
  },
  success: {
    level: LOG_LEVEL.INFO,
    symbol: SYMBOLS.SUCCESS,
  },
  ready: {
    level: LOG_LEVEL.INFO,
    symbol: SYMBOLS.SUCCESS,
    wrapNewLine: true,
  },
  fail: {
    level: LOG_LEVEL.ERROR,
    symbol: SYMBOLS.FAIL,
  },
  log: {
    level: LOG_LEVEL.INFO,
    symbol: SYMBOLS.NONE,
  },
};

export class Logger {
  private static instance: Logger;
  private currentLogLevel: LOG_LEVEL;

  private constructor(level?: LOG_LEVEL) {
    this.currentLogLevel = this.determineLogLevel(level);
  }

  /**
   * Determine the appropriate log level
   */
  private determineLogLevel(level?: LOG_LEVEL): LOG_LEVEL {
    if (isDebug)
      return LOG_LEVEL.TRACE;
    const envLevel = process.env.ZOTERO_PLUGIN_LOG_LEVEL as LogLevelType;
    return envLevel ? LOG_LEVEL[envLevel] : level ?? LOG_LEVEL.INFO;
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public setLogLevel(level: LogLevelType): void {
    this.currentLogLevel = LOG_LEVEL[level];
  }

  public get level(): LOG_LEVEL {
    return this.currentLogLevel;
  }

  /**
   * Generic log formatting logic
   */
  private formatContent(content: unknown): string {
    if (typeof content === "string")
      return content;
    if (content instanceof Error)
      return this.formatError(content);
    if (isPlainObject(content))
      return JSON.stringify(content, null, 2);
    return String(content);
  }

  private formatError(error: Error): string {
    return `${styleText("red", error.name)}: ${styleText("red", error.message)}\n${error.stack}`;
  }

  /**
   * Core logging method
   */
  private logInternal(
    content: unknown,
    config: LogMethodConfig,
    options: LoggerOptions = {},
  ): void {
    if (this.currentLogLevel > config.level)
      return;

    const { space = DEFAULT_OPTIONS.SPACE, newLine = DEFAULT_OPTIONS.NEW_LINE } = options;
    const formattedContent = this.formatContent(content);
    const output = [
      "  ".repeat(space),
      config.symbol,
      formattedContent,
    ].join(" ");

    if (config.wrapNewLine)
      this.newLine();
    // eslint-disable-next-line no-console
    console.log(output);
    if (newLine || config.wrapNewLine)
      this.newLine();
  }

  // Public API methods
  public error(content: unknown, options?: LoggerOptions): void {
    this.logInternal(content, LOG_METHODS_CONFIG.error, options);
  }

  public warn(content: unknown, options?: LoggerOptions): void {
    this.logInternal(content, LOG_METHODS_CONFIG.warn, options);
  }

  public tip(content: unknown, options?: LoggerOptions): void {
    this.logInternal(content, LOG_METHODS_CONFIG.tip, options);
  }

  public info(content: unknown, options?: LoggerOptions): void {
    this.logInternal(content, LOG_METHODS_CONFIG.info, options);
  }

  public debug(content: unknown, options?: LoggerOptions): void {
    this.logInternal(content, LOG_METHODS_CONFIG.debug, options);
  }

  public success(content: unknown, options?: LoggerOptions): void {
    this.logInternal(content, LOG_METHODS_CONFIG.success, options);
  }

  public fail(content: unknown, options?: LoggerOptions): void {
    this.logInternal(content, LOG_METHODS_CONFIG.fail, options);
  }

  public ready(content: string): void {
    this.logInternal(styleText("green", content), LOG_METHODS_CONFIG.success);
  }

  public log(content: unknown, options?: LoggerOptions): void {
    this.logInternal(content, LOG_METHODS_CONFIG.log, options);
  }

  public clear(): void {
    // Modified from https://github.com/vitejs/vite/blob/561b940f6f963fbb78058a6e23b4adad53a2edb9/packages/vite/src/node/logger.ts#L40-L46
    const blank = process.stdout.rows > 2
      ? "\n".repeat(process.stdout.rows - 2)
      : "";
    // eslint-disable-next-line no-console
    console.log(blank);
    readline.cursorTo(process.stdout, 0, 0);
    readline.clearScreenDown(process.stdout);
  }

  public newLine(): void {
    // eslint-disable-next-line no-console
    console.log();
  }
}

export const logger = Logger.getInstance();
