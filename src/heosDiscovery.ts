import { Buffer } from "node:buffer";
import dgram from "node:dgram";
import http from "node:http";
import { EventEmitter } from "node:events";
import os from "node:os";

import { DOMParser } from "@xmldom/xmldom";

/**
 * SSDP search target of HEOS devices (HEOS CLI specification, "Driver Initialization").
 * All HEOS devices (Denon and Marantz) answer to it, other UPnP devices in the network don't.
 */
export const HEOS_SEARCH_TARGET = "urn:schemas-denon-com:device:ACT-Denon:1";

const SSDP_ADDRESS = "239.255.255.250";
const SSDP_PORT = 1900;

export interface DiscoveredHeosDevice {
  serialNumber: string;
  ip: string;
  location: string;
  friendlyName?: string;
  modelName?: string;
  manufacturer?: string;
}

export interface HeosDiscoveryOptions {
  /** How often an M-SEARCH is sent (devices switched on later are found with the next search). */
  searchIntervalMs?: number;
  /** Timeout for fetching a device description. */
  fetchTimeoutMs?: number;
  /** Local IPv4 addresses to search from. Defaults to all external IPv4 interfaces. */
  interfaceAddresses?: string[];
  /** Target of the M-SEARCH (overridable for tests). */
  target?: { address: string; port: number };
  debugLog?: (message: string, ...parameters: unknown[]) => void;
}

/**
 * Parses an SSDP (HTTP over UDP) message into its status line and lower-cased headers.
 */
export function parseSsdpMessage(text: string): { startLine: string; headers: Record<string, string> } {
  const [startLine = "", ...lines] = text.split(/\r?\n/);
  const headers: Record<string, string> = {};
  for (const line of lines) {
    const index = line.indexOf(":");
    if (index > 0) {
      headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
    }
  }
  return { startLine: startLine.trim(), headers };
}

/**
 * Extracts the identifying fields of the root device from a UPnP device description.
 */
export function parseDeviceDescription(xml: string): { serialNumber?: string; friendlyName?: string; modelName?: string; manufacturer?: string } {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const root = doc.getElementsByTagName("device")[0];
  const text = (tag: string) => {
    // prefer the root device's own field, fall back to the first occurrence in the document
    const own = root ? Array.from(root.childNodes).find((node) => (node as { nodeName?: string }).nodeName === tag) : undefined;
    const value = (own ?? doc.getElementsByTagName(tag)[0])?.textContent?.trim();
    return value || undefined;
  };
  return {
    serialNumber: text("serialNumber"),
    friendlyName: text("friendlyName"),
    modelName: text("modelName"),
    manufacturer: text("manufacturer"),
  };
}

/**
 * Minimal SSDP discovery for HEOS devices.
 *
 * Unlike a generic SSDP client it only searches for HEOS devices and doesn't listen to the announcements of all
 * UPnP devices in the network, so it only fetches the descriptions of Denon / Marantz devices: one request per
 * device, with a timeout, and the connection is always closed.
 *
 * Events:
 * - `device` (DiscoveredHeosDevice): a device was found (emitted once per description location)
 * - `error` (Error): a UDP socket failed; the discovery should be restarted
 */
/**
 * True if the location of an SSDP response is a plain HTTP URL on the device that sent the response.
 * Prevents a manipulated response from making the plugin fetch an arbitrary (e.g. external) address.
 */
export function isLocationOfSender(url: URL, remoteAddress: string): boolean {
  const sender = remoteAddress.replace(/^::ffff:/i, "");
  return url.protocol === "http:" && url.hostname === sender && !url.username && !url.password;
}

export class HeosDiscovery extends EventEmitter {
  private readonly searchIntervalMs: number;
  private readonly fetchTimeoutMs: number;
  private readonly interfaceAddresses?: string[];
  private readonly target: { address: string; port: number };
  private readonly debugLog: (message: string, ...parameters: unknown[]) => void;

  private sockets: dgram.Socket[] = [];
  private searchTimer: NodeJS.Timeout | undefined;
  private readonly resolvedLocations = new Set<string>();
  private readonly pendingLocations = new Set<string>();
  private readonly requests = new Set<http.ClientRequest>();
  private stopped = false;

  constructor(options: HeosDiscoveryOptions = {}) {
    super();
    this.searchIntervalMs = options.searchIntervalMs ?? 2 * 60 * 1000;
    this.fetchTimeoutMs = options.fetchTimeoutMs ?? 5000;
    this.interfaceAddresses = options.interfaceAddresses;
    this.target = options.target ?? { address: SSDP_ADDRESS, port: SSDP_PORT };
    this.debugLog = options.debugLog ?? (() => {});
  }

