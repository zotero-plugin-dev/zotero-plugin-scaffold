import * as flatted from "flatted";
import { describe, expect, it } from "vitest";
import { HttpBridge } from "./pool/http-bridge.js";

async function startBridge() {
  const received: unknown[] = [];
  const bridge = new HttpBridge(message => received.push(message));
  await bridge.start();
  return { bridge, received };
}

async function post(bridge: HttpBridge, path: string, body?: string) {
  const res = await fetch(`http://127.0.0.1:${bridge.port}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  expect(res.status).toBe(200);
}

describe("httpBridge protocol", () => {
  it("ready handshake resolves waitReady", async () => {
    const { bridge } = await startBridge();
    const ready = bridge.waitReady();
    await post(bridge, "/ready");
    await expect(ready).resolves.toBeUndefined();
    bridge.stop();
  });

  it("send() queues flatted messages drained by /poll (FIFO)", async () => {
    const { bridge } = await startBridge();
    const msg1 = { type: "start", poolId: 1, __vitest_worker_request__: true };
    const msg2 = { type: "run", __vitest_worker_request__: true };
    bridge.send(msg1);
    bridge.send(msg2);

    const res = await fetch(`http://127.0.0.1:${bridge.port}/poll`);
    expect(res.status).toBe(200);
    const raw: string[] = await res.json();
    expect(raw).toHaveLength(2);
    expect(flatted.parse(raw[0])).toEqual(msg1);
    expect(flatted.parse(raw[1])).toEqual(msg2);

    // queue is drained
    const res2 = await fetch(`http://127.0.0.1:${bridge.port}/poll`);
    expect(await res2.json()).toEqual([]);
    bridge.stop();
  });

  it("pOST /post delivers flatted messages to onMessage", async () => {
    const { bridge, received } = await startBridge();
    const msg = { type: "started", __vitest_worker_response__: true };
    await post(bridge, "/post", flatted.stringify(msg));
    expect(received).toEqual([msg]);
    bridge.stop();
  });

  it("handles cyclic task trees over flatted", async () => {
    const { bridge, received } = await startBridge();
    // a file task references itself (file.file) — JSON.stringify would throw
    interface FileTask { type: string; name: string; tasks: unknown[]; file?: FileTask }
    const file: FileTask = { type: "file", name: "a.mjs", tasks: [] };
    file.file = file;
    const msg = { type: "rpc", method: "onCollected", files: [file] };
    await post(bridge, "/post", flatted.stringify(msg));
    expect(received).toHaveLength(1);
    const parsed = received[0] as { type?: string; files?: FileTask[] };
    expect(parsed.files?.[0]?.file).toBe(parsed.files?.[0]);
    bridge.stop();
  });

  it("debug messages are logged, malformed post returns 400", async () => {
    const { bridge } = await startBridge();
    await post(bridge, "/debug", JSON.stringify({ message: "hello" }));
    const res = await fetch(`http://127.0.0.1:${bridge.port}/post`, {
      method: "POST",
      body: "not-json",
    });
    expect(res.status).toBe(400);
    bridge.stop();
  });
});
