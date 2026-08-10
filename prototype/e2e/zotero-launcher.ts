/**
 * Minimal Zotero launcher for the e2e prototype: prepares a profile with the
 * tester plugin installed as a proxy addon and spawns Zotero.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { join, resolve } from "node:path";
import { ensureDir, outputFile, pathExists, remove } from "fs-extra/esm";

export interface LaunchOptions {
  binary: string;
  profileDir: string;
  dataDir: string;
  pluginDir: string;
  pluginId: string;
  args?: string[];
}

export async function launchZotero(opts: LaunchOptions): Promise<ChildProcessWithoutNullStreams> {
  const profile = resolve(opts.profileDir);
  await ensureDir(profile);

  // Proxy addon: a file named after the addon id inside the profile's
  // extensions dir, containing the absolute path to the plugin source dir.
  const extensionsDir = join(profile, "extensions");
  await ensureDir(extensionsDir);
  const proxyFile = join(extensionsDir, opts.pluginId);
  await outputFile(proxyFile, resolve(opts.pluginDir));
  const xpi = proxyFile + ".xpi";
  if (await pathExists(xpi)) {
    await remove(xpi);
  }

  // prefs.js
  const prefs = [
    ["extensions.experiments.enabled", true],
    ["extensions.autoDisableScopes", 0],
    ["extensions.zotero.dataDir", resolve(opts.dataDir)],
    ["app.update.enabled", false],
    ["extensions.zotero.automaticScraperUpdates", false],
    ["extensions.zotero.debug.log", 5],
    ["extensions.zotero.debug.level", 5],
    ["extensions.zotero.debug.time", 5],
    ["extensions.lastAppBuildId", null],
    ["extensions.lastAppVersion", null],
    [  "extensions.zotero.firstRun.skipFirefoxProfileAccessCheck", true],
  ["extensions.zotero.firstRunGuidance", false],
  ["extensions.zotero.firstRun2", false,]
  ];
  const prefsPath = join(profile, "prefs.js");
  let existing = "";
  if (await pathExists(prefsPath)) {
    existing = await (await import("node:fs/promises")).readFile(prefsPath, "utf8");
  }
  const lines = prefs
    .map(([k, v]) => `user_pref("${k}", ${JSON.stringify(v)});`)
    .join("\n");
  const HEADER = "# Mozilla User Preferences\n";
  const body = existing.includes(HEADER) ? existing.trim() : HEADER + existing.trim();
  await outputFile(prefsPath, body + "\n" + lines + "\n");

  const args = ["--purgecaches", "--jsdebugger","no-remote", "-profile", profile];
  if (opts.dataDir) {
    args.push("--dataDir", resolve(opts.dataDir));
  }
  if (opts.args) {
    args.push(...opts.args);
  }

  console.log(`[zotero-pool] launching ${opts.binary} ${args.join(" ")}`);
  const child = spawn(opts.binary, args, {
    env: { ...process.env, XPCOM_DEBUG_BREAK: "stack" },
  });
  child.stdout?.on("data", () => {});
  child.stderr?.on("data", (d) => process.stderr.write(`[zotero] ${d}`));
  return child;
}
