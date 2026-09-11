import { defineConfig, loadConfig } from "./config.js";
import Build from "./core/builder/index.js";
import ManifestCommand from "./core/manifest-command.js";
import Release from "./core/releaser/index.js";
import Serve from "./core/server.js";
import Test from "./core/tester/index.js";

const Config: {
  defineConfig: typeof defineConfig;
  loadConfig: typeof loadConfig;
} = {
  defineConfig,
  loadConfig,
};

export { Build, Config, defineConfig, ManifestCommand, Release, Serve, Test };
