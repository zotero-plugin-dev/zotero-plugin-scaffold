import { existsSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PrefsManager } from "./prefs-manager.js";
import { cleanupOldLogs, ZoteroRunner } from "./zotero-runner.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempLogDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "zps-logs-"));
  tempDirs.push(dir);
  return dir;
}

describe("cleanupOldLogs", () => {
  it("removes old zotero logs and keeps fresh & unrelated files", async () => {
    const dir = makeTempLogDir();
    const oldOut = join(dir, "zotero-20240101-000000.log");
    const oldErr = join(dir, "zotero-20240101-000000-stderr.log");
    const freshOut = join(dir, "zotero-20250827-175034.log");
    const unrelated = join(dir, "other.log");

    writeFileSync(oldOut, "old");
    writeFileSync(oldErr, "old");
    writeFileSync(freshOut, "fresh");
    writeFileSync(unrelated, "unrelated");

    const oldTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    utimesSync(oldOut, oldTime, oldTime);
    utimesSync(oldErr, oldTime, oldTime);

    await cleanupOldLogs(dir);

    expect(existsSync(oldOut)).toBe(false);
    expect(existsSync(oldErr)).toBe(false);
    expect(existsSync(freshOut)).toBe(true);
    expect(existsSync(unrelated)).toBe(true);
  });

  it("ignores a missing directory", async () => {
    const dir = join(tmpdir(), "zps-logs-missing", String(Date.now()));
    await expect(cleanupOldLogs(dir)).resolves.toBeUndefined();
  });

  it("does not touch files outside the zotero-*.log glob", async () => {
    const dir = makeTempLogDir();
    const notZotero = join(dir, "scaffold.log");
    writeFileSync(notZotero, "x");

    await cleanupOldLogs(dir);

    expect(existsSync(notZotero)).toBe(true);
    expect(readdirSync(dir)).toEqual(["scaffold.log"]);
  });
});

// `setupProfile` merges prefs as: existing `prefs.js` → default prefs → caller prefs. That order
// is what heals a dev profile from a value written by an older version (#179), so pin it here.
describe("setupProfile", () => {
  // `setupProfile` is private: it only touches the profile directory, no Zotero process needed
  const callSetupProfile = (runner: ZoteroRunner) =>
    (runner as unknown as { setupProfile: () => Promise<void> }).setupProfile();

  async function writeAndRead(portInProfile?: number, customPrefs: Record<string, number> = {}) {
    const dir = makeTempLogDir();
    if (portInProfile !== undefined)
      writeFileSync(join(dir, "prefs.js"), `user_pref("extensions.zotero.httpServer.port", ${portInProfile});\n`);

    const runner = new ZoteroRunner({
      binary: { path: "zotero" },
      profile: { path: dir, customPrefs },
      plugins: { list: [] },
    });
    await callSetupProfile(runner);

    const written = new PrefsManager("user_pref");
    await written.read(join(dir, "prefs.js"));
    return written;
  }

  it("overrides a stale connector port left in an existing profile", async () => {
    // Older versions forced 23124 into every profile they touched (#179)
    const prefs = await writeAndRead(23124);
    expect(prefs.getPref("extensions.zotero.httpServer.port")).toBe(23119);
  });

  it("keeps a connector port requested by the caller", async () => {
    const prefs = await writeAndRead(23124, { "extensions.zotero.httpServer.port": 23124 });
    expect(prefs.getPref("extensions.zotero.httpServer.port")).toBe(23124);
  });
});
