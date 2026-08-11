import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { RecursivePickOptional, RecursiveRequired } from "../types/utils.js";
import { Buffer } from "node:buffer";
import { execSync, spawn } from "node:child_process";
import { closeSync, openSync, writeSync } from "node:fs";
import { readdir, stat, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import { delay, toMerged } from "es-toolkit";
import { ensureDir, ensureDirSync, outputFile, outputJSON, pathExists, readJSON, remove } from "fs-extra/esm";
import { isLinux, isMacOS, isWindows } from "std-env";
import { ZOTERO_LOG_DIR } from "../constant.js";
import { logger } from "./logger.js";
import { PrefsManager } from "./prefs-manager.js";
import { isRunning } from "./process.js";
import { dateFormat } from "./string.js";
import { ANSI_ESCAPE_RE, createMessageNormalizer } from "./zotero/log-normalizer.js";
import { prefs as defaultPrefs } from "./zotero/preference.js";
import { findFreeTcpPort, RemoteFirefox } from "./zotero/remote-zotero.js";

export interface ZoteroRunnerOptions {
  binary: BinaryOptions;
  profile: ProfileOptions;
  plugins: PluginsOptions;
}

interface ProfileOptions {
  path?: string;
  dataDir?: string;
  // keepChanges?: boolean;
  createIfMissing?: boolean;
  customPrefs?: Record<string, string | number | boolean>;
}

interface BinaryOptions {
  path: string;
  args?: string[];
  devtools?: boolean;
  debugOutputWindow?: boolean;
  debugOutputFile?: boolean;
  /**
   * Connect to the remote Firefox debugger server (RDP). Defaults to
   * `!plugins.asProxy` — proxy addons are installed via profile files and
   * need no RDP. Set explicitly to override the derivation.
   */
  connectRDP?: boolean;
}

interface PluginsOptions {
  asProxy?: boolean;
  list: PluginInfo[];
}

interface PluginInfo {
  id: string;
  sourceDir: string;
}

type InternalZoteroRunnerOptions = RecursiveRequired<ZoteroRunnerOptions>;
type DefaultZoteroRunnerOptions = RecursivePickOptional<ZoteroRunnerOptions>;

const default_options = {
  binary: {
    // path: "",
    args: [],
    devtools: true,
    debugOutputWindow: false,
    debugOutputFile: false,
  },
  profile: {
    path: "./.scaffold/profile",
    dataDir: "",
    // keepChanges: true,
    createIfMissing: true,
    customPrefs: {},
  },
  plugins: {
    asProxy: false,
    list: [],
  },
} satisfies DefaultZoteroRunnerOptions;

export class ZoteroRunner {
  private options: InternalZoteroRunnerOptions;
  private remoteFirefox = new RemoteFirefox();
  public zotero?: ChildProcessWithoutNullStreams;

  constructor(options: ZoteroRunnerOptions) {
    this.options = toMerged(default_options, options) as InternalZoteroRunnerOptions;

    if (!options.binary.path)
      throw new Error("Binary path must be provided.");

    // if (options.profile.path === this.default_profile_path && !options.profile.keepChanges)
    //   logger.warn("Profile at '.scaffold/profile' does not support discarding changes.");

    if (!options.profile.path && !options.profile.dataDir)
      this.options.profile.dataDir = "./.scaffold/data";

    logger.debug(this.options);
  }

  /**
   * Whether to start and connect to the remote debugger server.
   * Defaults to `!asProxy`: proxy addons are installed via profile files and
   * need no RDP; temporary addons are installed over RDP. Explicitly set
   * `binary.connectRDP` to override (e.g. asProxy with a debug session).
   */
  private get connectRDP(): boolean {
    return this.options.binary.connectRDP ?? !this.options.plugins.asProxy;
  }

  get default_profile_path(): string {
    return default_options.profile.path;
  }

  async run(): Promise<void> {
    // Get a Zotero profile with the custom Prefs set (a new or a cloned one)
    // Pre-install extensions as proxy if needed (and disable auto-reload if you do)
    await this.setupProfile();

    // Start Zotero process and connect to the Zotero instance on RDP
    await this.startZoteroInstance();

    // Install any extension if not in proxy mode
    if (!this.options.plugins.asProxy)
      await this.installTemporaryPlugins();
  }

  /**
   * Preparing the development environment
   *
   * When asProxy=true, generate a proxy file and replace prefs.
   *
   * @see https://www.zotero.org/support/dev/client_coding/plugin_development#setting_up_a_plugin_development_environment
   */
  private async setupProfile() {
    const { path, createIfMissing } = this.options.profile;

    // Ensure profile
    if (!await pathExists(path)) {
      if (createIfMissing)
        await this.createProfile(this.default_profile_path);
      else
        throw new Error("The 'profile.path' must be provided when 'createIfMissing' is false.");
    }

    // const dataDir = prefsManager.getPref("extensions.zotero.dataDir");
    // if (!keepChanges && path !== this.default_profile_path) {
    //   await this.copyProfile(path);
    //   if (dataDir)
    //     await this.copyProfile(dataDir as string, this.default_data_dir);
    // }

    // Setup prefs.js
    const prefsPath = join(this.options.profile.path, "prefs.js");
    const prefsManager = new PrefsManager("user_pref");
    prefsManager.setPrefs(defaultPrefs);
    if (await pathExists(prefsPath))
      await prefsManager.read(prefsPath);
    prefsManager.setPrefs(this.options.profile.customPrefs);
    prefsManager.setPrefs({
      "extensions.lastAppBuildId": null,
      "extensions.lastAppVersion": null,
    });
    await prefsManager.write(prefsPath);

    // Install plugins in proxy file mode
    if (this.options.plugins.asProxy) {
      await this.installProxyPlugins();
    }
  }

  private async createProfile(path: string) {
    logger.debug(`Creating profile at ${this.default_profile_path}...`);
    await ensureDir(path);
  }

  // private async copyProfile(from: string, to = this.default_profile_path) {
  //   logger.debug(`Copying profile from '${this.options.profile.path}' to ${this.default_profile_path}...`);
  //   await copy(from, to);
  //   this.options.profile.path = to;
  // }

  private async startZoteroInstance() {
    // Build args
    let args: string[] = ["--purgecaches", "no-remote"];
    if (this.options.profile.path) {
      args.push("-profile", resolve(this.options.profile.path));
    }
    if (this.options.profile.dataDir) {
      // '--dataDir' required absolute path
      args.push("--dataDir", resolve(this.options.profile.dataDir));
    }
    if (this.options.binary.devtools) {
      args.push("--jsdebugger");
    }
    // `-ZoteroDebug` (forceDebugLog=2) opens the Debug Output window when requested
    if (this.options.binary.debugOutputWindow) {
      args.push("-ZoteroDebug");
    }
    // `-ZoteroDebugText` (forceDebugLog=1) makes `Zotero.debug()` / `dump()` output go to stdout.
    if (this.options.binary.debugOutputFile) {
      args.push("-ZoteroDebugText");
    }
    if (this.options.binary.args) {
      args = [...args, ...this.options.binary.args];
    }

    // support for starting the remote debugger server
    const remotePort = await findFreeTcpPort();
    if (this.connectRDP) {
      args.push("-start-debugger-server", String(remotePort));
    }

    logger.debug(`Zotero start args: ${args}`);

    const env = {
      ...process.env,
      XPCOM_DEBUG_BREAK: "stack",
      NS_TRACE_MALLOC_DISABLE_STACKS: "1",
    };

    if (!await pathExists(this.options.binary.path))
      throw new Error("The Zotero binary not found.");

    // Using `spawn` so we can stream logging as they come in, rather than
    // buffer them up until the end, which can easily hit the max buffer size.
    this.zotero = spawn(this.options.binary.path, args, { env });
    logger.debug(`Zotero started, pid: ${this.zotero.pid}`);

    if (this.options.binary.debugOutputFile) {
      ensureDirSync(ZOTERO_LOG_DIR);
      void cleanupOldLogs(ZOTERO_LOG_DIR);

      const time = dateFormat("YYYYmmdd-HHMMSS", new Date());
      const outPath = join(ZOTERO_LOG_DIR, `zotero-${time}.log`);
      const errPath = join(ZOTERO_LOG_DIR, `zotero-${time}-stderr.log`);
      const outFd = openSync(outPath, "a");
      const errFd = openSync(errPath, "a");

      logger.info(`Zotero output logs: ${outPath} / ${errPath}`);

      const stdoutNormalizer = createMessageNormalizer(line => writeSync(outFd, `${line}\n`));
      const stderrDecoder = new TextDecoder("utf-8");
      this.zotero.stdout?.on("data", data => stdoutNormalizer.push(data));
      this.zotero.stderr?.on("data", (data) => {
        const text = stderrDecoder.decode(data, { stream: true }).replace(ANSI_ESCAPE_RE, "");
        writeSync(errFd, text);
      });
      this.zotero.on("close", () => {
        stdoutNormalizer.flush();
        const stderrTail = stderrDecoder.decode();
        if (stderrTail)
          writeSync(errFd, stderrTail.replace(ANSI_ESCAPE_RE, ""));
        closeSync(outFd);
        closeSync(errFd);
      });
    }
    else {
      // Always consume stdout/stderr (even when logging is off) to avoid
      // blocking Zotero on a full pipe buffer.
      this.zotero.stdout?.on("data", () => {});
      this.zotero.stderr?.on("data", () => {});
    }

    if (this.connectRDP) {
      logger.debug("Connecting to the remote Firefox debugger...");
      await this.remoteFirefox.connect(remotePort);
      logger.debug(`Connected to the remote Firefox debugger on port: ${remotePort}`);
    }
  }

  private async installTemporaryPlugins() {
    // Install all the temporary addons.
    for (const plugin of this.options.plugins.list) {
      const addonId = await this.remoteFirefox
        .installTemporaryAddon(resolve(plugin.sourceDir))
        .then((installResult) => {
          return installResult.addon.id;
        });

      if (!addonId) {
        throw new Error("Unexpected missing addonId in the installAsTemporaryAddon result");
      }
    }
  }

  private async installProxyPlugin(id: string, sourceDir: string) {
    // Create a proxy file
    const addonProxyFilePath = join(this.options.profile.path, `extensions/${id}`);
    const buildPath = resolve(sourceDir);

    await outputFile(addonProxyFilePath, buildPath);
    logger.debug(
      [
        `Addon proxy file has been updated.`,
        `  File path: ${addonProxyFilePath}`,
        `  Addon path: ${buildPath}`,
      ].join("\n"),
    );

    // Delete XPI file
    const addonXpiFilePath = join(this.options.profile.path, `extensions/${id}.xpi`);
    if (await pathExists(addonXpiFilePath)) {
      await remove(addonXpiFilePath);
      logger.debug(`XPI file found, removed.`);
    }

    // Force enable plugin in extensions.json
    const addonInfoFilePath = join(this.options.profile.path, "extensions.json");
    if (await pathExists(addonInfoFilePath)) {
      const content = await readJSON(addonInfoFilePath);
      content.addons = content.addons.map((addon: any) => {
        if (addon.id === id && addon.active === false) {
          addon.active = true;
          addon.userDisabled = false;
          logger.debug(`Active plugin ${id} in extensions.json.`);
        }
        return addon;
      });
      await outputJSON(addonInfoFilePath, content);
    }
  }

  private async installProxyPlugins() {
    for (const { id, sourceDir } of this.options.plugins.list) {
      await this.installProxyPlugin(id, sourceDir);
    }
  }

  public async reloadTemporaryPluginById(id: string): Promise<void> {
    await this.remoteFirefox.reloadAddon(id);
  }

  public async reloadTemporaryPluginBySourceDir(sourceDir: string): Promise<{
    sourceDir: string;
    reloadError: unknown;
  }> {
    const addonId = this.options.plugins.list.find(p => p.sourceDir === sourceDir)?.id;

    if (!addonId) {
      return {
        sourceDir,
        reloadError: new Error(
          "Extension not reloadable: "
          + `no addonId has been mapped to "${sourceDir}"`,
        ),
      };
    }

    try {
      await this.remoteFirefox.reloadAddon(addonId);
    }
    catch (error) {
      return {
        sourceDir,
        reloadError: error,
      };
    }

    return { sourceDir, reloadError: undefined };
  }

  private async reloadAllTemporaryPlugins() {
    for (const { sourceDir } of this.options.plugins.list) {
      const res = await this.reloadTemporaryPluginBySourceDir(sourceDir);
      if (res.reloadError instanceof Error) {
        logger.error(res.reloadError);
      }
    }
  }

  public async reloadProxyPluginByZToolkit(id: string, name: string, version: string): Promise<void> {
    const reloadScript = `
    (async () => {
    Services.obs.notifyObservers(null, "startupcache-invalidate", null);
    const { AddonManager } = ChromeUtils.import("resource://gre/modules/AddonManager.jsm");
    const addon = await AddonManager.getAddonByID("${id}");
    await addon.reload();
    const progressWindow = new Zotero.ProgressWindow({ closeOnClick: true });
    progressWindow.changeHeadline("${name} Hot Reload");
    progressWindow.progress = new progressWindow.ItemProgress(
        "chrome://zotero/skin/tick.png",
        "VERSION=${version}, BUILD=${new Date().toLocaleString()}. By zotero-plugin-toolkit"
    );
    progressWindow.progress.setProgress(100);
    progressWindow.show();
    progressWindow.startCloseTimer(5000);
    })()`;
    const url = `zotero://ztoolkit-debug/?run=${encodeURIComponent(
      reloadScript,
    )}`;
    const startZoteroCmd = `"${this.options.binary.path}" --purgecaches -profile "${this.options.profile.path}"`;
    const command = `${startZoteroCmd} -url "${url}"`;
    execSync(command);
  }

  // Do not use this method if possible,
  // as frequent execSync can cause Zotero to crash.
  private async reloadAllProxyPlugins() {
    for (const { id } of this.options.plugins.list) {
      await this.reloadProxyPluginByZToolkit(id, id, id);
      await delay(2000);
    }
  }

  public async reloadAllPlugins(): Promise<void> {
    if (this.options.plugins.asProxy)
      await this.reloadAllProxyPlugins();
    else
      await this.reloadAllTemporaryPlugins();
  }

  /**
   * True if a zotero process using this runner's profile is still running.
   * Instance-level wrapper over isZoteroRunningByProfile — callers that
   * hold a runner (e.g. the pool's watch takeover) should use this instead
   * of re-deriving the profile path.
   */
  public isRunning(): boolean {
    return isZoteroRunningByProfile(resolve(this.options.profile.path));
  }

  public exit(): void {
    const child = this.zotero;
    const pid = child?.pid;
    child?.kill();
    // Zotero restarts itself on first launch (setupProfile nulls
    // extensions.lastAppBuildId/lastAppVersion, forcing an "update" restart),
    // so the spawned PID may already be gone. Kill every instance whose
    // command line uses our profile — an image-wide kill (taskkill /im
    // zotero.exe) would take down sibling instances of parallel projects.
    killZoteroByProfile(resolve(this.options.profile.path));
    // Belt & suspenders: force-kill the original PID if it survived.
    if (pid && isPidAlive(pid)) {
      try {
        if (process.env.ZOTERO_PLUGIN_KILL_COMMAND) {
          execSync(process.env.ZOTERO_PLUGIN_KILL_COMMAND);
        }
        else if (isWindows) {
          execSync(`taskkill /f /pid ${pid}`);
        }
        else if (isMacOS || isLinux) {
          execSync(`kill -9 ${pid}`);
        }
        else {
          logger.error("No commands found for this operating system.");
        }
      }
      catch {
        logger.fail("Kill Zotero failed.");
      }
    }
  }
}

/** True while the OS still reports the given PID. */
function isPidAlive(pid: number): boolean {
  try {
    if (process.platform === "win32") {
      const out = execSync(`tasklist /fi "PID eq ${pid}" /nh`, { encoding: "utf8" });
      return out.includes(String(pid));
    }
    execSync(`kill -0 ${pid}`);
    return true;
  }
  catch {
    return false;
  }
}

/**
 * True if a zotero process whose command line references the profile path is
 * still running. Used by the pool to decide whether a soft-stopped (watch
 * mode) instance can be taken over by the next worker.
 */
export function isZoteroRunningByProfile(profilePath: string): boolean {
  try {
    if (isWindows) {
      const escaped = profilePath.replaceAll("'", "''");
      const script = `$ProgressPreference = 'SilentlyContinue'; `
        + `[bool](Get-CimInstance Win32_Process -Filter "Name='zotero.exe'" `
        + `| Where-Object { $_.CommandLine -like '*${escaped}*' })`;
      const encoded = Buffer.from(script, "utf16le").toString("base64");
      const out = execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, { encoding: "utf8" });
      return out.trim().endsWith("True");
    }
    execSync(`pgrep -f "${profilePath}"`, { stdio: "ignore" });
    return true;
  }
  catch {
    return false;
  }
}

