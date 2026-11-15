import type { TestRuntimeOptions } from "../types.js";
import { TESTER_PLUGIN_ID, TESTER_PLUGIN_REF } from "../constant.js";
import bootstrapRaw from "./raw/bootstrap.js?raw";
import htmlRaw from "./raw/index.html?raw";
import manifestRaw from "./raw/manifest.json?raw";

export function generateManifest(): Record<string, unknown> {
  const manifestStr = manifestRaw
    .replaceAll("__TESTER_PLUGIN_ID__", TESTER_PLUGIN_ID);

  return JSON.parse(manifestStr);
}

export function generateBootstrap(options: {
  port: number;
  startupDelay: number;
  waitForPlugin: string;
}): string {
  return bootstrapRaw
    .replaceAll("__PORT__", String(options.port))
    .replaceAll("__STARTUP_DELAY__", String(options.startupDelay || 1000))
    .replaceAll("__WAIT_FOR_PLUGIN__", options.waitForPlugin)
    .replaceAll("__TESTER_PLUGIN_REF__", TESTER_PLUGIN_REF);
}

export function generateHtml(
  options: TestRuntimeOptions,
  testFiles: string[],
): string {
  const tests = testFiles.map(f => `<script src="${f}"></script>`).join("\n    ");

  return htmlRaw
    .replaceAll("__TEST_OPTIONS__", serializeTestOptions(options))
    .replaceAll("__TEST_FILES__", tests);
}

/**
 * Serialize the runtime options as the inline script body of the test page.
 *
 * The page is an XHTML document, so `<`, `>` and `&` must not appear raw in the
 * inline script — they would break the XML parse and with it the whole runner
 * page. The escapes are the JavaScript unicode escapes of the JSON text, so the
 * parsed value is unchanged.
 */
export function serializeTestOptions(options: TestRuntimeOptions): string {
  const json = JSON.stringify(options)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");

  return `window.__TEST_OPTIONS__ = ${json};`;
}
