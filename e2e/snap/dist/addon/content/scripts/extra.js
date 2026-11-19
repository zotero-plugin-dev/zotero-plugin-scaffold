"use strict";
(() => {
  // src/config.ts
  var PREF_PREFIX = "extensions.scaffold-fixture";

  // src/extra.ts
  var EXTRA_MARKER = "fixture-extra-bundle";
  function describePlugin() {
    return `${EXTRA_MARKER}: ${PREF_PREFIX}`;
  }
})();