/**
 * Kills every zotero process whose command line references the profile path.
 * Exported so the pool can clear leftovers before a cold boot (e.g. a
 * soft-stopped instance whose takeover failed, or a force-killed watch
 * session's zombie).
 */
export function killZoteroByProfile(profilePath: string): void {
  try {
    if (process.env.ZOTERO_PLUGIN_KILL_COMMAND) {
      execSync(process.env.ZOTERO_PLUGIN_KILL_COMMAND);
    }
    else if (isWindows) {
      // -EncodedCommand (UTF-16LE base64) avoids the nested-quote mangling
      // that execSync → cmd.exe would inflict on a plain -Command string.
      const escaped = profilePath.replaceAll("'", "''");
      // Plain string segments (NOT one template literal): eslint --fix once
      // re-flowed a comment inside `${ ... }` into a unary-plus template
      // (`` ${+`...`} ``), which evaluated to NaN and broke the script —
      // the error was swallowed and Zotero survived shutdown.
      const script = [
        "$ProgressPreference = 'SilentlyContinue'; ",
        "$all = Get-CimInstance Win32_Process -Filter \"Name='zotero.exe'\"; ",
        "$ids = @{}; ",
        "$all | ForEach-Object { $ids[$_.ProcessId] = $true }; ",
        // kill the profile's main process with its whole tree, plus
        // orphaned content processes whose main process is already gone
        // (their command line has no profile path, so the filter above
        // cannot see them — they hold profile locks and break the next boot)
        `$all | Where-Object { $_.CommandLine -like '*${escaped}*' } `,
        "| ForEach-Object { taskkill /f /t /pid $_.ProcessId 2>$null | Out-Null }; ",
        "$all | Where-Object { $_.CommandLine -like '*-contentproc*' -and -not $ids[$_.ParentProcessId] } ",
        "| ForEach-Object { taskkill /f /pid $_.ProcessId 2>$null | Out-Null };",
      ].join("");
      const encoded = Buffer.from(script, "utf16le").toString("base64");
      execSync(`powershell -NoProfile -EncodedCommand ${encoded}`);
    }
    else if (isMacOS || isLinux) {
      execSync(`pkill -9 -f "${profilePath}"`);
      // Linux: content processes share the profile path in /proc cmdline
      // (unlike Windows), so pkill -f already covers them.
    }
  }
  catch {
    // no matching process (already dead) — not an error
  }
}

