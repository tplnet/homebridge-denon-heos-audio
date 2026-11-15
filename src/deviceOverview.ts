/**
 * Overview of all devices: manually configured ones and the ones found by the device discovery,
 * with the information whether (and how) they were added. Logged as a table after the discovery.
 */
export type DeviceStatus =
  | "manual" // added from the manual configuration
  | "auto" // added automatically
  | "autoAddDisabled" // found, but automatic adding is disabled
  | "excluded" // found, but listed in excludedSerialNumbers
  | "unreachable" // found, but neither control protocol answered
  | "unsupported"; // found, but no usable configuration could be built

export interface OverviewEntry {
  serialNumber: string;
  name: string;
  model?: string;
  ip: string;
  protocol?: string;
  status: DeviceStatus;
  found: boolean;
}

const STATUS_TEXT: Record<DeviceStatus, string> = {
  manual: "added manually",
  auto: "added automatically",
  autoAddDisabled: "not added (automatic adding disabled)",
  excluded: "not added (excluded)",
  unreachable: "not added (not reachable)",
  unsupported: "not added (no supported protocol)",
};

export class DeviceOverview {
  private readonly entries = new Map<string, OverviewEntry>();

  /** A device from the manual configuration (found = false until the discovery finds it). */
  addManual(device: { serialNumber: string; name: string; ip: string; controlProtocol: string }) {
    this.entries.set(device.serialNumber.toUpperCase(), {
      serialNumber: device.serialNumber,
      name: device.name,
      ip: device.ip,
      protocol: device.controlProtocol,
      status: "manual",
      found: false,
    });
  }

  /** A device found by the discovery. A manually configured device keeps its status and name. */
  addDiscovered(device: { serialNumber: string; name: string; model?: string; ip: string; protocol?: string; status: DeviceStatus }) {
    const key = device.serialNumber.toUpperCase();
    const existing = this.entries.get(key);
    if (existing?.status === "manual") {
      existing.found = true;
      existing.model = device.model;
      return;
    }
    this.entries.set(key, { ...device, found: true });
  }

  get(serialNumber: string): OverviewEntry | undefined {
    return this.entries.get(serialNumber.toUpperCase());
  }

  /** Log lines: a summary line and one aligned line per device. */
  format(discoveryEnabled: boolean): string[] {
    const entries = [...this.entries.values()].sort((a, b) => a.name.localeCompare(b.name));
    const count = (status: DeviceStatus) => entries.filter((entry) => entry.status === status).length;
    const found = entries.filter((entry) => entry.found).length;
    const notAdded = entries.length - count("manual") - count("auto");
    const summary =
      `Device overview: ${found} found in the network, ${count("auto")} added automatically, ` +
      `${count("manual")} added manually, ${notAdded} not added.`;
    if (entries.length === 0) {
      return [summary, "No devices configured or found."];
    }

    const rows = entries.map((entry) => [
      entry.name,
      entry.model ?? "",
      entry.ip,
      entry.serialNumber,
      entry.protocol ?? "",
      STATUS_TEXT[entry.status] + (discoveryEnabled && entry.status === "manual" && !entry.found ? ", not found in the network" : ""),
    ]);
    const header = ["Name", "Model", "IP address", "Serial number", "Protocol", "Status"];
    const widths = header.map((title, column) => Math.max(title.length, ...rows.map((row) => row[column].length)));
    const line = (row: string[]) =>
      row
        .map((cell, column) => (column === row.length - 1 ? cell : cell.padEnd(widths[column])))
        .join("  ")
        .trimEnd();
    return [summary, line(header), ...rows.map(line)];
  }
}
