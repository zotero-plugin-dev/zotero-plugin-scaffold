import process from "node:process";
import { ExitSignals, logger } from "@zotero-plugin/utils";
import tinyUpdateNotifier from "tiny-update-notifier";

export function updateNotifier(name: string, version: string): void {
  tinyUpdateNotifier({
    pkg: { name, version },
  }).then((update) => {
    if (update) {
      const notify = () => {
        logger.newLine();
        logger.info(`New version of ${update.name} available!`);
        logger.info(`Update: ${update.current} → ${update.latest} (${update.type})`);
        logger.newLine();
      };
      ExitSignals.forEach(sig => process.once(sig, notify));
    }
  }).catch();
}
