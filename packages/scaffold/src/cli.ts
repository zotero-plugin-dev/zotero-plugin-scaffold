import type { Base, OverrideConfig } from "@zotero-plugin/config";
import type { VersionBumpRelease } from "@zotero-plugin/releaser";
import type { Context, UserConfig } from "./types.js";

import process from "node:process";
import { checkGitIgnore, logger } from "@zotero-plugin/utils";
import { Command } from "commander";
import { name, version } from "../package.json" with { type: "json" };
import { loadConfig } from "./config.js";
import { Builder, DevServer, Releaser, Tester } from "./index.js";
import { updateNotifier } from "./updater.js";

async function main(presetCommand?: string) {
  updateNotifier(name, version);

  // Env variables are initialized to dev, but can be overridden by each command
  // For example, "zotero-plugin build" overrides them to "production"
  process.env.NODE_ENV ??= "development";

  const cli = new Command();

  cli
    .version(version)
    .usage("<command> [options]");
  // .option("--config-cwd <config>", "The cwd for search configuration file");

  if (presetCommand) {
    // A short bin implies its command by name alone (`zotest --help` is
    // `zotero-plugin test --help`), so the usage line should not repeat the
    // command name it was given: "zotest [options]", not "zotest test [options]".
    cli.configureHelp({
      commandUsage: cmd => `${cli.name()} ${cmd.usage()}`.trim(),
    });
  }

  cli
    .command("build")
    .description("Build the plugin")
    .option("--dev", "Builds the plugin in dev mode")
    .option("--dist <dir>", "The relative path for the new output directory (default: build)")
    .action(async (options) => {
      process.env.NODE_ENV = options.dev ? "development" : "production";
      await runCommand(Builder, {
        dist: options.dist,
      });
    });

  cli
    .command("dev")
    .alias("serve")
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
      await runCommand(DevServer, {});
    });

  cli.command("test")
    .description("Run tests")
    .option("--abort-on-fail", "Abort the test suite on first failure")
    .option("--exit-on-finish", "Exit the test suite after all tests have run")
    .option("--no-watch", "Exit the test suite after all tests have run")
    .action(async (options) => {
      process.env.NODE_ENV = "test";
      await runCommand(Tester, {
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
      await runCommand(Releaser, {
        release: {
          bumpp: {
            release: version as VersionBumpRelease,
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

  // Short bins (`zotest`, `zodev`, ...) are just `zotero-plugin <command>` with the
  // command injected in front of the user arguments, so both forms stay in sync.
  cli.parse(
    presetCommand
      ? [
          ...process.argv.slice(0, 2),
          presetCommand,
          ...process.argv.slice(2),
        ]
      : undefined,
  );
}

type Constructor<T> = new (ctx: Context) => T;

export async function runCommand<T extends Base>(
  CommandClass: Constructor<T>,
  config: OverrideConfig<UserConfig>,
): Promise<void> {
  const ctx = await loadConfig(config);
  const instance = new CommandClass(ctx);
  process.on("SIGINT", instance.exit.bind(instance));
  await instance.run();
}

/**
 * @param presetCommand The subcommand implied by the invoked bin name,
 * e.g. `zotest --no-watch` is `zotero-plugin test --no-watch`.
 */
export default async function mainWithErrorHandler(presetCommand?: string): Promise<void> {
  main(presetCommand)
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
