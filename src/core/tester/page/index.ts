/**
 * In-page test runner entry (bundled to content/setup.js by the tester
 * bundler). Loaded from chrome://zotero-<tester>/content/index.html.
 *
 * Globals (describe/it/expect/vi/...) are injected by vitest's own
 * setupCommonEnv() on the start request (see protocol.ts) — the same code
 * path as `globals: true`, so no list is maintained here.
 */

import { WorkerProtocol } from "./protocol.js";
import { runMethod } from "./runner.js";
import { HttpTransport } from "./transport.js";
import { waitForPluginReady } from "./wait-plugin.js";

// The test window is opened with ?port=<bridge-port> (see template/bootstrap.js).
const port = new URLSearchParams(location.search).get("port") ?? "";
if (!port) {
  throw new Error("missing ?port= in the test window URL");
}
const transport = new HttpTransport(`http://127.0.0.1:${port}`);

function dump(str: string): void {
  const status = document.querySelector("#status");
  if (status) {
    status.textContent += str;
  }
  // Mirror page logs to the host for headless debugging.
  transport.debug(str).catch(() => {});
}

/**
 * Optional plugin-ready wait (zoteroPool({ waitForPlugin })): polls before the
 * worker handshake so the first test only runs once the plugin is up.
 */
async function waitForPlugin(): Promise<void> {
  if (!waitForPluginReady) {
    return;
  }
  const deadline = Date.now() + 30000;
  while (!waitForPluginReady()) {
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for the plugin (waitForPlugin)");
    }
    await new Promise(r => setTimeout(r, 100));
  }
}

// Wrapped in an async IIFE because the page is a module and lint bans
// top-level await.
void (async () => {
  await waitForPlugin();

  const protocol = new WorkerProtocol(transport, { runMethod }, dump);
  protocol.start();

  // Expose the worker state under vitest's official global key so vi members
  // that read `getWorkerState()` work in the page: fake timers, setConfig,
  // stubEnv, resetModules. The state object is the same one the protocol
  // updates (ctx/config on start), so nothing else changes.
  Object.defineProperty(globalThis, "__vitest_worker__", {
    value: protocol.workerState,
    configurable: true,
    writable: true,
  });
})();
