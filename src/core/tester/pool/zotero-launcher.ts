import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { ResolvedZoteroPoolOptions } from "./options.js";
/**
 * Minimal Zotero launcher for the tester pool: prepares a fresh profile with
 * the tester plugin (and optionally the user's plugin) installed as proxy
 * addons, then spawns Zotero.
 *
 * Note: this intentionally does not use `ZoteroRunner` from
 * `src/utils/zotero-runner.ts` — that class requires the remote debugging
 * server (RDP) for temporary addon installation, which the pool does not need.
 */
import { execSync, spawn } from "node:child_process";
import { join, resolve } from "node:path";
import process from "node:process";
import { ensureDir, outputFile, pathExists, remove } from "fs-extra/esm";

export async function launchZotero(
  options: ResolvedZoteroPoolOptions,
  testerPluginDir: string,
): Promise<ChildProcessWithoutNullStreams> {
  const profile = resolve(options.profileDir);
  await ensureDir(profile);

  // Proxy addons: a file named after the addon id inside the profile's
  // extensions dir, containing the absolute path to the plugin source dir.
  const extensionsDir = join(profile, "extensions");
  await ensureDir(extensionsDir);
  const plugins: Array<[string, string]> = [
    [options.testerPluginId, testerPluginDir],
  ];
  if (options.pluginDir && options.pluginId) {
    plugins.push([options.pluginId, options.pluginDir]);
  }
  for (const [id, sourceDir] of plugins) {
    const proxyFile = join(extensionsDir, id);
    await outputFile(proxyFile, resolve(sourceDir));
    const xpi = `${proxyFile}.xpi`;
    if (await pathExists(xpi)) {
      await remove(xpi);
    }
  }

  // prefs.js — Firefox requires the header comment; without it the whole
  // block is treated as invalid and moved to Invalidprefs.js.
  const prefs: Array<[string, string | number | boolean]> = [
    ["extensions.experiments.enabled", true],
    ["extensions.autoDisableScopes", 0],
    ["extensions.zotero.dataDir", resolve(options.dataDir)],
    ["app.update.enabled", false],
    ["extensions.zotero.automaticScraperUpdates", false],
    ["extensions.zotero.debug.log", 5],
    ["extensions.zotero.debug.level", 5],
    ["extensions.zotero.debug.time", 5],
    ["extensions.zotero.firstRun", false],
    ["extensions.zotero.firstRun2", false],
    ...Object.entries(options.extraPrefs),
  ];
  const prefsPath = join(profile, "prefs.js");
  let existing = "";
  if (await pathExists(prefsPath)) {
    existing = await (await import("node:fs/promises")).readFile(prefsPath, "utf8");
  }
  const lines = prefs
    .map(([k, v]) => `user_pref("${k}", ${JSON.stringify(v)});`)
    .join("\n");
  const header = "# Mozilla User Preferences";
  const body = existing.includes(header) ? existing.trim() : `${header}\n${existing.trim()}`;
  await outputFile(prefsPath, `${body}\n${lines}\n`);

  const args = ["--purgecaches", "no-remote", "-profile", profile];
  if (options.dataDir) {
    args.push("--dataDir", resolve(options.dataDir));
  }
  if (options.args) {
    args.push(...options.args);
  }

  process.stdout.write(`[zotero-pool] launching ${options.zoteroBin} ${args.join(" ")}
`);
  const child = spawn(options.zoteroBin, args, {
    env: { ...process.env, XPCOM_DEBUG_BREAK: "stack" },
  });
  child.stdout?.on("data", () => {});
  child.stderr?.on("data", d => process.stderr.write(`[zotero] ${d}`));
  return child;
}

/** Force-kills Zotero; SIGTERM leaves child processes behind on Windows. */
export function killZotero(): void {
  try {
    if (process.platform === "win32") {
      execSync("taskkill /f /im zotero.exe", { stdio: "ignore" });
    }
    else {
      execSync("pkill -9 zotero", { stdio: "ignore" });
    }
  }
  catch {
    // already exited
  }
}
