import type { Stats } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { beforeEach, describe, expect, it, vi } from "vitest";

const isWindows = process.platform === "win32";
const isLinux = process.platform === "linux";

vi.mock("node:child_process", async io => ({
  ...await io<typeof import("node:child_process")>(),
  execSync: vi.fn(),
}));

vi.mock("node:fs", async io => ({
  ...await io<typeof import("node:fs")>(),
  readFileSync: vi.fn(),
  realpathSync: vi.fn(),
  statSync: vi.fn(),
}));

vi.mock("@zotero-plugin/utils", async io => ({
  ...await io<typeof import("@zotero-plugin/utils")>(),
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    fail: vi.fn(),
    tip: vi.fn(),
    success: vi.fn(),
  },
}));

const { execSync } = await import("node:child_process");
const { readFileSync, realpathSync, statSync } = await import("node:fs");
const { logger } = await import("@zotero-plugin/utils");
const {
  applicationIniPathOf,
  findZoteroBinary,
  parseZoteroIni,
  validate,
  zoteroBinaryCandidates,
} = await import("./binary-locator.js");

const execSyncMock = vi.mocked(execSync);
const readFileSyncMock = vi.mocked(readFileSync);
const realpathSyncMock = vi.mocked(realpathSync);
const statSyncMock = vi.mocked(statSync);

const ZOTERO_ROOT = String.raw`D:\Program Files\Zotero`;
const ZOTERO_EXE = `${ZOTERO_ROOT}\\zotero.exe`;

const WINDOWS_FIXED_EXES = [
  String.raw`C:\Program Files\Zotero\zotero.exe`,
  String.raw`C:\Program Files (x86)\Zotero\zotero.exe`,
  String.raw`C:\Users\tester\AppData\Local\Zotero\zotero.exe`,
];

const APP_PATHS_OUTPUT = [
  "",
  String.raw`HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\zotero.exe`,
  `    (Default)    REG_SZ    ${ZOTERO_EXE}`,
  `    Path    REG_SZ    ${ZOTERO_ROOT}`,
  "",
].join("\r\n");

const INI_TEXT = "[App]\r\nVersion=10.0.8\r\n";

function fileAt(existing: string, mode = 0o100644): void {
  statSyncMock.mockImplementation(((candidate: string) => {
    if (candidate !== existing)
      throw new Error(`ENOENT: ${candidate}`);
    return {
      isFile: () => true,
      mode,
    } as Stats;
  }) as unknown as typeof statSync);
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ZOTERO_PLUGIN_ZOTERO_BIN_PATH;
  process.env.ProgramFiles = String.raw`C:\Program Files`;
  process.env["ProgramFiles(x86)"] = String.raw`C:\Program Files (x86)`;
  process.env.LOCALAPPDATA = String.raw`C:\Users\tester\AppData\Local`;

  statSyncMock.mockImplementation((() => {
    throw new Error("ENOENT");
  }) as unknown as typeof statSync);
  execSyncMock.mockImplementation(() => {
    throw new Error("not found");
  });
  readFileSyncMock.mockImplementation(() => {
    throw new Error("ENOENT");
  });
  realpathSyncMock.mockImplementation(((path: string) => path) as unknown as typeof realpathSync);
});

describe("parseZoteroIni", () => {
  it.each([
    ["10.0.8", "stable"],
    ["8.0-beta.4+03d94060b", "beta"],
    ["11.0-beta.3+212a7d6a5", "beta"],
    ["11.0-dev.2", "dev"],
    ["11.0-nightly.20260101", "dev"],
    ["11.0-alpha.1", "dev"],
    ["11.0-pre.1", "dev"],
  ])("reads version %s and its %s channel", (version, channel) => {
    expect(parseZoteroIni(`[App]\r\nVersion=${version}\r\n`)).toEqual({ version, channel });
  });

  it("returns nothing when there is no Version line", () => {
    expect(parseZoteroIni("[App]\r\nName=Zotero\r\n")).toEqual({});
  });
});

describe("validate", () => {
  it("returns path, version and channel of an existing executable", () => {
    statSyncMock.mockReturnValue({
      isFile: () => true,
      mode: 0o100755,
    } as Stats);
    realpathSyncMock.mockImplementation(((path: string) => path) as unknown as typeof realpathSync);
    readFileSyncMock.mockReturnValue("[App]\r\nVersion=11.0-beta.3+212a7d6a5\r\n" as unknown as string);

    expect(validate("/any/zotero")).toEqual({
      path: "/any/zotero",
      version: "11.0-beta.3+212a7d6a5",
      channel: "beta",
    });
  });

  it("keeps an executable whose ini is unreadable", () => {
    statSyncMock.mockReturnValue({
      isFile: () => true,
      mode: 0o100755,
    } as Stats);
    realpathSyncMock.mockImplementation(((path: string) => path) as unknown as typeof realpathSync);

    expect(validate("/any/zotero")).toEqual({ path: "/any/zotero" });
  });

  it("returns undefined for a file that is not there", () => {
    expect(validate("/nope/zotero")).toBeUndefined();
  });
});

