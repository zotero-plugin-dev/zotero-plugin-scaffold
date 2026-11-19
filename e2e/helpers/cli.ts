import type { Buffer } from "node:buffer";
import type { ChildProcess } from "node:child_process";
import { execFile, spawn as spawnProcess } from "node:child_process";
import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const E2E_ROOT: string = resolve(dirname(fileURLToPath(import.meta.url)), "..");

try {
  process.loadEnvFile(resolve(E2E_ROOT, ".env"));
}
catch {
  // No file: CI provides the variables.
}

export const SCAFFOLD_PACKAGE_DIR: string = realpathSync(
  fileURLToPath(new URL("../node_modules/zotero-plugin-scaffold", import.meta.url)),
);

export type ScaffoldBin = "zobuild" | "zodev" | "zotest" | "zorelease" | "zotero-plugin";

export interface CliOptions {
  cwd: string;
  env?: Record<string, string | undefined>;
}

export interface CliResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

export function binPath(bin: ScaffoldBin): string {
  return resolve(SCAFFOLD_PACKAGE_DIR, "bin", `${bin}.mjs`);
}

// `ZOTERO_PLUGIN_PROFILE_PATH`/`_DATA_DIR` are dropped unless a test sets them:
// a run must stay inside `.tmp/<case>/`, never a developer's own profile.
function cliEnv(extra: CliOptions["env"]): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    ...extra,
  };

  if (!extra || !("ZOTERO_PLUGIN_PROFILE_PATH" in extra))
    delete env.ZOTERO_PLUGIN_PROFILE_PATH;
  if (!extra || !("ZOTERO_PLUGIN_DATA_DIR" in extra))
    delete env.ZOTERO_PLUGIN_DATA_DIR;

  return env;
}

/** `bin/*.mjs` through `process.execPath`: the `.cmd` shim needs a shell. */
export function runCli(
  bin: ScaffoldBin,
  args: string[],
  options: CliOptions & { timeoutMs?: number },
): Promise<CliResult> {
  const { cwd, env, timeoutMs } = options;

  return new Promise((resolvePromise) => {
    execFile(
      process.execPath,
      [
        binPath(bin),
        ...args,
      ],
      {
        cwd,
        env: cliEnv(env),
        timeout: timeoutMs,
        killSignal: "SIGTERM",
        maxBuffer: 32 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const status = error as { code?: number | null; signal?: NodeJS.Signals | null } | null;

        resolvePromise({
          code: status
            ? status.code ?? null
            : 0,
          signal: status?.signal ?? null,
          stdout,
          stderr,
        });
      },
    );
  });
}

export interface CliProcess {
  child: ChildProcess;
  stdout: () => string;
  stderr: () => string;
  exited: Promise<CliResult>;
  waitFor: (pattern: RegExp, timeoutMs?: number) => Promise<string>;
}

export function startCli(bin: ScaffoldBin, args: string[], options: CliOptions): CliProcess {
  return startCommand(process.execPath, [
    binPath(bin),
    ...args,
  ], options);
}

export function startCommand(command: string, args: string[], options: CliOptions): CliProcess {
  const child = spawnProcess(command, args, {
    cwd: options.cwd,
    env: cliEnv(options.env),
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const exited = new Promise<CliResult>((resolvePromise) => {
    child.on("close", (code, signal) => {
      resolvePromise({ code, signal, stdout, stderr });
    });
  });

  return {
    child,
    stdout: () => stdout,
    stderr: () => stderr,
    exited,
    waitFor: (pattern, timeoutMs = 120_000) => waitForOutput(() => stdout, pattern, timeoutMs),
  };
}

function waitForOutput(
  read: () => string,
  pattern: RegExp,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    const startedAt = Date.now();

    const check = (): void => {
      const match = read().match(pattern);
      if (match) {
        resolvePromise(match[0]);
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        rejectPromise(new Error(`Timed out waiting for ${pattern}.\nOutput so far:\n${read()}`));
        return;
      }

      setTimeout(check, 50);
    };

    check();
  });
}
