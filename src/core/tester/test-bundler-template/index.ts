import { TESTER_PLUGIN_ID, TESTER_PLUGIN_REF } from "../../../constant.js";
import bootstrapRaw from "./raw/bootstrap.js?raw";
import htmlRaw from "./raw/index.html?raw";
import manifestRaw from "./raw/manifest.json?raw";
import mochaSetupRaw from "./raw/mocha-setup.js?raw";

export function generateManifest(): Record<string, unknown> {
  const manifestStr = manifestRaw
    .replace("__TESTER_PLUGIN_ID__", TESTER_PLUGIN_ID);

  return JSON.parse(manifestStr);
}

export function generateBootstrap(options: {
  port: number;
  startupDelay: number;
  waitForPlugin: string;
}): string {
  return bootstrapRaw
    .replace("__PORT__", String(options.port))
    .replace("__STARTUP_DELAY__", String(options.startupDelay || 1000))
    .replace("__WAIT_FOR_PLUGIN__", options.waitForPlugin)
    .replace("__TESTER_PLUGIN_REF__", TESTER_PLUGIN_REF);
}

export function generateHtml(
  setupCode: string,
  testFiles: string[],
): string {
  const tests = testFiles.map(f => `<script src="${f}"></script>`).join("\n    ");

  return htmlRaw.replace("__TEST_FILES__", tests).replace("___SETUP_CODE___", setupCode);
}

export function generateMochaSetup(options: {
  port: number;
  timeout: number;
  abortOnFail: boolean;
  exitOnFinish: boolean;
}): string {
  return mochaSetupRaw
    .replace("__TIMEOUT__", String(options.timeout || 10000))
    .replace("__PORT__", String(options.port))
    .replace("__ABORT_ON_FAIL__", String(options.abortOnFail))
    .replace("__EXIT_ON_FINISH__", String(options.exitOnFinish ? "true" : "false"));
}