describe.runIf(isWindows)("windows candidates", () => {
  it("puts App Paths first, then the fixed paths, then PATH", () => {
    execSyncMock.mockImplementation((command: string) => {
      if (command.includes("App Paths"))
        return APP_PATHS_OUTPUT;
      if (command.startsWith("where "))
        return `${String.raw`C:\Tools\Zotero\zotero.exe`}\r\n`;
      throw new Error("not found");
    });

    const candidates = zoteroBinaryCandidates();

    // `App Paths` yields the same exe twice: the default value and `Path`.
    expect(candidates).toEqual([ZOTERO_EXE, ...WINDOWS_FIXED_EXES, String.raw`C:\Tools\Zotero\zotero.exe`]);
  });

  it("falls back to the Path value when the default value is missing", () => {
    execSyncMock.mockImplementation((command: string) => {
      if (command.includes("App Paths"))
        return `HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\zotero.exe\r\n    Path    REG_SZ    ${ZOTERO_ROOT}\r\n`;
      throw new Error("not found");
    });

    expect(zoteroBinaryCandidates()[0]).toBe(ZOTERO_EXE);
  });

  it("survives a registry and PATH that answer nothing", () => {
    expect(zoteroBinaryCandidates()).toEqual(WINDOWS_FIXED_EXES);
  });

  it("points application.ini at app/application.ini", () => {
    expect(applicationIniPathOf(ZOTERO_EXE)).toBe(`${ZOTERO_ROOT}\\app\\application.ini`);
  });

  it("needs no execute bit, which Windows does not have", () => {
    fileAt(ZOTERO_EXE);

    expect(validate(ZOTERO_EXE)).toMatchObject({ path: ZOTERO_EXE });
  });
});

describe.runIf(isWindows)("windows detection", () => {
  it("uses an explicit path as is, without looking for another install", () => {
    process.env.ZOTERO_PLUGIN_ZOTERO_BIN_PATH = String.raw`D:\Custom\zotero.exe`;
    fileAt(String.raw`D:\Custom\zotero.exe`);
    readFileSyncMock.mockReturnValue(INI_TEXT as unknown as string);

    expect(findZoteroBinary()).toMatchObject({
      path: String.raw`D:\Custom\zotero.exe`,
      source: "explicit",
      version: "10.0.8",
    });
    expect(execSyncMock).not.toHaveBeenCalled();
  });

  it("detects the install through App Paths and reads its version", () => {
    execSyncMock.mockImplementation((command: string) => {
      if (command.includes("App Paths"))
        return APP_PATHS_OUTPUT;
      throw new Error("not found");
    });
    fileAt(ZOTERO_EXE);
    readFileSyncMock.mockReturnValue(INI_TEXT as unknown as string);

    expect(findZoteroBinary()).toMatchObject({
      path: ZOTERO_EXE,
      source: "auto",
      version: "10.0.8",
    });
  });

  it("keeps one install when two candidates resolve to the same file", () => {
    execSyncMock.mockImplementation((command: string) => {
      if (command.includes("App Paths"))
        return APP_PATHS_OUTPUT;
      if (command.startsWith("where "))
        return `${ZOTERO_EXE}\r\n`;
      throw new Error("not found");
    });
    fileAt(ZOTERO_EXE);
    realpathSyncMock.mockImplementation((() => ZOTERO_EXE) as unknown as typeof realpathSync);
    readFileSyncMock.mockReturnValue(INI_TEXT as unknown as string);

    expect(findZoteroBinary()?.path).toBe(ZOTERO_EXE);
    expect(vi.mocked(logger.debug).mock.calls.flat().join("\n")).not.toContain("Zotero binary candidates");
  });

  it("returns undefined when the machine has no Zotero", () => {
    expect(findZoteroBinary()).toBeUndefined();
  });

  it("looks again on every call, so a fresh install is found", () => {
    process.env.ZOTERO_PLUGIN_ZOTERO_BIN_PATH = ZOTERO_EXE;
    expect(findZoteroBinary()).toBeUndefined();

    fileAt(ZOTERO_EXE);

    expect(findZoteroBinary()).toMatchObject({ path: ZOTERO_EXE });
  });
});

