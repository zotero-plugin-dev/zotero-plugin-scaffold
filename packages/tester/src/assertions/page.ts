/**
 * Page entry of the assertion API: exposes it on the globals of the Zotero
 * test page (`expect`, `assert`, `chai`, `should`).
 *
 * The page has no module loader for npm packages, so this entry is bundled
 * into `dist/page/test-api.js` (IIFE) when scaffold is built. Test files which
 * import `zotero-plugin-scaffold/test` are redirected to these globals by the
 * test bundler, so the whole page shares one `expect` instance.
 */
import { assert, chai, expect, should } from "./index.js";

Object.assign(globalThis, { assert, chai, expect, should });
