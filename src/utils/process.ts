import { execSync } from "node:child_process";
import { createServer } from "node:net";
import process from "node:process";

/**
 * Check whether `port` can be bound on `host`.
 *
 * Used to warn about a port that another process (e.g. the developer's daily Zotero) already
 * occupies, instead of letting Zotero silently skip starting its HTTP server.
 */
export async function isTcpPortAvailable(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

export function isRunning(query: string): boolean {
  let cmd = "";
  switch (process.platform) {
    case "win32":
      cmd = `tasklist`;
      break;
    case "darwin":
      cmd = `ps -ax | grep ${query}`;
      break;
    case "linux":
      cmd = `ps -A`;
      break;
    default:
      break;
  }

  try {
    const stdout = execSync(cmd, { encoding: "utf8" });
    return stdout.toLowerCase().includes(query.toLowerCase());
  }
  catch {
    return false;
  }
}

export const ExitSignals = ["exit", "SIGABRT", "SIGALRM", "SIGHUP", "SIGINT", "SIGTERM"] as const;

export function whenExit(cb: (_code: number | string) => any): void {
  ExitSignals.forEach((signal) => {
    process.once(
      signal,
      _code => cb(_code),
    );
  });
}
