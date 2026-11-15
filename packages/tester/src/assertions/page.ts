/**
 * Page entry of the assertion API: exposes Chai on the globals of the Zotero
 * test page (`assert`, `expect`, `should`).
 *
 * The page has no module loader for npm packages, so this entry is bundled
 * into `packages/tester/dist/page/test-api.js` (IIFE) when the packages are
 * built. Test files then find the assertions as globals, and the whole page
 * shares one Chai instance.
 */
import { assert, expect, should } from "chai";

Object.assign(globalThis, { assert, expect, should });
