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

// This messaging client acts similar to the web-ext rdp-client.
// https://github.com/mozilla/web-ext/blob/master/src/firefox/rdp-client.js.
// For some reason it seems Firefox requires a remote client to add temporary add-ons.

import { Buffer } from "node:buffer";
import EventEmitter from "node:events";
import net from "node:net";

export const DEFAULT_PORT = 6000;
export const DEFAULT_HOST = "127.0.0.1";

const UNSOLICITED_EVENTS = new Set([
  "tabNavigated",
  "styleApplied",
  "propertyChange",
  "networkEventUpdate",
  "networkEvent",
  "propertyChange",
  "newMutations",
  "frameUpdate",
  "tabListChanged",
]);

interface Message {
  from?: string;
  type?: string;
  error?: any;
}

interface Deferred {
  resolve: (value?: any) => void;
  reject: (reason?: any) => void;
}

// Parse RDP packets: BYTE_LENGTH + ':' + DATA.
function parseMessage(
  data: Buffer,
): {
  remainingData: Buffer;
  parsedMessage?: Message;
  error?: Error;
  fatal?: boolean;
} {
  const dataString = data.toString();
  const separatorIndex = dataString.indexOf(":");

  if (separatorIndex < 1) {
    return { remainingData: data };
  }

  const messageLength = Number.parseInt(dataString.substring(0, separatorIndex), 10);

  if (Number.isNaN(messageLength)) {
    return {
      remainingData: data,
      error: new Error("Error parsing RDP message length"),
      fatal: true,
    };
  }

  if (data.length - (separatorIndex + 1) < messageLength) {
    return { remainingData: data };
  }

  const messageContent = data.slice(
    separatorIndex + 1,
    separatorIndex + 1 + messageLength,
  );
  const remainingData = data.slice(separatorIndex + 1 + messageLength);

  try {
    const parsedMessage = JSON.parse(messageContent.toString());
    return { remainingData, parsedMessage };
  }
  catch (error: any) {
    return { remainingData, error, fatal: false };
  }
}

export class MessagingClient extends EventEmitter {
  private incomingData: Buffer = Buffer.alloc(0);
  private pendingRequests: Array<{ request: any; deferred: Deferred }> = [];
  private activeRequests = new Map<string, Deferred>();
  private connection?: net.Socket;

  constructor() {
    super();
  }

  async connect(port: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      // Socket errors (e.g. ECONNREFUSED) are emitted asynchronously on the
      // connection, so wrapping `net.createConnection()` in a try-catch block
      // is not enough: Zotero may not be listening yet, so such an error must
      // reject the returned promise (which lets the caller retry) instead of
      // surfacing as an uncaught exception that kills the whole process.
      const connectionOptions = { port, host: DEFAULT_HOST };
      const conn = net.createConnection(connectionOptions, () => {
        resolve();
      });
      this.connection = conn;

      conn.on("data", this.onData.bind(this));
      conn.on("error", reject);
      conn.on("end", this.onEnd.bind(this));
      conn.on("timeout", this.onTimeout.bind(this));
      this.expectReply("root", { resolve, reject });
    });
  }

  disconnect(): void {
    if (!this.connection)
      return;
    this.connection.removeAllListeners();
    this.connection.end();
    this.rejectAllRequests(
      new Error("RDP connection closed"),
    );
  }

  private rejectAllRequests(error: Error): void {
    this.activeRequests.forEach((deferred) => {
      deferred.reject(error);
    });
    this.activeRequests.clear();
    this.pendingRequests.forEach(({ deferred }) => {
      deferred.reject(error);
    });
    this.pendingRequests = [];
  }

  async request(requestProps: any): Promise<any> {
    const request
      = typeof requestProps === "string"
        ? { to: "root", type: requestProps }
        : requestProps;

    if (!request.to) {
      throw new Error(`Unexpected RDP request without target actor: ${request.type}`);
    }
    return await new Promise((resolve, reject) => {
      const deferred = { resolve, reject };
      this.pendingRequests.push({ request, deferred });
      this.flushPendingRequests();
    });
  }

  private flushPendingRequests(): void {
    this.pendingRequests = this.pendingRequests.filter(
      ({ request, deferred }: { request: { to: string }; deferred: Deferred }) => {
        if (this.activeRequests.has(request.to))
          return true;

        if (!this.connection) {
          throw new Error("RDP connection closed");
        }

        try {
          const messageString = `${
            Buffer.from(JSON.stringify(request)).length
          }:${JSON.stringify(request)}`;
          this.connection.write(messageString);
          this.expectReply(request.to, deferred);
        }
        catch (err) {
          deferred.reject(err);
        }
        return false;
      },
    );
  }

  private expectReply(targetActor: string, deferred: Deferred): void {
    if (this.activeRequests.has(targetActor)) {
      throw new Error(`${targetActor} does already have an active request`);
    }
    this.activeRequests.set(targetActor, deferred);
  }

  private onData(data: Buffer): void {
    this.incomingData = Buffer.concat([this.incomingData, data]);
    while (this.readMessage());
  }

  private readMessage(): boolean {
    const { remainingData, parsedMessage, error, fatal } = parseMessage(
      this.incomingData,
    );
    this.incomingData = remainingData;

    if (error) {
      this.emit(
        "error",
        new Error(`Error parsing RDP packet: ${String(error)}`),
      );
      if (fatal)
        this.disconnect();
      return !fatal;
    }

    if (!parsedMessage)
      return false;

    this.handleMessage(parsedMessage);
    return true;
  }

  private handleMessage(message: Message): void {
    if (!message.from) {
      if (message.error) {
        this.emit("rdp-error", message);
        return;
      }

      this.emit(
        "error",
        new Error(`Received an RDP message without a sender actor: ${JSON.stringify(message)}`),
      );
      return;
    }

    if (message.type && UNSOLICITED_EVENTS.has(message.type)) {
      this.emit("unsolicited-event", message);
      return;
    }

    if (this.activeRequests.has(message.from)) {
      const deferred = this.activeRequests.get(message.from);
      this.activeRequests.delete(message.from);
      if (message.error) {
        deferred?.reject(message);
      }
      else {
        deferred?.resolve(message);
      }
      this.flushPendingRequests();
      return;
    }

    // Dirty Patch by Northword
    // Ignore this response, otherwish will error:
    // Error: Received unexpected message:
    //   {"from":"root","type":"addonListChanged"}
    if (message.type === "addonListChanged")
      return;

    this.emit(
      "error",
      new Error(`Received unexpected message:\n ${JSON.stringify(message)}`),
    );
  }

  onError(error: Error): void {
    this.emit("error", error);
  }

  onEnd(): void {
    this.emit("end");
  }

  onTimeout(): void {
    this.emit("timeout");
  }
}
