/**
 * HTTP transport for the in-page worker.
 *
 * Uses Zotero's privileged HTTP client (`Zotero.HTTP.request`): the chrome://
 * page's CSP does not reliably allow plain fetch() to http://127.0.0.1, and
 * XHR stringifies object bodies (String({}) === "[object Object]").
 *
 * Message framing:
 *   page → host: POST /post with a flatted-serialized message as the raw body
 *   host → page: GET /poll returns a JSON array of flatted strings
 *   handshake:  POST /ready (fires once the page starts polling)
 *   debug:      POST /debug (page logs mirrored to the host)
 */
/** Minimal surface of Zotero's privileged HTTP client used by the page. */
interface ZoteroHttpResponse {
  status: number;
  responseText: string;
}
interface ZoteroHttp {
  request: (
    method: string,
    url: string,
    options?: { body?: string; headers?: Record<string, string> },
  ) => Promise<ZoteroHttpResponse>;
}
declare const Zotero: { HTTP: ZoteroHttp };

export class HttpTransport {
  constructor(private readonly base: string) {}

  /** Performs a request; returns the raw response text (empty for 204). */
  async request(method: string, path: string, bodyString?: string): Promise<string> {
    const res = await Zotero.HTTP.request(method, `${this.base}${path}`, {
      body: bodyString,
      headers: { "Content-Type": "application/json" },
    });
    if (res.status !== 200) {
      throw new Error(`${method} ${path} → HTTP ${res.status}`);
    }
    return res.responseText;
  }

  /** Sends a raw (already flatted-serialized) message to the host. */
  async post(message: string): Promise<void> {
    await this.request("POST", "/post", message);
  }

  /** Polls for messages from the host. */
  async poll(): Promise<string[]> {
    const text = await this.request("GET", "/poll");
    if (!text) {
      return [];
    }
    return JSON.parse(text) as string[];
  }

  /** Ready handshake: signals the host that the page is polling. */
  async ready(): Promise<void> {
    await this.request("POST", "/ready");
  }

  /** Mirrors a page log line to the host for headless debugging. */
  async debug(message: string): Promise<void> {
    await this.request("POST", "/debug", JSON.stringify({ message }));
  }
}
