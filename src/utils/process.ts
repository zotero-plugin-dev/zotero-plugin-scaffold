import { execSync } from "node:child_process";
import process from "node:process";

export function isRunning(query: string) {
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

export const ExitSignals = ["exit", "SIGABRT", "SIGALRM", "SIGHUP", "SIGINT", "SIGTERM"];

export function whenExit(cb: (_code: number, _signal: string) => any) {
  ExitSignals.forEach((signal) => {
    process.once(
      signal,
      (_code, _signal) => cb(_code, _signal),
    );
  });
}
