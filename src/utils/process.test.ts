import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { isTcpPortAvailable } from "./process.js";

describe("isTcpPortAvailable", () => {
  it("reports a bound port as taken", async () => {
    const server = createServer();
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };

    await expect(isTcpPortAvailable(port)).resolves.toBe(false);

    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it("reports a released port as available", async () => {
    const server = createServer();
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };
    await new Promise<void>(resolve => server.close(() => resolve()));

    await expect(isTcpPortAvailable(port)).resolves.toBe(true);
  });
});
