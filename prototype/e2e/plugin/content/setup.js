/* eslint-disable */
/**
 * In-page worker runtime for the Zotero vitest pool (e2e prototype).
 *
 * Implements the vitest worker protocol on top of an HTTP transport:
 *   - downlink (server → page): polling GET /poll
 *   - uplink (page → server): POST /post
 * The transport uses Zotero's privileged HTTP client (`Zotero.HTTP.request`),
 * because the chrome:// page's CSP does not reliably allow plain fetch().
 *
 * Message protocol (mirrors vitest's official `init()` from `vitest/worker`):
 *   server → page: { __vitest_worker_request__: true, type: start|run|collect|stop, ... }
 *                  or a raw birpc message (onCancel etc.)
 *   page → server: { __vitest_worker_response__: true, type: started|testfileFinished|stopped, ... }
 *                  or a raw birpc message (onCollected / onTaskUpdate / ...)
 *
 * Test execution reuses vitest's official runner entry points (`startTests` /
 * `collectTests` from `@vitest/runner`) with a minimal `VitestRunner` whose
 * RPC reporting callbacks are patched exactly like vitest's `resolveTestRunner`.
 */

// The vitest runtime chunk (expect / vi / runner / birpc), bundled by rolldown.
import {
  createBirpc, startTests, collectTests, serializeError,
  flattedStringify, flattedParse,
} from "./runtime.js";

// ---------- transport ----------
const PORT = new URLSearchParams(location.search).get("port");
const BASE = `http://127.0.0.1:${PORT}`;

function dump(str) {
  document.querySelector("#status").innerText += str;
  // Mirror page logs to the host for headless debugging.
  httpRequest("POST", "/debug", JSON.stringify({ message: str })).catch(() => {});
}

async function httpRequest(method, path, bodyString) {
  const res = await Zotero.HTTP.request(method, `${BASE}${path}`, {
    body: bodyString,
    headers: { "Content-Type": "application/json" },
  });
  if (res.status !== 200) {
    throw new Error(`${method} ${path} → HTTP ${res.status}`);
  }
  return res.responseText ? res.responseText : undefined;
}

const messageListeners = [];
function onMessage(cb) {
  messageListeners.push(cb);
}

let polling = false;
async function poll() {
  if (polling) return;
  polling = true;
  try {
    const text = await httpRequest("GET", "/poll");
    if (!text) return;
    const messages = JSON.parse(text);
    for (const raw of messages) {
      for (const cb of messageListeners) {
        try {
          cb(raw);
        }
        catch (e) {
          dump("listener error: " + e + "\n");
        }
      }
    }
  }
  catch (e) {
    // server not reachable yet (Zotero booting / host restarting)
  }
  finally {
    polling = false;
  }
}
setInterval(poll, 150);

// Errors don't survive JSON.stringify; convert them explicitly.
function errorReplacer(_key, value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: value.cause instanceof Error ? errorReplacer("", value.cause) : value.cause,
      ...Object.fromEntries(Object.entries(value)),
    };
  }
  return value;
}

async function post(message) {
  try {
    await httpRequest("POST", "/post", flattedStringify(message, errorReplacer));
  }
  catch (e) {
    dump("post error: " + e + "\n");
  }
}

// ---------- rpc (birpc client, mirrors createRuntimeRpc) ----------
const rpcCallbacks = [];
const rpc = createBirpc(
  {
    async onCancel(reason) {
      dump(`[zotero] onCancel(${reason})\n`);
    },
  },
  {
    eventNames: ["onCancel"],
    timeout: -1,
    post: (msg) => post(msg), // raw birpc message (no response marker)
    on: (cb) => rpcCallbacks.push(cb),
    // Task trees contain self-references (file.file); JSON.stringify would
    // throw on cyclic values, so the protocol uses flatted.
    serialize: (value) => flattedStringify(value, errorReplacer),
    deserialize: (value) => (typeof value === "string" ? flattedParse(value) : value),
  },
);

// ---------- worker state (mirrors the state built by execute() in init) ----------
const state = {
  ctx: null,
  config: null,
  rpc,
  evaluatedModules: new Map(),
  resolvingModules: new Set(),
  moduleExecutionInfo: new Map(),
  environment: null,
  durations: { environment: 0, prepare: 0 },
  onCancel: () => {},
  onCleanup: () => {},
  providedContext: {},
  onFilterStackTrace: (stack) => stack,
  metaEnv: {},
};

