import { appendFileSync, mkdirSync } from "node:fs";
import { defineConfig } from "zotero-plugin-scaffold";

/** Records a hook; the suite asserts the sequence, not log text. */
function ev(name: string) {
  return (): void => {
    mkdirSync(".scaffold", { recursive: true });
    appendFileSync(".scaffold/events.jsonl", `${name}\n`);
  };
}

export default defineConfig({
  name: "Scaffold Fixture Plugin",
  id: "scaffold-fixture@example.com",
  namespace: "scaffold-fixture",
  xpiName: "scaffold-fixture",
  source: ["src", "static"],
  dist: "dist",
  updateURL: "https://github.com/{{owner}}/{{repo}}/releases/download/release/{{updateJson}}",
  xpiDownloadLink: "https://github.com/{{owner}}/{{repo}}/releases/download/v{{version}}/{{xpiName}}.xpi",

  build: {
    assets: ["static/**/*.*"],
    define: {
      version: "{{version}}",
      buildTime: "{{buildTime}}",
    },
    fluent: {
      ignore: ["ignored-message"],
    },
    prefs: {
      prefix: "extensions.scaffold-fixture",
    },
    esbuildOptions: [
      {
        entryPoints: ["src/index.ts"],
        outfile: "dist/addon/content/scripts/index.js",
        bundle: true,
        format: "iife",
        target: "firefox115",
        platform: "browser",
      },
      {
        entryPoints: ["src/extra.ts"],
        outfile: "dist/addon/content/scripts/extra.js",
        bundle: true,
        format: "iife",
        target: "firefox115",
        platform: "browser",
      },
    ],
    makeUpdateJson: {
      hash: false,
      updates: [
        {
          version: "0.4.5",
          update_link: "https://example.com/example.xpi",
          applications: {
            gecko: {
              strict_min_version: "60.0",
            },
          },
        },
      ],
    },
    hooks: {
      "build:init": ev("build:init"),
      "build:mkdir": ev("build:mkdir"),
      "build:copyAssets": ev("build:copyAssets"),
      "build:makeManifest": ev("build:makeManifest"),
      "build:fluent": ev("build:fluent"),
      "build:bundle": ev("build:bundle"),
      "build:pack": ev("build:pack"),
      "build:makeUpdateJSON": ev("build:makeUpdateJSON"),
      "build:done": ev("build:done"),
    },
  },

  devServer: {
    devtools: false,
    hooks: {
      "serve:init": ev("serve:init"),
      "serve:prebuild": ev("serve:prebuild"),
      "serve:ready": ev("serve:ready"),
      "serve:onChanged": ev("serve:onChanged"),
      "serve:onReloaded": ev("serve:onReloaded"),
    },
  },

  test: {
    entries: ["test"],
    watch: false,
    startupDelay: 500,
    waitForPlugin: "() => !!Zotero.ScaffoldFixture",
    prefs: {
      "extensions.scaffold-fixture.e2ePref": "from-config",
    },
    hooks: {
      "test:init": ev("test:init"),
      "test:prebuild": ev("test:prebuild"),
      "test:bundleTests": ev("test:bundleTests"),
      "test:run": ev("test:run"),
    },
  },

  release: {
    bumpp: {
      release: "prompt",
      confirm: false,
    },
    github: {
      enable: "false",
    },
    hooks: {
      "release:init": ev("release:init"),
      "release:push": ev("release:push"),
      "release:done": ev("release:done"),
    },
  },
});
