import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { RecursivePickOptional, RecursiveRequired } from "../types/utils.js";
import { execSync, spawn } from "node:child_process";
import { join, resolve } from "node:path";
import process from "node:process";
import { delay, toMerged } from "es-toolkit";
import { ensureDir, outputFile, outputJSON, pathExists, readJSON, remove } from "fs-extra/esm";
import { isLinux, isMacOS, isWindows } from "std-env";
import { logger } from "./logger.js";
import { PrefsManager } from "./prefs-manager.js";
import { isRunning } from "./process.js";
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
    this.options = toMerged(default_options, options);

    if (!options.binary.path)
      throw new Error("Binary path must be provided.");

    // if (options.profile.path === this.default_profile_path && !options.profile.keepChanges)
    //   logger.warn("Profile at '.scaffold/profile' does not support discarding changes.");

    if (!options.profile.path && !options.profile.dataDir)
      this.options.profile.dataDir = "./.scaffold/data";

    logger.debug(this.options);
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
    if (this.options.binary.args) {
      args = [...args, ...this.options.binary.args];
    }

    // support for starting the remote debugger server
    const remotePort = await findFreeTcpPort();
    args.push("-start-debugger-server", String(remotePort));

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

    // Handle Zotero log, necessary on macOS
    this.zotero.stdout?.on("data", (_data) => {});

    logger.debug("Connecting to the remote Firefox debugger...");
    await this.remoteFirefox.connect(remotePort);
    logger.debug(`Connected to the remote Firefox debugger on port: ${remotePort}`);
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

  public exit(): void {
    this.zotero?.kill();
    // Sometimes `process.kill()` cannot kill the Zotero,
    // so we force kill it.
    killZotero();
  }
}

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
