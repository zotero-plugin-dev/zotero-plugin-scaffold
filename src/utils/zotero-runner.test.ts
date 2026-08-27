import { existsSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanupOldLogs } from "./zotero-runner.js";

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

    await cleanupOldLogs(dir, 7);

    expect(existsSync(oldOut)).toBe(false);
    expect(existsSync(oldErr)).toBe(false);
    expect(existsSync(freshOut)).toBe(true);
    expect(existsSync(unrelated)).toBe(true);
  });

  it("keeps files older than one day when retention is 0", async () => {
    const dir = makeTempLogDir();
    const oldOut = join(dir, "zotero-20240101-000000.log");
    writeFileSync(oldOut, "old");
    const oldTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    utimesSync(oldOut, oldTime, oldTime);

    await cleanupOldLogs(dir, 0);

    expect(existsSync(oldOut)).toBe(true);
  });

  it("ignores a missing directory", async () => {
    const dir = join(tmpdir(), "zps-logs-missing", String(Date.now()));
    await expect(cleanupOldLogs(dir, 7)).resolves.toBeUndefined();
  });

  it("does not touch files outside the zotero-*.log glob", async () => {
    const dir = makeTempLogDir();
    const notZotero = join(dir, "scaffold.log");
    writeFileSync(notZotero, "x");

    await cleanupOldLogs(dir, 1);

    expect(existsSync(notZotero)).toBe(true);
    expect(readdirSync(dir)).toEqual(["scaffold.log"]);
  });
});
