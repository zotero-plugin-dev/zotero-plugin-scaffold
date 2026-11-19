/* eslint-disable */
/** Copied, not bundled: the entry Zotero itself loads. */
var ScaffoldPlayground;

function install(data, reason) {}

async function startup({ id, version, rootURI }, reason) {
  await Zotero.initializationPromise;

  ScaffoldPlayground = {
    id,
    version,
    rootURI,
    initialized: true,
  };
  Zotero.ScaffoldPlayground = ScaffoldPlayground;

  Services.scriptloader.loadSubScript(`${rootURI}content/scripts/index.js`, { ScaffoldPlayground });
  Zotero.debug(`ScaffoldPlayground ${version} started.`);
}

function onMainWindowLoad({ window: win }) {
  win.MozXULElement.insertFTLIfNeeded("scaffold-playground-prefs.ftl");
}

function onMainWindowUnload({ window: win }) {
  win.document.querySelector('[href="scaffold-playground-prefs.ftl"]')?.remove();
}

function shutdown({ id, version, rootURI }, reason) {
  if (reason === APP_SHUTDOWN)
    return;

  ScaffoldPlayground = undefined;
  delete Zotero.ScaffoldPlayground;
}

function uninstall(data, reason) {}
