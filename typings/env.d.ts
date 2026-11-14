declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: "development" | "production" | "test";
      GITHUB_TOKEN?: string;
      ZOTERO_PLUGIN_ZOTERO_BIN_PATH?: string;
      ZOTERO_PLUGIN_PROFILE_PATH?: string;
      ZOTERO_PLUGIN_KILL_COMMEND?: string;
      ZOTERO_PLUGIN_DATA_DIR?: string;
    }
  }
}

export {};
