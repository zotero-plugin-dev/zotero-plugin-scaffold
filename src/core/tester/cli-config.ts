import type { Context } from "../../types/index.js";
/**
 * Generates the temporary vitest config that the `zotero-plugin test` CLI
 * delegates to. The config wires the zotero pool (same implementation the
 * user would configure manually — the CLI is a thin wrapper).
 */
import { join, relative } from "node:path";
import process from "node:process";
import { toArray } from "../../utils/string.js";

export function generateVitestConfig(ctx: Context): string {
  const entries = toArray(ctx.test.entries);
  const include = entries.map(entry =>
    `${entry.replace(/[\\/]+$/, "")}/**/*.{spec,test}.?(c|m)[jt]s?(x)`,
  );

  // The plugin's built source, as a cwd-relative path for the pool launcher.
  const sep = String.fromCharCode(92);
  const pluginDir = relative(process.cwd(), join(ctx.dist, "addon"))
    .split(sep)
    .join("/") || ".";

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
    bail: ${ctx.test.abortOnFail ? 1 : 0},
    pool: zoteroPool({
      pluginDir: ${JSON.stringify(pluginDir)},
      pluginId: ${JSON.stringify(ctx.id)},
      startupDelay: ${ctx.test.startupDelay},
      extraPrefs: ${JSON.stringify(ctx.test.prefs)},
    }),
  },
});
`;
}
