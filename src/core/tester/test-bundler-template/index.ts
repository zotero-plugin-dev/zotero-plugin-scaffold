import { TESTER_PLUGIN_ID, TESTER_PLUGIN_REF } from "../../../constant.js";
import bootstrapRaw from "./raw/bootstrap.js?raw";
import htmlRaw from "./raw/index.html?raw";
import manifestRaw from "./raw/manifest.json?raw";
import vitestSetupRaw from "./raw/vitest-setup.js?raw";

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

/**
 * The test page is a static file, no runtime placeholders.
 */
export function generateHtml(): string {
  return htmlRaw;
}

/**
 * Generates `setup.js`, the in-page script that wires the Vitest runtime to
 * the HTTP reporter and starts the tests.
 *
 * `testFiles` are paths relative to the test page (`content/`), e.g.
 * `units/foo.test.js`. The runner imports each of them via dynamic import.
 */
export function generateVitestSetup(options: {
  port: number;
  timeout: number;
  abortOnFail: boolean;
  exitOnFinish: boolean;
  testFiles: string[];
}): string {
  return vitestSetupRaw
    .replaceAll("__TIMEOUT__", String(options.timeout || 10000))
    .replaceAll("__PORT__", String(options.port))
    .replaceAll("__ABORT_ON_FAIL__", String(options.abortOnFail))
    .replaceAll("__EXIT_ON_FINISH__", String(options.exitOnFinish ? "true" : "false"))
    .replaceAll("__TEST_FILES__", JSON.stringify(options.testFiles));
}
