import { TESTER_PLUGIN_ID, TESTER_PLUGIN_REF } from "../../../constant.js";
import bootstrapRaw from "./raw/bootstrap.js?raw";
import htmlRaw from "./raw/index.html?raw";
import manifestRaw from "./raw/manifest.json?raw";
import mochaSetupRaw from "./raw/mocha-setup.js?raw";

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
  setupCode: string,
  testFiles: string[],
): string {
  const tests = testFiles.map(f => `<script src="units/${f}"></script>`).join("\n    ");

  return htmlRaw
    .replaceAll("__TEST_FILES__", tests)
    .replaceAll("__SETUP_CODE__", setupCode);
}

export function generateMochaSetup(options: {
  port: number;
  timeout: number;
  abortOnFail: boolean;
  exitOnFinish: boolean;
}): string {
  return mochaSetupRaw
    .replaceAll("__TIMEOUT__", String(options.timeout || 10000))
    .replaceAll("__PORT__", String(options.port))
    .replaceAll("__ABORT_ON_FAIL__", String(options.abortOnFail))
    .replaceAll("__EXIT_ON_FINISH__", String(options.exitOnFinish ? "true" : "false"));
}
