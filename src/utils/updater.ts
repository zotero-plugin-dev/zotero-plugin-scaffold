import process from "node:process";
import tinyUpdateNotifier from "tiny-update-notifier";
import { logger } from "./logger.js";
import { ExitSignals } from "./process.js";

export function updateNotifier(name: string, version: string) {
  tinyUpdateNotifier({ pkg: { name, version } }).then((update) => {
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
