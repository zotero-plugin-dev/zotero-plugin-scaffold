import { defineConfig } from "zotero-plugin-scaffold";

/** Hooks talk to the console here; nothing asserts them. */
function ev(name: string) {
  return (): void => {
    console.log(`  [hook] ${name}`);
  };
}

export default defineConfig({
  name: "Scaffold Playground Plugin",
  id: "scaffold-playground@example.com",
  namespace: "scaffold-playground",
  xpiName: "scaffold-playground",
  source: ["src", "static"],
  dist: "dist",
  updateURL: "https://github.com/{{owner}}/{{repo}}/releases/download/release/{{updateJson}}",
  xpiDownloadLink: "https://github.com/{{owner}}/{{repo}}/releases/download/v{{version}}/{{xpiName}}.xpi",

  // Uncomment to follow every step of a command.
  logLevel: "TRACE",

  build: {
    assets: ["static/**/*.*"],
    define: {
      version: "{{version}}",
      buildTime: "{{buildTime}}",
    },
    prefs: {
      prefix: "extensions.scaffold-playground",
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
    ],
    makeUpdateJson: {
      updates: [],
    },
    hooks: {
      "build:init": ev("build:init"),
      "build:copyAssets": ev("build:copyAssets"),
      "build:bundle": ev("build:bundle"),
      "build:pack": ev("build:pack"),
      "build:done": ev("build:done"),
    },
  },

  devServer: {
    devtools: true,
    hooks: {
      "serve:init": ev("serve:init"),
      "serve:ready": ev("serve:ready"),
      "serve:onChanged": ev("serve:onChanged"),
      "serve:onReloaded": ev("serve:onReloaded"),
    },
  },

  test: {
    entries: ["test"],
    // A hand-run leaves Zotero open while you poke at the plugin; `--no-watch`
    // (or `zotest --no-watch`) makes a single run exit by itself instead.
    watch: true,
    hooks: {
      "test:init": ev("test:init"),
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
      "release:done": ev("release:done"),
    },
  },
});