describe.runIf(isLinux)("linux candidates", () => {
  it("puts PATH first, then the well-known locations", () => {
    execSyncMock.mockImplementation(() => "/usr/bin/zotero\n");

    const candidates = zoteroBinaryCandidates();

    expect(candidates[0]).toBe("/usr/bin/zotero");
    expect(candidates).toContain("/opt/zotero/zotero");
    expect(candidates).toContain("/opt/Zotero_linux-x86_64/zotero");
    expect(candidates).toContain(join(homedir(), ".local", "bin", "zotero"));
    expect(candidates).toContain("/snap/bin/zotero");
    expect(candidates).toContain(join(homedir(), ".local", "share", "flatpak", "exports", "bin", "org.zotero.Zotero"));
    expect(new Set(candidates).size).toBe(candidates.length);
  });

  it("drops relative and blank answers", () => {
    execSyncMock.mockImplementation(() => "zotero\n\n");

    const candidates = zoteroBinaryCandidates();

    expect(candidates).not.toContain("zotero");
    expect(candidates.every(candidate => candidate.startsWith("/"))).toBe(true);
  });

  it("points application.ini at app/application.ini", () => {
    expect(applicationIniPathOf("/opt/zotero/zotero")).toBe("/opt/zotero/app/application.ini");
  });

  it("reads the version of the real file behind a symlink", () => {
    const realIni = "/opt/zotero/app/application.ini";
    statSyncMock.mockReturnValue({
      isFile: () => true,
      mode: 0o100755,
    } as Stats);
    realpathSyncMock.mockImplementation((() => "/opt/zotero/zotero") as unknown as typeof realpathSync);
    readFileSyncMock.mockImplementation(((path: string) => {
      if (path !== realIni)
        throw new Error("ENOENT");
      return "[App]\nVersion=11.0-beta.3+212a7d6a5\n";
    }) as unknown as typeof readFileSync);

    // The linked path is what starts Zotero; the channel comes from the target.
    expect(validate("/usr/bin/zotero")).toMatchObject({
      path: "/usr/bin/zotero",
      version: "11.0-beta.3+212a7d6a5",
    });
  });

  it("skips a file without the execute bit", () => {
    statSyncMock.mockReturnValue({
      isFile: () => true,
      mode: 0o100644,
    } as Stats);

    expect(validate("/opt/zotero/zotero")).toBeUndefined();
    expect(vi.mocked(logger.debug).mock.calls.flat().join("\n")).toContain("not executable");
  });

  it("skips a directory named like the executable", () => {
    statSyncMock.mockReturnValue({
      isFile: () => false,
      mode: 0o040755,
    } as Stats);

    expect(validate("/opt/zotero/zotero")).toBeUndefined();
  });
});

describe.runIf(isLinux)("linux detection", () => {
  it("uses an explicit path as is, without looking for another install", () => {
    process.env.ZOTERO_PLUGIN_ZOTERO_BIN_PATH = "/custom/zotero";
    statSyncMock.mockReturnValue({
      isFile: () => true,
      mode: 0o100755,
    } as Stats);
    readFileSyncMock.mockReturnValue("[App]\nVersion=11.0-dev.2\n" as unknown as string);

    expect(findZoteroBinary()).toMatchObject({
      path: "/custom/zotero",
      source: "explicit",
      version: "11.0-dev.2",
    });
    expect(execSyncMock).not.toHaveBeenCalled();
  });

  it("does not fall back when the explicit path does not exist", () => {
    process.env.ZOTERO_PLUGIN_ZOTERO_BIN_PATH = "/nope/zotero";
    execSyncMock.mockImplementation(() => "/opt/zotero/zotero\n");

    expect(findZoteroBinary()).toBeUndefined();
  });

  it("returns undefined when the machine has no Zotero", () => {
    expect(findZoteroBinary()).toBeUndefined();
  });
});

describe.runIf(process.platform === "darwin")("macos candidates", () => {
  it("lists the app bundles before PATH", () => {
    execSyncMock.mockImplementation(() => "/opt/homebrew/bin/zotero\n");

    expect(zoteroBinaryCandidates()).toEqual([
      "/Applications/Zotero.app/Contents/MacOS/zotero",
      join(homedir(), "Applications", "Zotero.app", "Contents", "MacOS", "zotero"),
      "/opt/homebrew/bin/zotero",
    ]);
  });

  it("points application.ini inside the bundle", () => {
    expect(applicationIniPathOf("/Applications/Zotero.app/Contents/MacOS/zotero"))
      .toBe("/Applications/Zotero.app/Contents/Resources/app/application.ini");
  });
});
