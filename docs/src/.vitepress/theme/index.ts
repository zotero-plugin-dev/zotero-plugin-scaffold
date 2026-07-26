import type { EnhanceAppContext } from "vitepress";
import Theme from "vitepress/theme";

import "@shikijs/vitepress-twoslash/style.css";

export default {
  extends: Theme,
  async enhanceApp({ app }: EnhanceAppContext) {
    if (!import.meta.env.SSR) {
      const { default: TwoslashFloatingVue } = await import("@shikijs/vitepress-twoslash/client");
      app.use(TwoslashFloatingVue);
    }
  },
};
