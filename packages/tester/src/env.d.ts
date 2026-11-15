import type { TestRuntimeOptions } from "./types.js";

/**
 * Host globals available inside the Zotero test runtime.
 *
 * `src/test-runtime-setup.ts` is a real TypeScript module (it used to be a
 * string template), so the Zotero globals it touches have to be declared.
 * The mocha `describe` / `it` globals are already declared by
 * `@types/mocha`, hence they are not repeated here.
 */
declare global {
  /** The Zotero host object, only the parts the runtime uses. */
  const Zotero: ZoteroTestHost;
  /** The Zotero/Gecko debug console, available on the test page. */
  function dump(message: string): void;

  interface Window {
    /** Injected by `index.xhtml` right before `test-runtime.js` is loaded. */
    __TEST_OPTIONS__?: TestRuntimeOptions;
    /** @deprecated Bare global of the chai `expect`, kept for old tests. */
    expect: import("chai").ExpectStatic;
    /** @deprecated Bare global of the chai `assert`, kept for old tests. */
    assert: import("chai").AssertStatic;
    /** The chai namespace, so that `chai.use(plugin)` keeps working. */
    chai: typeof import("chai");
    /** Debug helper, sends a `debug` event to the result server. */
    debug?: (data: unknown) => void;
  }
}

export interface ZoteroTestHost {
  /** True when Zotero runs the automated test suite. */
  automatedTest?: boolean;
  HTTP: {
    request: (
      method: string,
      url: string,
      options?: { body?: string },
    ) => Promise<{ status: number; responseText: string }>;
  };
  Utilities: {
    Internal: {
      quit: (code?: number) => void;
    };
  };
}
