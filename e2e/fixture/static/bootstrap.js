/* eslint-disable */
/** Copied, not bundled: the entry Zotero itself loads. */
var chromeHandle;
var ScaffoldFixture;

function install(data, reason) {}

async function startup({ id, version, rootURI }, reason) {
  await Zotero.initializationPromise;

  // Registers `content/`, so `chrome://` URLs reach the copied files.
  const aomStartup = Components.classes["@mozilla.org/addons/addon-manager-startup;1"]
    .getService(Components.interfaces.amIAddonManagerStartup);
  const manifestURI = Services.io.newURI(`${rootURI}manifest.json`);
  chromeHandle = aomStartup.registerChrome(manifestURI, [
    ["content", "scaffold-fixture", rootURI],
  ]);

  globalThis.ScaffoldFixture = {};
  Services.scriptloader.loadSubScript(`${rootURI}content/scripts/index.js`, globalThis);

  ScaffoldFixture = globalThis.ScaffoldFixture;
  ScaffoldFixture.id = id;
  ScaffoldFixture.version = version;
  ScaffoldFixture.rootURI = rootURI;
  ScaffoldFixture.initialized = true;
  Zotero.ScaffoldFixture = ScaffoldFixture;

  Zotero.debug(`ScaffoldFixture ${version} started.`);
}

function onMainWindowLoad({ window: win }) {
  win.MozXULElement.insertFTLIfNeeded("scaffold-fixture-prefs.ftl");
}

function onMainWindowUnload({ window: win }) {
  win.document.querySelector('[href="scaffold-fixture-prefs.ftl"]')?.remove();
}

function shutdown({ id, version, rootURI }, reason) {
  if (reason === APP_SHUTDOWN)
    return;

  if (chromeHandle) {
    chromeHandle.destruct();
    chromeHandle = undefined;
  }

  ScaffoldFixture = undefined;
  delete globalThis.ScaffoldFixture;
  delete Zotero.ScaffoldFixture;
}

function uninstall(data, reason) {}
