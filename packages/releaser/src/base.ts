import type { ReleaseContext } from "./types.js";
import { Base } from "@zotero-plugin/config";
import { isCI } from "std-env";
import { globSync } from "tinyglobby";

/**
 * Shared base for all release steps.
 *
 * The generic context and logger plumbing lives in {@link Base}; this class
 * only keeps the release-specific helpers.
 */
export abstract class ReleaseBase extends Base<ReleaseContext> {
  isCI: boolean = isCI;

  exit(): void {}

  checkFiles(): void {
    const { dist } = this.ctx;

    if (globSync(`${dist}/*.xpi`).length === 0) {
      throw new Error("No xpi file found, are you sure you have run build?");
    }
  }
}
