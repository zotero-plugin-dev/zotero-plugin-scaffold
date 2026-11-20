/* eslint-disable */
/** Copied, not bundled: the entry Zotero itself loads. */
var ScaffoldPlayground;

function install(data, reason) {}

async function startup({ id, version, rootURI }, reason) {
  await Zotero.initializationPromise;

  const ctx = {
    id,
    version,
    rootURI,
  };
  
  Services.scriptloader.loadSubScript(`${rootURI}content/scripts/index.js`, { ctx });
  
  ScaffoldPlayground = ScaffoldPlayground;
  ScaffoldPlayground.onStartup()

  Zotero.debug(`Scaffold playground v${version}-__buildTime__ started.`);
}

function onMainWindowLoad({ window: win }) {
  ScaffoldPlayground.onMainWindowLoad(win)
}

function onMainWindowUnload({ window: win }) {
  ScaffoldPlayground.onMainWindowUnload(win)
}

function shutdown({ id, version, rootURI }, reason) {
  if (reason === APP_SHUTDOWN)
    return;

  ScaffoldPlayground.onShutdown()

  ScaffoldPlayground = undefined;

  Zotero.debug(`Scaffold playground v${version} shutdown.`);
}

function uninstall(data, reason) {}
