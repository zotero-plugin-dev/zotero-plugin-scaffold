"use strict";
(() => {
  // src/config.ts
  var PREF_PREFIX = "extensions.scaffold-fixture";

  // src/index.ts
  var api = {
    initialized: true,
    prefsPrefix: PREF_PREFIX
  };
  globalThis.ScaffoldFixture = api;
})();
