/**
 * The public facade of the test API, re-exported by scaffold as
 * `zotero-plugin-scaffold/test`.
 *
 * It is a plain re-export of the bundler shim (no runtime delegation), so the
 * types are identical whether a test imports from here or from
 * `@zotero-plugin/tester/api`, and the bundler redirects every one of these
 * specifiers to the same shim.
 *
 * `re-export` needs no annotation, even under `isolatedDeclarations`.
 */
export {
  after,
  afterEach,
  assert,
  before,
  beforeEach,
  chai,
  config,
  context,
  describe,
  expect,
  it,
  specify,
  use,
  xcontext,
  xdescribe,
  xit,
  xspecify,
  zo,
} from "../shim/index.js";
export { default } from "../shim/index.js";
export type { Expect, Zo } from "../shim/index.js";
