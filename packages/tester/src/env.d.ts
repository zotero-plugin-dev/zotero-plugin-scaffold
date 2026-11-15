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
    /**
     * The `zo` namespace (the stand-in for Vitest's `vi`), installed by
     * `test-runtime-setup.ts`. Optional for the same reason as the test globals
     * below: it only exists once the test runtime has run. The shim
     * (`src/shim/index.ts`) is the only reader; new code imports `zo` from the
     * test API instead.
     */
    __TEST_ZO__?: import("./zo.js").Zo;
    /**
     * The test globals installed by `test-runtime-setup.ts`. All three are
     * optional from the type system's point of view: they only exist once the
     * test runtime has run, and they are bare globals kept for old tests — new
     * code imports the test API (`zotero-plugin-scaffold/test`) instead.
     * @deprecated Import `expect` from the test API.
     */
    expect?: import("./expect.js").Expect;
    /** @deprecated Import `assert` from the test API. */
    assert?: import("chai").AssertStatic;
    /** @deprecated Import `chai` from the test API. */
    chai?: typeof import("chai");
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
