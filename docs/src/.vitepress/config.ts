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
    codeTransformers: [
      transformerTwoslash(),
    ],
  },
});
