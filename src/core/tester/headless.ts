import { execSync } from "node:child_process";
import process from "node:process";
import { isDebug, isLinux } from "std-env";
import { Xvfb } from "xvfb-ts";
import { CACHE_DIR } from "../../constant.js";
import { LOG_LEVEL, logger } from "../../utils/logger.js";

export async function prepareHeadless() {
  // Ensure xvfb installing
  await installXvfb();
  await installDepsForUbuntu24();

  // Download and Extract Zotero Beta Linux
  await installZoteroLinux();

  const xvfb = new Xvfb({
    timeout: 2000,
  });
  await xvfb.start();
}

function isPackageInstalled(packageName: string): boolean {
  try {
    execSync(`dpkg-query -W ${packageName}`, { stdio: "ignore" });
    return true;
  }
  catch {
    return false;
  }
}

function installPackage(packageName: string): void {
  const debug = isDebug || logger.level <= LOG_LEVEL.DEBUG;
  try {
    logger.debug(`Installing ${packageName}...`);
    execSync(`sudo apt update && sudo apt install -y ${packageName}`, { stdio: debug ? "inherit" : "pipe" });
    logger.debug(`${packageName} installed successfully.`);
  }
  catch (error) {
    logger.fail(`Failed to install ${packageName}. ${error}`);
    throw error;
  }
}

function checkAndInstallDependencies(packages: string[]): void {
  packages.forEach((pkg) => {
    if (isPackageInstalled(pkg)) {
      logger.debug(`${pkg} is already installed.`);
    }
    else {
      installPackage(pkg);
    }
  });
}

export async function installXvfb() {
  if (!isLinux) {
    logger.error("Unsupported platform. Please install Xvfb manually.");
    return;
  }

  const osId = execSync("cat /etc/os-release | grep '^ID='").toString();
  if (!(osId.includes("ubuntu") || osId.includes("debian"))) {
    logger.error("Unsupported Linux distribution.");
    return;
  }

  checkAndInstallDependencies(["xvfb", "x11-xkb-utils", "xkb-data"]);
}

export async function installDepsForUbuntu24() {
  const version = execSync("cat /etc/os-release | grep '^VERSION_ID='").toString();
  if (!(version.includes("24"))) {
    logger.error("Skip to install deps due to version not 24.04.");
    return;
  }

  checkAndInstallDependencies(["libasound2t64", "libdbus-glib-1-2"]);
}

export async function installZoteroLinux() {
  if (process.env.ZOTERO_PLUGIN_ZOTERO_BIN_PATH) {
    logger.debug("Local Zotero found, skip to download.");
    return;
  }

  logger.debug("Installing Zotero...");
  execSync(`cd ${CACHE_DIR}`);
  execSync("wget -O zotero.tar.bz2 'https://www.zotero.org/download/client/dl?platform=linux-x86_64&channel=beta'", { stdio: "pipe" });
  execSync("tar -xvf zotero.tar.bz2", { stdio: "pipe" });

  // Set Environment Variable for Zotero Bin Path
  process.env.ZOTERO_PLUGIN_ZOTERO_BIN_PATH = `${process.cwd()}/Zotero_linux-x86_64/zotero`;
  execSync("cd -");
}
