import { defineConfig, loadConfig } from "./config.js";
import Build from "./core/builder/index.js";
import Release from "./core/releaser/index.js";
import Serve from "./core/server.js";
import Test from "./core/tester/index.js";

const Config = {
  defineConfig,
  loadConfig,
};

export { Build, Config, defineConfig, Release, Serve, Test };
