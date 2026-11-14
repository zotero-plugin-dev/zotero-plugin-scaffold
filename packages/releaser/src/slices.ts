import type { SliceDescriptor } from "@zotero-plugin/config";
import { template } from "@zotero-plugin/utils";

/**
 * Patches the release slice: interpolates the GitHub repository template.
 */
export const releaseSlice: SliceDescriptor = {
  resolve(config, templateData) {
    if (!config.release?.github)
      return;

    config.release.github.repository = template(config.release.github.repository, templateData);
  },
  hooksOf: config => [config.release?.hooks ?? {}],
};
