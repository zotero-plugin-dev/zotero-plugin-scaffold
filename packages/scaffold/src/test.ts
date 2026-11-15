/**
 * The test API of scaffold.
 *
 * Test files import it as:
 *
 * ```ts
 * import { describe, expect, it } from "zotero-plugin-scaffold/test";
 * ```
 *
 * The types come from `@zotero-plugin/tester/api`, while the bundler redirects
 * the specifier above to the tester shim at build time, so nothing of
 * mocha/chai is inlined into the test bundles.
 */
export * from "@zotero-plugin/tester/api";
export { default } from "@zotero-plugin/tester/api";