/**
 * Kills every running Zotero instance. Only used as a manual cleanup helper
 * (e.g. before a run starts); `ZoteroRunner.exit()` targets its own profile.
 */
export function killZotero(): void {
  function kill() {
    try {
      if (process.env.ZOTERO_PLUGIN_KILL_COMMAND) {
        execSync(process.env.ZOTERO_PLUGIN_KILL_COMMAND);
      }
      else if (isWindows) {
        execSync("taskkill /f /im zotero.exe");
      }
      else if (isMacOS) {
        execSync("kill -9 $(ps -x | grep zotero)");
      }
      else if (isLinux) {
        execSync("pkill -9 zotero");
      }
      else {
        logger.error("No commands found for this operating system.");
      }
    }
    catch {
      logger.fail("Kill Zotero failed.");
    }
  }

  if (isRunning("zotero")) {
    kill();
  }
  else {
    logger.fail("No Zotero instance is currently running.");
  }
}

/**
 * Remove Zotero log files (matching `zotero-*.log`) in `dir` that are
 * older than 7 days (fixed, not configurable). Only files matching the
 * scaffold naming are touched; missing directories and vanished files are
 * ignored.
 */
export async function cleanupOldLogs(dir: string): Promise<void> {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let names: string[];
  try {
    names = await readdir(dir);
  }
  catch {
    return;
  }
  await Promise.all(names
    .filter(name => name.startsWith("zotero-") && name.endsWith(".log"))
    .map(async (name) => {
      try {
        if ((await stat(join(dir, name))).mtimeMs < cutoff)
          await unlink(join(dir, name));
      }
      catch {
        // The file may be gone by now (removed concurrently)
      }
    }));
}