  async start(): Promise<void> {
    const addresses = this.interfaceAddresses ?? HeosDiscovery.externalIPv4Addresses();
    if (addresses.length === 0) {
      throw new Error("No IPv4 network interface found for the device discovery.");
    }

    for (const address of addresses) {
      try {
        this.sockets.push(await this.openSocket(address));
      } catch (error) {
        this.debugLog(`Device discovery can't use interface ${address}:`, error instanceof Error ? error.message : error);
      }
    }
    if (this.sockets.length === 0) {
      throw new Error(`Device discovery could not open a socket on any interface (${addresses.join(", ")}).`);
    }

    this.search();
    this.searchTimer = setInterval(() => this.search(), this.searchIntervalMs);
    this.searchTimer.unref?.();
  }

  stop() {
    this.stopped = true;
    clearInterval(this.searchTimer);
    this.requests.forEach((request) => request.destroy());
    this.requests.clear();
    for (const socket of this.sockets) {
      try {
        socket.close();
      } catch {
        // already closed
      }
    }
    this.sockets = [];
  }

  /** Sends an M-SEARCH on all interfaces. */
  search() {
    const message = Buffer.from(
      [
        "M-SEARCH * HTTP/1.1",
        `HOST: ${SSDP_ADDRESS}:${SSDP_PORT}`,
        'MAN: "ssdp:discover"',
        "MX: 3",
        `ST: ${HEOS_SEARCH_TARGET}`,
        "",
        "",
      ].join("\r\n"),
    );
    for (const socket of this.sockets) {
      socket.send(message, this.target.port, this.target.address, (error) => {
        if (error) {
          this.fail(error);
        }
      });
    }
  }

  private openSocket(address: string): Promise<dgram.Socket> {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
      socket.once("error", reject);
      socket.bind({ address: address, port: 0 }, () => {
        socket.removeListener("error", reject);
        socket.on("error", (error) => this.fail(error));
        socket.on("message", (message, remote) => this.handleMessage(message.toString(), remote.address));
        try {
          socket.setMulticastInterface(address);
          socket.setMulticastTTL(2);
        } catch {
          // not supported for this address (e.g. loopback in tests) - unicast still works
        }
        resolve(socket);
      });
    });
  }

  private fail(error: Error) {
    if (!this.stopped) {
      this.emit("error", error);
    }
  }

  private handleMessage(text: string, remoteAddress: string) {
    const { startLine, headers } = parseSsdpMessage(text);
    if (!startLine.startsWith("HTTP/1.1 200") || headers["st"] !== HEOS_SEARCH_TARGET || !headers["location"]) {
      return;
    }

    const location = headers["location"];
    if (this.resolvedLocations.has(location) || this.pendingLocations.has(location)) {
      return;
    }

    let url: URL;
    try {
      url = new URL(location);
    } catch {
      this.debugLog("Ignoring SSDP response with an invalid location:", location);
      return;
    }
    if (!isLocationOfSender(url, remoteAddress)) {
      // Only the description of the device that answered is fetched, never another (e.g. external) address.
      this.debugLog(`Ignoring SSDP response from ${remoteAddress}: its location ${location} points to another host.`);
      return;
    }

    this.pendingLocations.add(location);
    this.resolve(url, remoteAddress)
      .then((device) => {
        if (device && !this.stopped) {
          this.resolvedLocations.add(location);
          this.emit("device", device);
        }
      })
      .catch((error) => {
        // retried with the next search
        this.debugLog(`Could not fetch the description of ${location}:`, error instanceof Error ? error.message : error);
      })
      .finally(() => this.pendingLocations.delete(location));
  }

  private async resolve(url: URL, remoteAddress: string): Promise<DiscoveredHeosDevice | undefined> {
    const xml = await this.fetchText(url);
    const description = parseDeviceDescription(xml);
    if (!description.serialNumber) {
      this.debugLog(`Device description at ${url.href} has no serial number.`);
      return undefined;
    }
    return { ...description, serialNumber: description.serialNumber, ip: remoteAddress, location: url.href };
  }

  /**
   * Fetches a (small) text document. Uses a fresh connection without keep-alive (agent: false), which is always
   * closed afterwards, and a hard timeout for the whole request.
   */
  private fetchText(url: URL): Promise<string> {
    const MAX_SIZE = 512 * 1024;
    return new Promise((resolve, reject) => {
      const request = http.get(url, { agent: false, headers: { connection: "close" } }, (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          request.destroy();
          reject(new Error(`HTTP status ${response.statusCode}`));
          return;
        }
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          body += chunk;
          if (body.length > MAX_SIZE) {
            request.destroy(new Error("description too large"));
          }
        });
        response.on("end", () => resolve(body));
        response.on("error", reject);
      });
      this.requests.add(request);
      const timer = setTimeout(() => request.destroy(new Error(`timeout after ${this.fetchTimeoutMs}ms`)), this.fetchTimeoutMs);
      request.on("error", reject);
      request.on("close", () => {
        clearTimeout(timer);
        this.requests.delete(request);
      });
    });
  }

  private static externalIPv4Addresses(): string[] {
    return Object.values(os.networkInterfaces())
      .flat()
      .filter((info): info is os.NetworkInterfaceInfo => info !== undefined && info.family === "IPv4" && !info.internal)
      .map((info) => info.address);
  }
}
