import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

// Each check spawns PowerShell on Windows (~0.9 s), so call it sparingly.
function isWindows(): boolean {
  return process.platform === "win32";
}

/** The PIDs of the Zotero processes using a profile. */
export function zoteroPidsOnProfile(profileDir: string): number[] {
  const profile = resolve(profileDir).replaceAll("'", "''");

  try {
    if (isWindows()) {
      const script = [
        "$ProgressPreference = 'SilentlyContinue'; ",
        `Get-CimInstance Win32_Process -Filter "Name='zotero.exe'" `,
        `| Where-Object { $_.CommandLine -like '*${profile}*' } `,
        "| ForEach-Object { $_.ProcessId }",
      ].join("");

      const out = execFileSync("powershell", [
        "-NoProfile",
        "-EncodedCommand",
        Buffer.from(script, "utf16le").toString("base64"),
      ], { encoding: "utf8" });

      return out.split(/\s+/).filter(Boolean).map(Number).filter(pid => pid > 0);
    }

    const out = execFileSync("pgrep", ["-f", profile], { encoding: "utf8" });
    return out.split(/\s+/).filter(Boolean).map(Number).filter(pid => pid > 0);
  }
  catch {
    return [];
  }
}

/** Kill the Zotero processes of a profile. Mirrors the runner's own helper. */
export function killZoteroByProfile(profileDir: string): void {
  const profile = resolve(profileDir).replaceAll("'", "''");

  try {
    if (isWindows()) {
      const script = [
        "$ProgressPreference = 'SilentlyContinue'; ",
        "$all = Get-CimInstance Win32_Process -Filter \"Name='zotero.exe'\"; ",
        "$ids = @{}; ",
        "$all | ForEach-Object { $ids[$_.ProcessId] = $true }; ",
        `$all | Where-Object { $_.CommandLine -like '*${profile}*' } `,
        "| ForEach-Object { taskkill /f /t /pid $_.ProcessId 2>$null | Out-Null }; ",
        // Orphaned content processes no longer carry the profile path, yet they
        "$all | Where-Object { $_.CommandLine -like '*-contentproc*' -and -not $ids[$_.ParentProcessId] } ",
        "| ForEach-Object { taskkill /f /pid $_.ProcessId 2>$null | Out-Null };",
      ].join("");
      const encoded = Buffer.from(script, "utf16le").toString("base64");
      execFileSync("powershell", ["-NoProfile", "-EncodedCommand", encoded], { stdio: "ignore" });
      return;
    }

    execFileSync("pkill", ["-9", "-f", profile], { stdio: "ignore" });
  }
  catch {
  }
}

/** True once nothing uses the profile; killing is asynchronous. */
export async function waitForZoteroExit(profileDir: string, timeoutMs = 10_000): Promise<boolean> {
  if (zoteroPidsOnProfile(profileDir).length === 0)
    return true;

  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    await new Promise(resolvePromise => setTimeout(resolvePromise, 200));
    if (zoteroPidsOnProfile(profileDir).length === 0)
      return true;
  }

  return false;
}

export function defaultProfileOf(projectDir: string, kind: "dev" | "test" = "dev"): string {
  return resolve(projectDir, ...(kind === "dev"
    ? [".scaffold", "profile"]
    : [".scaffold", "test", "profile"]));
}
