import { transformerTwoslash } from "@shikijs/vitepress-twoslash";
import { defineConfig } from "vitepress";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Zotero Plugin Scaffold",
  description: "Delivering a Modern and Elegant Development Experience for Zotero Plugins.",
  base: "/zotero-plugin-scaffold/",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: "Home", link: "/" },
      { text: "Docs", link: "/quick-start" },
    ],

    sidebar: [
      {
        text: "Introduction",
        items: [
          { text: "Why", link: "/why" },
          { text: "Quick Start", link: "/quick-start" },
        ],
      },
      {
        text: "Modules",
        items: [
          { text: "Serve", link: "/serve" },
          { text: "Build", link: "/build" },
          { text: "Test", link: "/test" },
          { text: "Release", link: "/release" },
        ],
      },
      {
        text: "Presets",
        items: [
          { text: "ESLint", link: "/eslint" },
        ],
      },
    ],

    socialLinks: [
      { icon: "github", link: "https://github.com/northword/zotero-plugin-scaffold" },
      { icon: "npm", link: "https://npmx.dev/package/zotero-plugin-scaffold" },
    ],

    outline: "deep",
  },

  markdown: {
    // Preload languages that may appear in JSDoc code fences.
    // The twoslash renderer calls `codeToHast` to render the popup JSDoc (e.g. `waitForPlugin`
    // in test.md) without loading the language first, and VitePress highlights all fences of a
    // page concurrently, so an unloaded language would intermittently fail the build with
    // "Language not found". See JSDoc fences in `src/types/config.ts` (`js`, `json`) and
    // `src/core/releaser/changelog.ts` (`bash`). Other languages used in docs are loaded lazily
    // by the normal highlight path and need no preloading.
    languages: ["ts", "js", "json", "bash"],
    codeTransformers: [
      transformerTwoslash(),
    ],
  },
});
