// KNOWN LIMITATION (verified 2026-08): vi.mock is NOT usable in native mode
// (experimental.viteModuleRunner: false) with vitest 4.1.4 — NativeModuleMocker
// is constructed without `rpc`/`interceptor`, so mock registration never lands
// in the registry. This file documents the failure mode; it is expected to fail.
import { expect, it, vi } from "vitest";

vi.mock("./dep.mjs", () => ({ value: "mocked" }));

it("vi.mock via native mocker (known-broken in 4.1.4)", async () => {
  const dep = await import("./dep.mjs");
  expect(dep.value).toBe("mocked");
});