// ---------- request handling (mirrors init's onMessage) ----------
async function handleRequest(message) {
  switch (message.type) {
    case "start": {
      state.ctx = message.context;
      state.config = message.context.config;
      dump("started\n");
      post({ type: "started", __vitest_worker_response__: true });
      break;
    }
    case "run":
    case "collect": {
      const isCollect = message.type === "collect";
      state.ctx = { ...state.ctx, ...message.context };
      state.filepath = undefined;
      try {
        await runMethod(state.ctx, isCollect);
        post({ type: "testfileFinished", __vitest_worker_response__: true });
      }
      catch (error) {
        post({
          type: "testfileFinished",
          __vitest_worker_response__: true,
          error: serializeError(error),
        });
      }
      break;
    }
    case "stop": {
      dump("stopped\n");
      post({ type: "stopped", __vitest_worker_response__: true });
      break;
    }
  }
}

function dispatch(raw) {
  const message = typeof raw === "string" ? flattedParse(raw) : raw;
  if (message && message.__vitest_worker_request__ === true) {
    handleRequest(message).catch((e) => dump("request error: " + e + "\n"));
  }
  else {
    for (const cb of rpcCallbacks) {
      try {
        cb(message);
      }
      catch (e) {
        dump("rpc callback error: " + e + "\n");
      }
    }
  }
}
onMessage(dispatch);

// ---------- test runner (mirrors the patching in resolveTestRunner) ----------
class ZoteroVitestRunner {
  constructor(config) {
    this.config = {
      root: config.root || "/",
      setupFiles: [],
      name: undefined,
      passWithNoTests: false,
      testNamePattern: undefined,
      allowOnly: true,
      sequence: config.sequence || {
        shuffle: false,
        concurrent: false,
        seed: 0,
        hooks: "stack",
        setupFiles: "parallel",
      },
      chaiConfig: undefined,
      maxConcurrency: 10,
      testTimeout: config.testTimeout || 5000,
      hookTimeout: config.hookTimeout || 10000,
      retry: 0,
      includeTaskLocation: false,
      diffOptions: undefined,
      tags: [],
      tagsFilter: undefined,
      strictTags: false,
      pool: "zotero",
      viteEnvironment: "node",
    };
    this.pool = "zotero";
    this.viteEnvironment = "node";
    this._importDurations = new Map();
  }

  // Test files are pre-bundled by rolldown; map the source path to the
  // bundled artifact and bust the ESM cache with a timestamp query.
  async importFile(filepath) {
    const start = performance.now();
    const rel = __TEST_MANIFEST__[filepath];
    if (!rel) {
      throw new Error(`No bundled artifact for ${filepath}`);
    }
    dump("importing " + rel + "\n");
    try {
      await import(`./${rel}`);
    }
    catch (e) {
      dump("import failed: " + e + "\n");
      throw e;
    }
    dump("imported " + rel + "\n");
    this._importDurations.set(filepath, { start, end: performance.now() });
  }

  getImportDurations() {
    return Object.fromEntries(this._importDurations);
  }
}

function patchRunner(runner) {
  const originalOnTaskUpdate = runner.onTaskUpdate;
  runner.onTaskUpdate = async (tasks, events) => {
    const p = rpc.onTaskUpdate(tasks, events);
    await originalOnTaskUpdate?.call(runner, tasks, events);
    return p;
  };

  const originalOnCollectStart = runner.onCollectStart;
  runner.onCollectStart = async (file) => {
    await rpc.onQueued(file);
    await originalOnCollectStart?.call(runner, file);
  };

  const originalOnCollected = runner.onCollected;
  runner.onCollected = async (files) => {
    files.forEach((file) => {
      file.prepareDuration = state.durations.prepare;
      file.environmentLoad = state.durations.environment;
      state.durations.prepare = 0;
      state.durations.environment = 0;
    });
    const sanitizeRetryConditions = (task) => {
      if (task.retry && typeof task.retry === "object" && typeof task.retry.condition === "function") {
        task.retry = { ...task.retry, condition: undefined };
      }
      if (task.tasks) task.tasks.forEach(sanitizeRetryConditions);
    };
    files.forEach(sanitizeRetryConditions);
    rpc.onCollected(files);
    await originalOnCollected?.call(runner, files);
  };
}

async function runMethod(context, isCollect) {
  const runner = new ZoteroVitestRunner(state.config);
  patchRunner(runner);
  if (isCollect) {
    const files = await collectTests(context.files, runner);
    await runner.onCollected?.(files);
  }
  else {
    await startTests(context.files, runner);
  }
}

// ---------- ready handshake ----------
httpRequest("POST", "/ready").catch((e) => dump("ready error: " + e + "\n"));
dump("setup loaded, polling " + BASE + "\n");
