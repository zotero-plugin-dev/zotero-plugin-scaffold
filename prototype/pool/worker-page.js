/**
 * "Zotero page" side of the prototype: hosts vitest's official worker runtime
 * (`init` from `vitest/worker`) on top of an arbitrary transport. In the real
 * integration this file becomes part of the tester plugin loaded inside the
 * chrome:// page, with `post`/`on` backed by HTTP or WebSocket instead of IPC.
 *
 * Key claims verified here:
 * 1. `init()` accepts a custom transport (`post`/`on`/`off`).
 * 2. Official `runBaseTests` works WITHOUT a vite module graph when
 *    `experimental.viteModuleRunner: false` (NativeModuleRunner path).
 * 3. Results flow back through `post`, and vitest's native reporters drive
 *    from them — no duck-typed TestModule/TestCase, no fake ctx.
 */
import { init, runBaseTests, setupEnvironment } from "vitest/worker";

init({
  post: (msg) => {
    process.send?.(msg);
  },
  on: (cb) => {
    process.on("message", cb);
  },
  off: (cb) => {
    process.off("message", cb);
  },
  setup: (ctx) => setupEnvironment(ctx),
  runTests: (state, traces) => runBaseTests("run", state, traces),
  collectTests: (state, traces) => runBaseTests("collect", state, traces),
});
