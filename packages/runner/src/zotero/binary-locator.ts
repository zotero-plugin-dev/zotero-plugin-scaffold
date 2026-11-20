import type { Stats } from "node:fs";
import { execSync } from "node:child_process";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import process from "node:process";
import { logger } from "@zotero-plugin/utils";
import { uniqBy } from "es-toolkit";

export type ZoteroChannel = "stable" | "beta" | "dev";

export interface ZoteroBinaryInfo {
  path: string;
  version?: string;
  channel?: ZoteroChannel;
  source: "explicit" | "auto";
}

const REG_TYPE_RE = /REG_[A-Z_0-9]+/;

const PRERELEASE_RE = /-(alpha|beta|dev|nightly|pre)\b/i;

const APP_PATHS_KEYS = [
  "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\zotero.exe",
  "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\zotero.exe",
  "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\zotero.exe",
];

const isWindows = process.platform === "win32";

export function findZoteroBinary(): ZoteroBinaryInfo | undefined {
  const envPath = process.env.ZOTERO_PLUGIN_ZOTERO_BIN_PATH?.trim();
  if (envPath) {
    const info = validate(envPath);
    return info && { ...info, source: "explicit" };
  }

  const found = zoteroBinaryCandidates()
    .map(candidate => validate(candidate))
    .find(info => info !== undefined);

  return found && { ...found, source: "auto" };
}

/** Every path worth trying, in priority order; the first one that exists wins. */
export function zoteroBinaryCandidates(): string[] {
  const home = homedir();

  const candidates = isWindows
    ? [
        ...APP_PATHS_KEYS.flatMap(key => appPathCandidates(key)),
        ...[process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.LOCALAPPDATA]
          .filter(root => !!root)
          .map(root => `${root}\\Zotero\\zotero.exe`),
        ...lookup("where zotero.exe"),
      ]
    : process.platform === "darwin"
      ? [
          ...[`/Applications`, `${home}/Applications`]
            .map(directory => `${directory}/Zotero.app/Contents/MacOS/zotero`),
          ...lookup("which zotero"),
        ]
      : [
          ...lookup("which zotero"),
          "/usr/bin/zotero",
          "/usr/local/bin/zotero",
          "/opt/zotero/zotero",
          "/opt/Zotero_linux-x86_64/zotero",
          `${home}/.local/bin/zotero`,
          "/snap/bin/zotero",
          `${home}/.local/share/flatpak/exports/bin/org.zotero.Zotero`,
        ];

  return uniqBy(
    candidates
      .map(candidate => candidate.trim())
      .filter(candidate => isAbsolute(candidate)),
    candidate => isWindows
      ? candidate.toLowerCase()
      : candidate,
  );
}

export function applicationIniPathOf(binaryPath: string): string {
  const root = dirname(binaryPath);
  return process.platform === "darwin"
    ? join(root, "..", "Resources", "app", "application.ini")
    : join(root, "app", "application.ini");
}

/** Version and channel from the text of an `application.ini`. */
export function parseZoteroIni(iniText: string): Pick<ZoteroBinaryInfo, "version" | "channel"> {
  const version = /^Version=(?<version>.+)$/m.exec(iniText)?.groups?.version.trim();
  if (!version)
    return {};

  const prerelease = PRERELEASE_RE.exec(version)?.[1]?.toLowerCase();
  return {
    version,
    // Zotero publishes only `stable`, `beta` and `dev`, so any other prerelease suffix means `dev`.
    channel: !prerelease
      ? "stable"
      : prerelease === "beta"
        ? "beta"
        : "dev",
  };
}

export function validate(binaryPath: string): Omit<ZoteroBinaryInfo, "source"> | undefined {
  let stats: Stats;
  try {
    stats = statSync(binaryPath);
  }
  catch {
    return undefined;
  }

  if (!stats.isFile())
    return undefined;

  if (!isWindows && !(stats.mode & 0o111)) {
    logger.debug(`Skipping ${binaryPath}: not executable.`);
    return undefined;
  }

  // `application.ini` sits next to the real file, not next to a symlink like `/usr/bin/zotero -> /opt/zotero/zotero`.
  let ini: string | undefined;
  try {
    ini = readFileSync(applicationIniPathOf(canonical(binaryPath)), "utf8");
  }
  catch {
    // An unreadable ini is not a reason to reject a working executable.
  }

  return {
    path: binaryPath,
    ...ini === undefined
      ? {}
      : parseZoteroIni(ini),
  };
}

function appPathCandidates(key: string): string[] {
  const values = registryValues(run(`reg query "${key}"`));
  const directory = unquote(values.path ?? "");
  return [
    unquote(values.default ?? ""),
    directory && `${directory}\\zotero.exe`,
  ].filter(candidate => !!candidate);
}

function run(command: string): string | undefined {
  try {
    return execSync(command, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
      windowsHide: true,
    });
  }
  catch {
    return undefined;
  }
}

function lookup(command: string): string[] {
  return (run(command) ?? "")
    .split(/\r?\n/)
    .map(line => unquote(line));
}

function registryValues(output?: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of output?.split(/\r?\n/) ?? []) {
    const entry = registryEntry(line);
    if (entry)
      values[entry.name] = entry.value;
  }
  return values;
}

function registryEntry(line: string): { name: string; value: string } | undefined {
  const type = REG_TYPE_RE.exec(line);
  if (!type || !type.index)
    return undefined;

  const name = line.slice(0, type.index).trim();
  if (!name)
    return undefined;

  return {
    name: /^\(.*\)$/.test(name)
      ? "default"
      : name.toLowerCase(),
    value: line.slice(type.index + type[0].length).trim(),
  };
}

function unquote(value: string): string {
  const trimmed = value.trim();
  const quote = trimmed[0];
  const quoted = trimmed.length >= 2 && (quote === "\"" || quote === "'") && trimmed.at(-1) === quote;
  return quoted
    ? trimmed.slice(1, -1)
    : trimmed;
}

function canonical(binaryPath: string): string {
  try {
    return realpathSync(binaryPath);
  }
  catch {
    return binaryPath;
  }
}
