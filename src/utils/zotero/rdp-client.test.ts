import { Buffer } from "node:buffer";
import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { MessagingClient } from "./rdp-client.js";
import { findFreeTcpPort, RemoteFirefox } from "./remote-zotero.js";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

async function startServer(
  onConnection?: (socket: net.Socket) => void,
): Promise<number> {
  const server = net.createServer((socket) => {
    onConnection?.(socket);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(
    () => new Promise<void>(resolve => server.close(() => resolve())),
  );
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Failed to bind a test TCP server");
  return address.port;
}

function encodeRdpMessage(message: unknown): Buffer {
  const payload = JSON.stringify(message);
  return Buffer.from(`${Buffer.byteLength(payload)}:${payload}`, "utf8");
}

describe("messagingClient.connect", () => {
  it("rejects with ECONNREFUSED instead of crashing the process", async () => {
    // A port that has just been released: nothing is listening on it.
    const port = await findFreeTcpPort();

    const client = new MessagingClient();
    const errors: Error[] = [];
    client.on("error", (error: Error) => errors.push(error));

    // Previously this relied on the deprecated `domain` module to keep the
    // socket error from becoming an uncaught exception.
    await expect(client.connect(port)).rejects.toMatchObject({
      code: "ECONNREFUSED",
    });
  });

  it("resolves once the connection is established", async () => {
    const port = await startServer();

    const client = new MessagingClient();
    client.on("error", () => {});

    await expect(client.connect(port)).resolves.toBeUndefined();
    client.disconnect();
  });

  it("emits socket errors as events instead of throwing", async () => {
    // Missing numeric length prefix -> unparsable RDP packet.
    const payload = Buffer.from("abc:{\"from\":\"root\"}", "utf8");
    const port = await startServer((socket) => {
      socket.write(payload);
    });

    const client = new MessagingClient();
    const errors: Error[] = [];
    client.on("error", (error: Error) => errors.push(error));

    await client.connect(port);

    await expect
      .poll(() => errors.length, { timeout: 5000 })
      .toBeGreaterThan(0);
    expect(String(errors[0])).toContain("Error parsing RDP packet");

    client.disconnect();
  });

  it("ignores the addonListChanged message", async () => {
    const port = await startServer((socket) => {
      socket.write(encodeRdpMessage({ from: "root", type: "addonListChanged" }));
    });

    const client = new MessagingClient();
    const errors: Error[] = [];
    client.on("error", (error: Error) => errors.push(error));

    await client.connect(port);

    // `addonListChanged` is ignored on purpose (dirty patch in handleMessage),
    // it must not raise an "unexpected message" error.
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(errors).toEqual([]);

    client.disconnect();
  });
});

describe("remoteFirefox.connect", () => {
  it("keeps event listeners on the reconnected client", async () => {
    const port = await startServer();

    const remote = new RemoteFirefox();
    const client = await remote.connect(port);

    expect(client).toBe(remote.client);
    // Without a listener, an `error` event emitted by the new client would be
    // thrown as an uncaught exception.
    expect(client.listenerCount("error")).toBeGreaterThan(0);

    remote.disconnect();
  });
});
