# Serve

This module starts a development server, precompiles the plugin, and installs it after launching Zotero.

When source code changes are detected, the plugin is automatically recompiled and reloaded in Zotero.

## Zotero and Profile Path

Define the paths for the Zotero binary, profile, and data in a `.env` file:

```ini
# Path to the Zotero binary file.
# For macOS, the path is typically `*/Zotero.app/Contents/MacOS/zotero`.
ZOTERO_PLUGIN_ZOTERO_BIN_PATH=/path/to/zotero.exe

# Path to the profile used for development.
# To create a profile for development, start the profile manager with `/path/to/zotero.exe -p`.
# More info: https://www.zotero.org/support/kb/profile_directory
ZOTERO_PLUGIN_PROFILE_PATH=/path/to/profile

# Optional path to the data directory (if needed).
ZOTERO_PLUGIN_DATA_DIR=/path/to/data
```

- `ZOTERO_PLUGIN_ZOTERO_BIN_PATH` is required.
- `ZOTERO_PLUGIN_PROFILE_PATH` and `ZOTERO_PLUGIN_DATA_DIR` are optional, a blank profile will be automatically created if not provided.
- If you manage multiple plugins, these paths can be stored in system/user environment variables. However, paths defined in `.env` currently do not override system/user-level variables. This behavior may change in future versions.

## Launch Arguments and Developer Tools

Customize launch arguments and enable developer tools using the `serve.tools` and `serve.startArgs` options:

```ts twoslash
import { defineConfig } from "zotero-plugin-scaffold";
// ---cut---
export default defineConfig({
  server: {
    devtools: true,
    startArgs: [],
  },
});
```

- `--purgecaches` and `--no-remote` are always included in the Zotero startup arguments, regardless of the `server.startArgs` configuration.
- If `devtools` is set to `true`, the `--jsdebugger` argument is appended, enabling the Firefox developer tools.

## Debug Output

When `server.zoteroLog` is enabled (default), Scaffold appends `-ZoteroDebugText` to the Zotero startup arguments, so `Zotero.debug()` / `dump()` output goes to stdout. The process stdout/stderr are captured and written to log files under `.scaffold/logs/`, numbered by the launch time:

- stdout → `.scaffold/logs/zotero-<starttime>.log`
- stderr → `.scaffold/logs/zotero-<starttime>-stderr.log`

On startup the exact file paths are printed to the serve console (so you can `tail -f` them for real-time output). Files older than 7 days are removed automatically.

```ts twoslash
import { defineConfig } from "zotero-plugin-scaffold";
// ---cut---
export default defineConfig({
  server: {
    // Debug output is recorded to .scaffold/logs/zotero-<starttime>.log by default.
    // Set this to false to disable file logging:
    zoteroLog: true,
    // Open the Zotero Debug Output window in addition to file logging:
    debugOutputWindow: false,
  },
});
```

- `server.debugOutputWindow` only controls whether the Zotero Debug Output window is opened (appends `-ZoteroDebug`). Debug output recording is independent of it.
- `server.zoteroLog: false` disables file logging; stdout/stderr are still consumed (to prevent the pipe buffer from filling up and blocking Zotero) but discarded.
- Known limitation on Windows: Zotero writes to the console in the system code page, so non-ASCII output may appear garbled (utf8 passthrough). The main debug log content is English, so the practical impact is small.

## Hot Reloading and Proxy File

The Zotero team's [plugin development guide](https://www.zotero.org/support/dev/client_coding/plugin_development) describes using Proxy File for loading plugins from source. While this method works for older versions of Zotero (e.g., Zotero 6), it **does not support plugin reloading**.

Zotero 7 and later use an updated Firefox architecture, which supports more modern development methods using the [Remote Debugging Protocol (RDP)](https://firefox-source-docs.mozilla.org/devtools/backend/protocol.html#remote-debugging-protocol).

By default, Scaffold employs this new approach for plugin installation and reloading, similar to the method used by Firefox's `web-ext` tool.

For Zotero 6 or earlier, set `server.asProxy` to `true` to enable the Proxy File approach.

```ts twoslash
import { defineConfig } from "zotero-plugin-scaffold";
// ---cut---
export default defineConfig({
  server: {
    asProxy: true
  },
});
```
