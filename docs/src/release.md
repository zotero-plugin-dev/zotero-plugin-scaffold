# Release

This module provides a workflow for releasing plugins.

## Motivation

When releasing a plugin, you typically need to manually update the `version` in `manifest.json`, package the plugin, upload it, and update the `version` and link in `update.json`.

To preserve Git history, you also need to commit the changes and tag the commit after updating the version.

— It’s too tedious!

With Scaffold, all you need to do is run `zotero-plugin release` and select the desired version number. Everything else will be handled automatically.

## Quick Start

Add the following to your `package.json`:

```json
{
  "script": {
    "release": "zotero-plugin release"
  }
}
```

Then run `npm run release`. Scaffold will release your plugin in two steps:

1. Bump the version number.
2. Publish the plugin to GitHub.

### Bump Version

Scaffold uses [Bumpp](https://github.com/antfu/bumpp) to handle version bumps. When you run `npm run release` locally, Scaffold will prompt you to select a version:

```bash
$ npm run release

1 Commits since f6b232c:

3d37b5e  chore (deps)  : bump scaffold

? Current version 1.21.11 »
            major 2.0.0
            minor 1.22.0
            patch 1.21.12
>            next 1.21.12
        pre-patch 1.21.12-beta.1
        pre-minor 1.22.0-beta.1
        pre-major 2.0.0-beta.1
            as-is 1.21.11
           custom ...
```

Use the `↑` / `↓` keys to choose the [release type (Semantic Versioning)](https://semver.org/) and press Enter to confirm. You’ll then be asked to confirm the selected version.

```bash
√ Current version 1.21.11 »          next 1.21.12

   files package.json
  commit chore(publish): release v1.21.12
     tag v1.21.12
 execute pnpm build
    push yes

    from 1.21.11
      to 1.21.12

? Bump? » (Y/n)
```

Scaffold will perform the following actions automatically:

1. Update the `version` field in `package.json` to the selected version.
2. Run any (pre/post)version scripts defined in `package.json`.
3. Execute the `release:version` hook.
4. Commit the modified files.
5. Create a `git tag` in the format `v{version}`.
6. Push the changes to the repository.

### Publish XPI and `update.json`

After bumping the version, Scaffold enters the publish phase, during which it:

1. Creates a GitHub release tagged `v{version}` and uploads the XPI as an asset.
2. Creates a GitHub release tagged `release` and uploads `update.json` and `update-beta.json` as assets.

By default, Scaffold expects you to publish your plugin on CI. To publish locally, see [Publish Locally](#publish-locally).

For GitHub users, here’s a typical workflow:

```yml
name: Release

on:
  push:
    tags:
      - v**

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    env:
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install deps
        run: npm install

      - name: Build
        run: npm run build

      - name: Release to GitHub
        run: npm run release
```

## Advanced Configuration

You can customize confirmation prompts, commit messages, Git tag templates, and more via `release.bumpp`.

```ts twoslash
import { defineConfig } from "zotero-plugin-scaffold";
// ---cut---
export default defineConfig({
  release: {
    bumpp: {
      release: "prompt",
      confirm: true,
      all: true,
      commit: "chore(publish): release v%s",
      tag: "v%s"
    }
  }
});
```

Note: The `release.bumpp.release='prompt'` runs only locally. If you run `release` in CI, the `prompt` operation will be skipped.

The release process also provides hooks for customization:

```ts twoslash
import { defineConfig } from "zotero-plugin-scaffold";
// ---cut---
export default defineConfig({
  release: {
    bumpp: {
      execute: "npm run build"
    },
    hooks: {
      "release:init": (ctx) => {},
      "release:push": (ctx) => {},
      "release:done": (ctx) => {},
    }
  }
});
```

The `release.bumpp.execute` hook is triggered after updating the `version` in `package.json` but before `git commit`. This is typically used for build tasks.

Note: If the build process modifies files other than `package.json`, you also need to set `release.bumpp.all` to `true`.

## Publish Locally

Scaffold defaults to publishing plugins in CI, but you can configure it for local publishing.

First, set the `GITHUB_TOKEN` in your `.env` file:

```ini
GITHUB_TOKEN=xxxx-xxxx-xxxx-xxxx
```

Next, you need to run the build task after bumping the version to ensure the artifacts in `dist` are up to date.

```ts twoslash
import { defineConfig } from "zotero-plugin-scaffold";
// ---cut---
export default defineConfig({
  release: {
    bumpp: {
      execute: "npm run build"
    }
  }
});
```

Finally, set `release.github.enable` to `local` in the Scaffold configuration:

```ts twoslash
import { defineConfig } from "zotero-plugin-scaffold";
// ---cut---
export default defineConfig({
  release: {
    github: {
      enable: "local"
    }
  }
});
```

## Changelog

By default, Scaffold uses [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) for the changelog, but you can modify this via `release.changelog`.

```ts twoslash
import { defineConfig } from "zotero-plugin-scaffold";
// ---cut---
export default defineConfig({
  release: {
    changelog: (ctx, commits) => {
      return commits.map(c => c.message).join("\n");
    }
  }
});
```
