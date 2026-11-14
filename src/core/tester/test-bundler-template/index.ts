import type { TestPageConfig } from "../protocol.js";
import { TESTER_PLUGIN_ID, TESTER_PLUGIN_REF } from "../../../constant.js";
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
  config: TestPageConfig,
  testFiles: string[],
): string {
  const tests = testFiles.map(f => `<script src="${f}"></script>`).join("\n    ");
  // `<` is escaped so that no configuration value can break the XML document,
  // the page reads the config from `window.__scaffoldConfig`.
  const configJson = JSON.stringify(config).replaceAll("<", "\\u003c");

  return htmlRaw
    .replaceAll("__TEST_FILES__", tests)
    .replaceAll("__CONFIG__", configJson);
}
