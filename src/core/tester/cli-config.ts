import type { Context } from "../../types/index.js";
import { join, relative } from "node:path";
import process from "node:process";
import { toArray } from "../../utils/string.js";

/**
 * Generates the temporary vitest config that the `zotero-plugin test` CLI
 * delegates to. The config wires the zotero pool (same implementation the
 * user would configure manually — the CLI is a thin wrapper).
 */

export function generateVitestConfig(ctx: Context): string {
  const entries = toArray(ctx.test.entries);
  const include = entries.map(entry =>
    `${entry.replace(/[\\/]+$/, "")}/**/*.{spec,test}.?(c|m)[jt]s?(x)`,
  );
  // The legacy test.waitForPlugin flag becomes a vitest setupFile: the CLI
  // writes .scaffold/setup-wait-plugin.js (see Test.run) that polls the
  // expression before any test starts. The pool bundles setupFiles into the
  // page like test files, and the wait shows up in vitest's "setup" duration.
  const waitForPlugin = ctx.test.waitForPlugin?.trim();
  const setupFiles = waitForPlugin && waitForPlugin !== "() => true"
    ? `,
    setupFiles: [${JSON.stringify(join(process.cwd(), ".scaffold", "setup-wait-plugin.js"))}]`
    : "";

  // The plugin's built source, as a cwd-relative path for the pool launcher.
  const sep = String.fromCharCode(92);
  const pluginDir = relative(process.cwd(), join(ctx.dist, "addon"))
    .split(sep)
    .join("/") || ".";

  const reporter = ctx.test.reporter
    ? `,\n    reporters: ${JSON.stringify(ctx.test.reporter)}`
    : "";
  const outputFile = ctx.test.outputFile
    ? `,\n    outputFile: ${JSON.stringify(ctx.test.outputFile)}`
    : "";

  return `import { defineConfig } from "vitest/config";
import { zoteroPool } from "zotero-plugin-scaffold/vitest";

export default defineConfig({
  test: {
    include: ${JSON.stringify(include)},
    // One Zotero instance for the whole run: files execute serially and the
    // pool worker is reused (canReuse) instead of booting Zotero per file.
    isolate: false,
    fileParallelism: false,
    testTimeout: ${ctx.test.vitest.timeout},
    hookTimeout: ${ctx.test.vitest.timeout},
    bail: ${ctx.test.abortOnFail ? 1 : 0}${reporter}${outputFile}${setupFiles},
    pool: zoteroPool({
      pluginDir: ${JSON.stringify(pluginDir)},
      pluginId: ${JSON.stringify(ctx.id)},
      extraPrefs: ${JSON.stringify(ctx.test.prefs)},
    }),
  },
});
`;
}
