import { homedir } from "node:os";
import { join } from "node:path";
import { ensureDir, pathExists, readJSON, writeJSON } from "fs-extra/esm";

/**
 * Platform identifier for version information
 */
export type Platform = "mac" | "win-x64" | "win-arm64" | "win32" | "linux-x86_64" | "linux-i686" | "linux-arm64";

/**
 * Version info structure
 */
export interface ZoteroVersionInfo {
  lastUpdated: number;
  release: Record<Platform, string>;
  beta: Record<Platform, string>;
}

const CACHE_DIR = join(homedir(), ".scaffold", "cache");
const CACHE_FILE = join(CACHE_DIR, "zotero-version.json");
const CACHE_TTL = 3 * 24 * 60 * 60 * 1000; // 3 days in milliseconds
const API_BETA = "https://www.zotero.org/download/client/version?channel=beta";
const API_RELEASE = "https://www.zotero.org/download/client/version?channel=release";

/**
 * Fetch Zotero version information from API
 */
async function fetchVersionsFromAPI(): Promise<Omit<ZoteroVersionInfo, "lastUpdated">> {
  const [betaRes, releaseRes] = await Promise.all([
    fetch(API_BETA),
    fetch(API_RELEASE),
  ]);

  if (!betaRes.ok || !releaseRes.ok) {
    throw new Error("Failed to fetch Zotero version information from API");
  }

  const [beta, release] = await Promise.all([
    betaRes.json(),
    releaseRes.json(),
  ]);

  return {
    beta: beta as Record<Platform, string>,
    release: release as Record<Platform, string>,
  };
}

/**
 * Load version cache from disk
 */
async function loadCache(): Promise<ZoteroVersionInfo | null> {
  try {
    if (!await pathExists(CACHE_FILE)) {
      return null;
    }

    const cache = await readJSON(CACHE_FILE) as ZoteroVersionInfo;
    const age = Date.now() - cache.lastUpdated;

    // Check if cache is still valid
    if (age > CACHE_TTL) {
      return null;
    }

    return cache;
  }
  catch {
    return null;
  }
}

/**
 * Save version cache to disk
 */
async function saveCache(data: Omit<ZoteroVersionInfo, "lastUpdated">): Promise<void> {
  await ensureDir(CACHE_DIR);
  const cache: ZoteroVersionInfo = {
    lastUpdated: Date.now(),
    ...data,
  };
  await writeJSON(CACHE_FILE, cache, { spaces: 2 });
}

/**
 * Get Zotero version information with caching
 */
export async function getZoteroVersionInfo(): Promise<ZoteroVersionInfo> {
  // Try to load from cache first
  const cachedData = await loadCache();
  if (cachedData) {
    return cachedData;
  }

  // Fetch from API if cache is not available
  const freshData = await fetchVersionsFromAPI();
  await saveCache(freshData);

  return {
    lastUpdated: Date.now(),
    ...freshData,
  };
}

/**
 * Parse version string to extract major version
 * E.g., "9.0-beta.21+1a89239a1" -> 9, "9.0" -> 9
 */
export function parseMajorVersion(version: string): number {
  const match = version.match(/^(\d+)/);
  if (!match) {
    throw new Error(`Invalid version format: ${version}`);
  }
  return Number.parseInt(match[1], 10);
}

/**
 * Compare two version strings
 * Returns: -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2
 */
export function compareVersions(v1: string, v2: string): number {
  const v1Parts = v1.split(/[.-]/).map((p) => {
    const num = Number.parseInt(p, 10);
    return Number.isNaN(num) ? 0 : num;
  });
  const v2Parts = v2.split(/[.-]/).map((p) => {
    const num = Number.parseInt(p, 10);
    return Number.isNaN(num) ? 0 : num;
  });

  for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
    const p1 = v1Parts[i] ?? 0;
    const p2 = v2Parts[i] ?? 0;

    if (p1 < p2)
      return -1;
    if (p1 > p2)
      return 1;
  }

  return 0;
}
