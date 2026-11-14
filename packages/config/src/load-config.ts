import type { RecursivePartial } from "@zotero-plugin/utils";
import type { BaseConfig, BaseContext, BaseUserConfig, SliceDescriptor, TemplateData, UserPackageJson } from "./types.js";
import { dateFormat, logger, parseRepoUrl, template } from "@zotero-plugin/utils";
import { loadConfig as c12 } from "c12";
import { kebabCase } from "es-toolkit";
import { readJsonSync } from "fs-extra/esm";
import { createHooks } from "hookable";

/**
 * Loads the user configuration, resolves all defaults and slice-specific
 * transformations, and assembles the command context.
 *
 * @param options Configuration engine options.
 * @param options.defaults Default configuration, usually a composition of the base defaults and all slice defaults.
 * @param options.overrides Highest priority configuration, e.g. CLI arguments.
 * @param options.slices Slice descriptors contributed by the command packages.
 */
export async function loadConfig<
  TUser extends BaseUserConfig = BaseUserConfig,
  TCtx extends BaseContext = BaseContext,
>(options: {
  defaults: TUser;
  overrides?: RecursivePartial<TUser>;
  slices?: SliceDescriptor[];
}): Promise<TCtx> {
  const result = await c12<TUser>({
    name: "zotero-plugin",
    dotenv: true,
    packageJson: true,

    defaults: options.defaults,
    overrides: options.overrides as TUser | undefined,
  });

  const config = result.config as unknown as BaseConfig & Record<string, any>;

  if (config.logLevel)
    logger.setLogLevel(config.logLevel);

  // Load user's package.json
  const pkgUser = readJsonSync("package.json", {
    encoding: "utf-8",
  }) as UserPackageJson;
  const { name, version } = pkgUser;
  const repoUrl = typeof pkgUser.repository === "string"
    ? pkgUser.repository
    : pkgUser.repository?.url;
  const { owner, repo } = parseRepoUrl(repoUrl);

  // Parsing dynamic default values
  config.name ||= name;
  config.id ||= config.name;
  config.namespace ||= config.name;
  config.xpiName ||= kebabCase(config.name);

  // Parse template strings in config
  const isPreRelease = version.includes("-");
  const templateData: TemplateData = {
    owner,
    repo,
    version,
    isPreRelease,
    updateJson: isPreRelease ? "update-beta.json" : "update.json",
    xpiName: config.xpiName,
    buildTime: dateFormat("YYYY-mm-dd HH:MM:SS", new Date()),
  };
  config.updateURL = template(config.updateURL, templateData);
  config.xpiDownloadLink = template(config.xpiDownloadLink, templateData);

  // Let each command slice patch its own configuration
  for (const slice of options.slices ?? []) {
    slice.resolve?.(config, templateData, pkgUser);
  }

  const hooks = createHooks<any>();
  for (const slice of options.slices ?? []) {
    for (const registry of slice.hooksOf?.(config) ?? []) {
      hooks.addHooks(registry);
    }
  }

  return {
    ...config,
    pkgUser,
    version,
    hooks,
    logger,
    templateData,
  } as unknown as TCtx;
}
