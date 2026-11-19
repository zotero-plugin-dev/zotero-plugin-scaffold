# Playground

A real Zotero plugin for debugging `zotero-plugin-scaffold` by hand: a probe, a temporary red test, a plugin shaped like the ones users ship.
Its sibling [`e2e/`](../e2e) is the automated suite; this one is for what a test cannot express, so it stays free to break while the fixture stays frozen.

## Setup

```bash
pnpm i
pnpm build          # at the repository root: refreshes every packages/*/dist
cp .env.example .env
# then fill ZOTERO_PLUGIN_ZOTERO_BIN_PATH
```

No `pnpm link`: `package.json` depends on `zotero-plugin-scaffold: workspace:*`, so the bins resolve to this repository's `packages/scaffold/bin/*.mjs`.

## Commands

From the repository root, or from this directory without `pnpm play`:

```bash
pnpm play dev       # Zotero with the plugin installed, watch and hot-reload
pnpm play build     # one production build, output in playground/dist
pnpm play test      # run test/ inside a Zotero instance
pnpm play release   # bump, commit, tag
```

## Changing scaffold

| What changed        | What to do                                                                        |
| ------------------- | --------------------------------------------------------------------------------- |
| `playground/**`     | Nothing: `pnpm play dev` hot-reloads it.                                          |
| `packages/*/src/**` | `pnpm dev` refreshes `dist`, but the running command holds the old code: restart. |

Restarting is the boundary of any tool running in a long-lived process; what the workspace removes is switching projects and running `pnpm link`.
No source maps: a stack trace points at `packages/*/dist/*.js`, which is what actually runs.

## Notes

- `dist`, `.scaffold`, `typings` and `.env` are git-ignored; a build recreates the first three.
- `static/` is copied as assets, `src/index.ts` is bundled, and `test/*.test.ts` runs inside Zotero (not Vitest), hence its imports from `zotero-plugin-scaffold/test`.
