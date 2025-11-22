/*
 * This file is part of Zotero Plugin Scaffold, distributed under the terms of
 * the GNU Affero General Public License (AGPL-3.0-or-later).
 *
 * Portions of this file are derived from code originally licensed under the
 * Mozilla Public License, Version 2.0 (MPL-2.0). The original MPL-2.0 licensed
 * code can be found at:
 * - WebExt (MPL-2.0): https://github.com/mozilla/web-ext/blob/master/src/firefox/rdp-client.js.
 *
 * Modifications to the original MPL-2.0 code are distributed under
 * the terms of the AGPL-3.0-or-later license. As required by the MPL-2.0, this file
 * retains its original license for the derived portions.
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later AND MPL-2.0
 *
 * For details, see the LICENSE file in the root of this project.
 */

export const nonOverridablePreferences = [
  "devtools.debugger.remote-enabled",
  "devtools.debugger.prompt-connection",
  "xpinstall.signatures.required",
];

// Preferences Maps

const prefsCommon = {
  // Allow debug output via dump to be printed to the system console
  "browser.dom.window.dump.enabled": true,

  // From:
  // https://firefox-source-docs.mozilla.org/toolkit/components/telemetry/internals/preferences.html#data-choices-notification
  // This is the data submission master kill switch. If disabled, no policy is shown or upload takes place, ever.
  "datareporting.policy.dataSubmissionEnabled": false,

  // Allow remote connections to the debugger.
  "devtools.debugger.remote-enabled": true,
  // Disable the prompt for allowing connections.
  "devtools.debugger.prompt-connection": false,
  // Allow extensions to log messages on browser's console.
  "devtools.browserconsole.contentMessages": true,

  // Turn off platform logging because it is a lot of info.
  "extensions.logging.enabled": false,

  // Disable extension updates and notifications.
  "extensions.checkCompatibility.nightly": false,
  "extensions.update.enabled": false,
  "extensions.update.notifyUser": false,

  // From:
  // http://hg.mozilla.org/mozilla-central/file/1dd81c324ac7/build/automation.py.in//l372
  // Only load extensions from the application and user profile.
  // AddonManager.SCOPE_PROFILE + AddonManager.SCOPE_APPLICATION
  "extensions.enabledScopes": 5,
  // Disable metadata caching for installed add-ons by default.
  "extensions.getAddons.cache.enabled": false,
  // Disable installing any distribution add-ons.
  "extensions.installDistroAddons": false,
  // Allow installing extensions dropped into the profile folder.
  "extensions.autoDisableScopes": 10,

  // Disable app update.
  "app.update.enabled": false,

  // Allow unsigned add-ons.
  "xpinstall.signatures.required": false,

  // browser.link.open_newwindow is changed from 3 to 2 in:
  // https://github.com/saadtazi/firefox-profile-js/blob/cafc793d940a779d280103ae17d02a92de862efc/lib/firefox_profile.js#L32
  // Restore original value to avoid https://github.com/mozilla/web-ext/issues/1592
  "browser.link.open_newwindow": 3,
};

// Prefs specific to Firefox for desktop.
const prefsFirefox = {
  "browser.startup.homepage": "about:blank",
  "startup.homepage_welcome_url": "about:blank",
  "startup.homepage_welcome_url.additional": "",
  "devtools.errorconsole.enabled": true,
  "devtools.chrome.enabled": true,

  // From:
  // http://hg.mozilla.org/mozilla-central/file/1dd81c324ac7/build/automation.py.in//l388
  // Make url-classifier updates so rare that they won't affect tests.
  "urlclassifier.updateinterval": 172800,
  // Point the url-classifier to a nonexistent local URL for fast failures.
  "browser.safebrowsing.provider.0.gethashURL":
    "http://localhost/safebrowsing-dummy/gethash",
  "browser.safebrowsing.provider.0.keyURL":
    "http://localhost/safebrowsing-dummy/newkey",
  "browser.safebrowsing.provider.0.updateURL":
    "http://localhost/safebrowsing-dummy/update",

  // Disable self repair/SHIELD
  "browser.selfsupport.url": "https://localhost/selfrepair",
  // Disable Reader Mode UI tour
  "browser.reader.detectedFirstArticle": true,

  // Set the policy firstURL to an empty string to prevent
  // the privacy info page to be opened on every "web-ext run".
  // (See #1114 for rationale)
  "datareporting.policy.firstRunURL": "",
};

const prefsZotero = {
  "extensions.experiments.enabled": true,
  "extensions.autoDisableScopes": 0,

  // Enable remote-debugging
  "devtools.debugger.remote-enabled": true,
  "devtools.debugger.remote-websocket": true,
  "devtools.debugger.prompt-connection": false,

  // Inherit the default test settings from Zotero
  // https://github.com/zotero/zotero/blob/8a06edab49f07b84d07056ccd594c87920ef2c5e/test/runtests.sh#L127-L147
  // "app.update.enabled": false,
  // "extensions.zotero.sync.server.compressData": false,
  // "extensions.zotero.automaticScraperUpdates": false,
  // "extensions.zotero.debug.log": 5,
  // "extensions.zotero.debug.level": 5,
  // "extensions.zotero.debug.time": 5,
  "extensions.zotero.firstRun.skipFirefoxProfileAccessCheck": true,
  "extensions.zotero.firstRunGuidance": false,
  "extensions.zotero.firstRun2": false,
  "extensions.zotero.reportTranslationFailure": false,
  "extensions.zotero.httpServer.enabled": true,
  "extensions.zotero.httpServer.port": 23124, // ascii "ZT"
  "extensions.zotero.httpServer.localAPI.enabled": true,
  // "extensions.zotero.backup.numBackups": 0,
  // "extensions.zotero.sync.autoSync": false,
  "extensions.zoteroMacWordIntegration.installed": true,
  "extensions.zoteroMacWordIntegration.skipInstallation": true,
  "extensions.zoteroWinWordIntegration.skipInstallation": true,
  "extensions.zoteroOpenOfficeIntegration.skipInstallation": true,
};

export const prefs = {
  ...prefsCommon,
  ...prefsFirefox,
  ...prefsZotero,
};
