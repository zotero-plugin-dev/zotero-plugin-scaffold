# Quick Start

## Using in a Blank Project

::: details WIP: Not Yet Implemented

```bash
# Using npm
npm create zotero-plugin

# Using pnpm
pnpm create zotero-plugin
```

:::

## Using in an Existing Project

### 01. Install the Package

You can install `zotero-plugin-scaffold` using your preferred package manager:

::: code-group

```bash [npm]
npm install -D zotero-plugin-scaffold
```

```bash [yarn]
yarn add -D zotero-plugin-scaffold
```

```bash [pnpm]
pnpm add -D zotero-plugin-scaffold
```

:::

### 02. Create a Configuration File

The configuration file should be placed at one of the following locations:

```bash
zotero-plugin.config.ts  # Also supported: *.js, *.mjs, *.cjs, *.ts
```

You can use the `defineConfig` helper to enable type hints. Optional properties will default to predefined values if not explicitly specified.

```ts twoslash {4-6}
import { defineConfig } from "zotero-plugin-scaffold";

export default defineConfig({
  name: "the plugin name",
  id: "the plugin id",
  namespace: "the plugin namespace",
  build: {
    esbuildOptions: [
      {
        entryPoints: ["src/index.ts"],
        bundle: true,
        target: "firefox115",
      },
    ],
  },
});
```

For a full list of configuration options, refer to the [type definitions](https://github.com/zotero-plugin-dev/zotero-plugin-scaffold/blob/main/packages/scaffold/src/types.ts).

### 03. Create an Environment File

Define Zotero’s runtime configuration (e.g., binary paths, profile paths, and environment variables) in a `.env` file.

::: warning

Do not commit this file to your repository!

:::

```bash
.env
```

```ini
# Path to the Zotero binary file.
# For macOS, the path is typically `*/Zotero.app/Contents/MacOS/zotero`.
ZOTERO_PLUGIN_ZOTERO_BIN_PATH=/path/to/zotero.exe

# Path to the profile used for development.
# To create a profile for development, start the profile manager with `/path/to/zotero.exe -p`.
# More info: https://www.zotero.org/support/kb/profile_directory
ZOTERO_PLUGIN_PROFILE_PATH=/path/to/profile
```

### 04. Add Scripts to `package.json`

Add the following scripts for development:

```json
{
  "scripts": {
    "start": "zotero-plugin dev",
    "build": "zotero-plugin build",
    "release": "zotero-plugin release"
  }
}
```

### 05. Run the Plugin

Use the following commands to start development or build the plugin:

```bash
# Start the development server
pnpm run start

# Build the plugin
pnpm run build
```

## Using in Node.js Code

You can also use `zotero-plugin-scaffold` programmatically in your Node.js scripts:

```ts
import { createBuilder, loadConfig } from "zotero-plugin-scaffold";

const ctx = await loadConfig();

const builder = await createBuilder(ctx);
try {
  await builder.run();
}
finally {
  await builder.dispose();
}
```
