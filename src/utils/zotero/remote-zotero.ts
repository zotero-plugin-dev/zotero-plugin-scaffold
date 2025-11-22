/*
 * This file is part of Zotero Plugin Scaffold, distributed under the terms of
 * the GNU Affero General Public License (AGPL-3.0-or-later).
 *
 * Portions of this file are derived from code originally licensed under the
 * Mozilla Public License, Version 2.0 (MPL-2.0). The original MPL-2.0 licensed
 * code can be found at:
 * - WebExt (MPL-2.0): https://github.com/mozilla/web-ext/blob/master/src/firefox/rdp-client.js.
 *
 * Other portions of this file are derived from code originally licensed under the
 * MIT License. The original MIT licensed code can be found at:
 * - Extension.js (MIT): https://github.com/extension-js/extension.js/blob/main/programs/develop/plugin-browsers/run-firefox/remote-firefox/messaging-client.ts
 *
 * Modifications to the original MPL-2.0 and MIT licensed code are distributed under
 * the terms of the AGPL-3.0-or-later license. As required by the MPL-2.0, this file
 * retains its original license for the derived portions.
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later AND MPL-2.0 AND MIT
 *
 * For details, see the LICENSE file in the root of this project.
 */

import net from "node:net";

import { logger } from "../logger.js";
import { MessagingClient } from "./rdp-client.js";

const MAX_RETRIES = 150;
const RETRY_INTERVAL = 1000;

// NOTE: this type aliases Object to catch any other possible response.

// Convert a request rejection to a message string.
function requestErrorToMessage(err: any) {
  if (err instanceof Error) {
    return String(err);
  }
  return `${err.error}: ${err.message}`;
}

export function isErrorWithCode(codeWanted: any, error: any) {
  if (Array.isArray(codeWanted) && codeWanted.includes(error.code)) {
    return true;
  }
  else if (error.code === codeWanted) {
    return true;
  }

  return false;
}

export class RemoteFirefox {
  client;
  checkedForAddonReloading;

  constructor() {
    this.client = new MessagingClient();
    this.checkedForAddonReloading = false;

    this.client.on("disconnect", () => {
      logger.debug("Received \"disconnect\" from Firefox client");
    });
    this.client.on("end", () => {
      logger.debug("Received \"end\" from Firefox client");
    });
    this.client.on("unsolicited-event", (info) => {
      logger.debug(`Received message from client: ${JSON.stringify(info)}`);
    });
    this.client.on("rdp-error", (rdpError) => {
      logger.debug(`Received error from client: ${JSON.stringify(rdpError)}`);
    });
    this.client.on("error", (error) => {
      logger.debug(`Received error from client: ${String(error)}`);
    });
  }

