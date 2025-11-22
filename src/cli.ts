import type { Base } from "./core/base.js";
import type { Context, OverrideConfig } from "./types/index.js";
import process from "node:process";
import { Command } from "commander";
import { name, version } from "../package.json" with { type: "json" };
import { Build, Config, Release, Serve, Test } from "./index.js";
import { checkGitIgnore } from "./utils/gitignore.js";
import { logger } from "./utils/logger.js";
import { updateNotifier } from "./utils/updater.js";

async function main() {
  updateNotifier(name, version);

  // Env variables are initialized to dev, but can be overridden by each command
  // For example, "zotero-plugin build" overrides them to "production"
  process.env.NODE_ENV ??= "development";

  const cli = new Command();

  cli
    .version(version)
    .usage("<command> [options]");
  // .option("--config-cwd <config>", "The cwd for search configuration file");

  cli
    .command("build")
    .description("Build the plugin")
    .option("--dev", "Builds the plugin in dev mode")
    .option("--dist <dir>", "The relative path for the new output directory (default: build)")
    .action(async (options) => {
      process.env.NODE_ENV = options.dev ? "development" : "production";
      await runCommand(Build, {
        dist: options.dist,
      });
    });

  cli
    .command("serve")
    .alias("dev")
    .description("Start development server")
    // .option(
    //   "--skip-build",
    //   "skip building website before deploy it (default: false)",
    // )
    // .option(
    //   "--only-start",
    //   "skip building website before deploy it (default: false)",
    // )
    .action(async (_options) => {
      await runCommand(Serve, {});
    });

  cli.command("test")
    .description("Run tests")
    .option("--abort-on-fail", "Abort the test suite on first failure")
    .option("--exit-on-finish", "Exit the test suite after all tests have run")
    .option("--no-watch", "Exit the test suite after all tests have run")
    .action(async (options) => {
      process.env.NODE_ENV = "test";
      await runCommand(Test, {
        test: {
          abortOnFail: options.abortOnFail,
          watch: !options.exitOnFinish && options.watch,
        },
      });
    });

  cli
    .command("create")
    .description("Create the plugin template")
    .action(async (_options: any) => {
      logger.error("The create not yet implemented");
      // new Create().run();
    });

  cli
    .command("release")
    .description("Release the plugin")
    .argument("[version]", "Target version: major, minor, patch, pre*, or specify version")
    .option("--preid <preid>", "ID for prerelease")
    .option("-y, --yes", "Skip confirmation")
    .action(async (version, options) => {
      process.env.NODE_ENV = "production";
      await runCommand(Release, {
        release: {
          bumpp: {
            release: version,
            preid: options.preid,
            confirm: !options.yes,
          },
        },
      });
    });

  cli.arguments("<command>").action((cmd) => {
    cli.outputHelp();
    logger.error(`Unknown command name "${cmd}".`);
  });

  cli.parse();
}

type Constructor<T> = new (ctx: Context) => T;

export async function runCommand<T extends Base>(
  CommandClass: Constructor<T>,
  config: OverrideConfig,
): Promise<void> {
  const ctx = await Config.loadConfig(config);
  const instance = new CommandClass(ctx);
  process.on("SIGINT", instance.exit.bind(instance));
  await instance.run();
}

export default async function mainWithErrorHandler(): Promise<void> {
  main()
    .then(() => {
      checkGitIgnore();
    })
    .catch(onError);

  process.on("uncaughtException", onError);
}

function onError(err: Error) {
  logger.error(err);
  // For tinyexec - bumpp
  // @ts-expect-error tinyexec's NonZeroExitError has output.stderr
  if (err.output) {
    // @ts-expect-error tinyexec's NonZeroExitError has output.stderr
    logger.log(err.output.stderr);
  }
  process.exit(1);
}
