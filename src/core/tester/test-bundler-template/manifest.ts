import { TESTER_PLUGIN_ID } from "../../../constant.js";

export function generateManifest() {
  return {
    manifest_version: 2,
    name: "Zotero Plugin Scaffold Test Runner",
    version: "0.0.1",
    description: "Test suite for the Zotero plugin. This is a runtime-generated plugin only for testing purposes.",
    applications: {
      zotero: {
        id: TESTER_PLUGIN_ID as typeof TESTER_PLUGIN_ID,
        update_url: "https://example.com",
        // strict_min_version: "*.*.*",
        strict_max_version: "999.*.*",
      },
    },
  };
}
