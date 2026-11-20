import { PREF_PREFIX } from "./config";

// @ts-expect-error ScaffoldPlayground not typed
globalThis.ScaffoldPlayground = {
  initialized: true,
  prefsPrefix: PREF_PREFIX,

  onStartup() {
    Zotero.debug(`Calling onStartup hook`);
  },

  onMainWindowLoad(win: Window) {
    win.MozXULElement.insertFTLIfNeeded("scaffold-playground-prefs.ftl");
  },

  onMainWindowUnload(win: Window) {
    win.document.querySelector("[href=\"scaffold-playground-prefs.ftl\"]")?.remove();
  },

  onShutdown() {
    //
  },
};
