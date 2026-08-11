/**
 * In-page test runner entry (bundled to content/setup.js by the tester
 * bundler). Loaded from chrome://zotero-<tester>/content/index.html.
 */

import { WorkerProtocol } from "./protocol.js";
import { runMethod } from "./runner.js";
import { HttpTransport } from "./transport.js";

// Globals are injected by vitest's own setupCommonEnv() on the start request
// (see protocol.ts) — the same code path as `globals: true`, so no list is
// maintained here.

declare const document: any;
declare const location: any;

const port = new URLSearchParams(location.search).get("port");
const transport = new HttpTransport(`http://127.0.0.1:${port}`);

function dump(str: string): void {
  document.querySelector("#status").textContent += str;
  // Mirror page logs to the host for headless debugging.
  transport.debug(str).catch(() => {});
}

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

dump(`setup loaded, polling http://127.0.0.1:${port}\n`);
