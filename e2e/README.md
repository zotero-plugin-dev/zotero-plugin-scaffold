# e2e

Runs every command through the published bin and the built `dist`, in a copy of [`fixture/`](./fixture).
Nothing imports `packages/*/src`: an alias would stay green while `exports`, `bin`, `files` or the chunk layout are broken.

## Running it

```bash
pnpm build:tsdown && pnpm test:e2e   # refresh dist, then run
pnpm test:e2e                        # run only, if dist is fresh
pnpm -C e2e test                     # the same suite, from this package
```

| Script           | What it does                                   |
| ---------------- | ---------------------------------------------- |
| `pnpm test`      | Every project: unit tests, then this suite     |
| `pnpm test:unit` | Unit tests only (`vitest run --project=!e2e`)  |
| `pnpm test:e2e`  | This project only (`vitest run --project=e2e`) |

The project is defined in [`vitest.config.ts`](./vitest.config.ts) here, and the root config lists `e2e` as a project directory, so both entry points run the same suite. It carries `sequence.groupOrder: 1` because Vitest requires every project of one group to share `maxWorkers`, and this one caps them at 4. Without that file Vitest falls back to its defaults in this package: `**/*.test.ts` also collects `fixture/test/**` (which only runs inside Zotero) and the copies in `.tmp/`, and `hookTimeout` becomes 10 s instead of the minutes a Zotero launch needs.

Only `dist` is required: `tsc --noEmit` emits nothing, so no test can observe it. `pnpm test:e2e` never builds — CI takes `dist` from the `build` job.

`--project` matches the project **name** as a wildcard: `--project=core` matches nothing.

## Zotero

`test/serve*.test.ts` and `test/zotest.test.ts` start a real Zotero and are **not** skipped without one: a suite that silently skips `dev` and `test` would be green without having tested anything.

```bash
cp e2e/.env.example e2e/.env   # then fill ZOTERO_PLUGIN_ZOTERO_BIN_PATH
```

`helpers/cli.ts` reads `e2e/.env` and drops `ZOTERO_PLUGIN_PROFILE_PATH`/`_DATA_DIR`, so a run never touches your own profile. In CI, `setup-zotero` provides the same variable.

The fixture passes `-headless` (Zotero 10), so a run opens no window, and `E2E_HEADED=1 pnpm test:e2e` brings the window back when you want to watch. `playground/` is the other way round: it exists to be looked at.

### Parallelism

Zotero is a singleton _per profile_, not per machine, and everything a case needs lives in its own copy of the fixture — profile, data directory, log directory, both ports, the temporary add-on. So files run in parallel (`maxWorkers: 4`); cases inside a file share a copy and stay sequential.

`serve-signals.test.ts` is a file of its own because it boots Zotero twice on purpose: the second boot _is_ the assertion that the first released its profile.

### Stop at the hook when the artifact is the point

`zotest` writes everything its configuration determines during `test:bundleTests`, and only then starts Zotero. A case about _what the configuration produces_ replaces that hook with `() => process.exit(0)` in its copy of the config: same artifacts, no launch, no 10 s wait budget. That took the slowest case from 22 s to under 4 s, and it generalizes: to assert on a generated file, do not pay for its consumer. Proving nothing launched is the profile directory still being empty — `zotest` creates it, booting fills it.

### Process checks cost as much as launching

On Windows each check spawns PowerShell: ~0.9 s, against ~2.7 s for a boot. So `helpers/zotero.ts` looks once, and again only after a kill was requested — a 200 ms poll loop made one stop cost 4–5 s. `stopDev()` reuses that check as its assertion and skips cleanup when the CLI stopped Zotero itself.

The profile lock is no substitute: a crashed Zotero leaves it behind, so it cannot tell _running_ from _died badly_.

### Do not assert on wall-clock time

`test.startupDelay` only shows up as one line in the generated runner, so the case reads that line instead of timing the run. Wait for the event or read the artifact; in `test/`, `Date.now()` appears once, in a temp-directory name.

## Layout

```
e2e/
├── helpers/    # cli, project (copy + cleanup), events, snapshot, zotero
├── fixture/    # static/ copied as assets, src/ bundled, test/ run inside Zotero
├── snap/       # recorded build output
├── test/       # the suite; Zotero-heavy parts get a file each so they overlap
└── .tmp/       # the copies, git-ignored, one per case
```

Copies stay **inside the repository**: they have no `node_modules`, and the config they load imports `zotero-plugin-scaffold`, which Node resolves by walking up to `e2e/node_modules/`.

`.gitattributes` forces `eol=lf`: two cases edit the fixture config as text, and a CRLF checkout would make their matches miss — asserting against the unchanged config and still passing.

## Writing a case

```ts
import type { Project } from "../helpers/project";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCli } from "../helpers/cli";
import { createProject } from "../helpers/project";

describe("my case", () => {
  let project: Project;

  beforeAll(async () => {
    project = await createProject("my-case");
  });

  afterAll(async () => {
    await project.cleanup();
  });

  it("builds", async () => {
    const result = await runCli("zobuild", [], { cwd: project.dir });

    expect(result.code).toBe(0);
    expect(await project.read("dist/addon/manifest.json")).toContain("Scaffold Fixture Plugin");
  });
});
```

- **One copy per `describe`** — cases cannot see each other's `dist` or event log.
- **One Zotero launch per configuration**, not per assertion.
- **Assert hooks, not log text**: the fixture appends a line per hook to `.scaffold/events.jsonl`, and `readEvents()` asserts the order.
- **Wait for an event** (`waitForEvent`), never `sleep`.
- **Snapshots** go through `updateSnapshotDir()`; `UPDATE_SNAPSHOTS=1` refreshes. The `.xpi` is not byte-compared — its entries are.
- **Long-running commands** use `startCli()`, which returns the child, its output, and an `exited` promise.

On Windows `process.kill()` terminates unconditionally, so the CLI never runs its signal handler (a real Ctrl-C does reach it); those cases assert the outcome — exit 0 where delivered, nothing left on the profile — and clean up with `killZoteroByProfile()`.
