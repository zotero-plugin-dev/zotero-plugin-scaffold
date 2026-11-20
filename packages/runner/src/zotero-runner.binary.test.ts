import type { ZoteroRunnerOptions } from "./zotero-runner.js";
import type { ZoteroBinaryInfo } from "./zotero/binary-locator.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZoteroRunner } from "./zotero-runner.js";

/**
 * The runner decides *which* Zotero and how it reports a miss; the search
 * itself belongs to the locator and is tested there. Here the locator and the
 * file system are stubbed so the decision alone can be asserted.
 */
vi.mock("./zotero/binary-locator.js", async (io) => {
  const actual = await io<typeof import("./zotero/binary-locator.js")>();
  return {
    ...actual,
    validate: vi.fn(),
    findZoteroBinary: vi.fn(),
    zoteroBinaryCandidates: vi.fn(),
  };
});

const locator = await import("./zotero/binary-locator.js");

const validateMock = vi.mocked(locator.validate);
const findZoteroBinaryMock = vi.mocked(locator.findZoteroBinary);
const candidatesMock = vi.mocked(locator.zoteroBinaryCandidates);

const DETECTED: ZoteroBinaryInfo = {
  path: "/opt/zotero/zotero",
  version: "10.0.8",
  source: "auto",
};

const EXPLICIT = {
  path: "/custom/zotero",
  version: "11.0-beta.2",
};

function options(binary: ZoteroRunnerOptions["binary"]): ZoteroRunnerOptions {
  return {
    binary,
    profile: { path: "./.scaffold/profile" },
    plugins: { list: [] },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  candidatesMock.mockReturnValue(["/a/zotero", "/b/zotero"]);
  validateMock.mockReturnValue(EXPLICIT);
});

describe("zoteroRunner binary resolution", () => {
  it("marks an explicit path as explicit, without detecting", () => {
    const runner = new ZoteroRunner(options({ path: "/custom/zotero" }));

    expect(findZoteroBinaryMock).not.toHaveBeenCalled();
    expect(validateMock).toHaveBeenCalledWith("/custom/zotero");
    expect(runner.binaryInfo.source).toBe("explicit");
  });

  it("treats a blank path as not given, and detects", () => {
    findZoteroBinaryMock.mockReturnValue(DETECTED);

    const runner = new ZoteroRunner(options({ path: "  " }));

    expect(runner.binaryInfo).toBe(DETECTED);
  });

  it("marks a detected install as auto", () => {
    findZoteroBinaryMock.mockReturnValue(DETECTED);

    const runner = new ZoteroRunner(options({}));

    expect(runner.binaryInfo).toBe(DETECTED);
    expect(runner.binaryInfo.source).toBe("auto");
  });

  it("throws when auto-detection is disabled and no path is given", () => {
    expect(() => new ZoteroRunner(options({ autoDetect: false })))
      .toThrow(/auto-detection is disabled/);
    expect(findZoteroBinaryMock).not.toHaveBeenCalled();
  });

  it("reports every searched path when nothing is found", () => {
    findZoteroBinaryMock.mockReturnValue(undefined);

    let message = "";
    try {
      // eslint-disable-next-line no-new -- the constructor is the assertion
      new ZoteroRunner(options({}));
    }
    catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain("Zotero binary not found");
    expect(message).toContain("- /a/zotero");
    expect(message).toContain("- /b/zotero");
    expect(message).toContain("ZOTERO_PLUGIN_ZOTERO_BIN_PATH");
  });

  it("throws for an explicit path that is not there, instead of falling back", () => {
    validateMock.mockReturnValue(undefined);

    expect(() => new ZoteroRunner(options({ path: "/custom/zotero" })))
      .toThrow(/Zotero binary not found[\s\S]*- \/custom\/zotero/);
    expect(findZoteroBinaryMock).not.toHaveBeenCalled();
  });
});
