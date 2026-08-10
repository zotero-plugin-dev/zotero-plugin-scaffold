import { WorkerProtocol } from "./protocol.js";
import { runMethod } from "./runner.js";
/**
 * In-page test runner entry (bundled to content/setup.js by the tester
 * bundler). Loaded from chrome://zotero-<tester>/content/index.html.
 */
import { HttpTransport } from "./transport.js";

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

dump(`setup loaded, polling http://127.0.0.1:${port}\n`);