  async connect(port: number) {
    let lastError;

    for (const _ of Array.from({ length: MAX_RETRIES })) {
      try {
        this.client = new MessagingClient();
        await this.client.connect(port);
        return this.client;
      }
      catch (error: any) {
        logger.debug("Failed to connecte to RDP client, retry...");
        if (isErrorWithCode("ECONNREFUSED", error)) {
          await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL));
          lastError = error;
        }
        else {
          throw error;
        }
      }
    }

    logger.error(`Unable to connect to Zotero. Too many retries.`);
    throw lastError;
  }

  disconnect() {
    this.client.disconnect();
  }

  private async addonRequest(addon: any, request: string) {
    try {
      const response = await this.client.request({
        to: addon.actor,
        type: request,
      });
      return response;
    }
    catch (err) {
      logger.debug(`Client responded to '${request}' request with error: ${err}`);
      const message = requestErrorToMessage(err);
      throw new Error(`Remote Firefox: addonRequest() error: ${message}`);
    }
  }

  private async getAddonsActor() {
    try {
      // getRoot should work since Firefox 55 (bug 1352157).
      const response = await this.client.request("getRoot");
      if (response.addonsActor == null) {
        return Promise.reject(
          new Error(
            "This version of Firefox does not provide an add-ons actor for "
            + "remote installation.",
          ),
        );
      }
      return response.addonsActor;
    }
    catch (err) {
      // Fallback to listTabs otherwise, Firefox 49 - 77 (bug 1618691).
      logger.debug(`Falling back to listTabs because getRoot failed", ${err}`);
    }

    try {
      const response = await this.client.request("listTabs");
      // addonsActor was added to listTabs in Firefox 49 (bug 1273183).
      if (response.addonsActor == null) {
        logger.debug(
          "listTabs returned a falsey addonsActor: "
          + `${JSON.stringify(response)}`,
        );
        return Promise.reject(
          new Error(
            "This is an older version of Firefox that does not provide an "
            + "add-ons actor for remote installation. Try Firefox 49 or "
            + "higher.",
          ),
        );
      }
      return response.addonsActor;
    }
    catch (err) {
      logger.debug(`listTabs error: ${err}`);
      const message = requestErrorToMessage(err);
      throw new Error(`Remote Firefox: listTabs() error: ${message}`);
    }
  }

  async installTemporaryAddon(addonPath: string) {
    const addonsActor = await this.getAddonsActor();

    try {
      const response = await this.client.request({
        to: addonsActor,
        type: "installTemporaryAddon",
        addonPath,
        // openDevTools: true,
      });
      logger.debug(`installTemporaryAddon: ${JSON.stringify(response)}`);
      logger.info(`Installed ${addonPath} as a temporary add-on`);
      return response;
    }
    catch (err) {
      const message = requestErrorToMessage(err);
      throw new Error(`installTemporaryAddon: Error: ${message}`);
    }
  }

  private async getInstalledAddon(addonId: string) {
    try {
      const response = await this.client.request("listAddons");
      for (const addon of response.addons) {
        if (addon.id === addonId) {
          return addon;
        }
      }
      logger.debug(
        `Remote Firefox has these addons: ${response.addons.map((a: any) => a.id)}`,
      );
      return Promise.reject(
        new Error(
          "The remote Firefox does not have your extension installed",
        ),
      );
    }
    catch (err) {
      const message = requestErrorToMessage(err);
      throw new Error(`Remote Firefox: listAddons() error: ${message}`);
    }
  }

  private async checkForAddonReloading(addon: any) {
    if (this.checkedForAddonReloading) {
      // We only need to check once if reload() is supported.
      return addon;
    }
    else {
      /**
       * {
       *   "from": "server1.conn0.webExtensionDescriptor8",
       *   "requestTypes": [
       *     "reload",
       *     "terminateBackgroundScript",
       *     "connect",
       *     "getTarget",
       *     "reloadDescriptor",
       *     "getWatcher"
       *   ]
       * }
       *
       */
      const response = await this.addonRequest(addon, "requestTypes");
      // logger.debug("this.addonRequest(addon, 'requestTypes')", response);

      if (!response.requestTypes.includes("reload")) {
        const supportedRequestTypes = JSON.stringify(response.requestTypes);
        logger.debug(`Remote Firefox only supports: ${supportedRequestTypes}`);
        throw new Error(
          "This Firefox version does not support add-on reloading. "
          + "Re-run with --no-reload",
        );
      }
      else {
        this.checkedForAddonReloading = true;
        return addon;
      }
    }
  }

  async reloadAddon(addonId: string) {
    const addon = await this.getInstalledAddon(addonId);
    // logger.debug(`Reload addon: ${JSON.stringify(addon)}`);
    // Reload addon: {"actor":"server1.conn0.webExtensionDescriptor8","debuggable":true,"hidden":false,"iconURL":"file:///D:/Code/Zotero/zotero-format-metadata/build/addon/content/icons/favicon@0.5x.png","id":"zotero-format-metadata@northword.cn","isSystem":false,"isWebExtension":true,"manifestURL":"moz-extension://d6d93075-0004-4850-b421-30347a44928c/manifest.json","name":"Linter for Zotero","temporarilyInstalled":true,"traits":{"supportsReloadDescriptor":true,"watcher":true},"url":"file:///D:/Code/Zotero/zotero-format-metadata/build/addon/","warnings":[]}
    await this.checkForAddonReloading(addon);
    await this.addonRequest(addon, "reload");
    logger.success(`Last extension reload: ${new Date().toTimeString()}`);
  }
}

export function findFreeTcpPort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr && typeof addr !== "string") {
        const freeTcpPort = addr.port;
        srv.close(() => resolve(freeTcpPort));
      }
    });
  });
}

// export async function findFreeTcpPort() {
//   const srv = net.createServer();
//   srv.listen(0, "127.0.0.1", () => {
//     const freeTcpPort = srv.address()?.port;
//     srv.close();
//     return freeTcpPort;
//   });
// }
