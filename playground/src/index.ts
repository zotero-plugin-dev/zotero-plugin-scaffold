import { PREF_PREFIX } from "./config";

declare const __buildTime__: string;

(globalThis as { ScaffoldPlayground?: unknown }).ScaffoldPlayground = {
  initialized: true,
  prefsPrefix: PREF_PREFIX,
  // Replaced by `build.define`.
  buildTime: __buildTime__,
};
