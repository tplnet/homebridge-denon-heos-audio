import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { DeviceOverview } from "../../dist/deviceOverview.js";
import { DenonAudioPlatform } from "../../dist/platform.js";
import { ControlMode } from "../../dist/controlMode.js";

describe("device overview", () => {
  it("lists manual, automatically added and not added devices", () => {
    const overview = new DeviceOverview();
    overview.addManual({ serialNumber: "S1", name: "Dining Room", ip: "192.0.2.1", controlProtocol: "HEOSCLI" });
    overview.addManual({ serialNumber: "S2", name: "Cellar", ip: "192.0.2.2", controlProtocol: "HEOSCLI" });
    overview.addDiscovered({ serialNumber: "s1", name: "HEOS name", model: "Denon Home 250", ip: "192.0.2.1", status: "manual" });
    overview.addDiscovered({ serialNumber: "S3", name: "Office", model: "Denon Home 150", ip: "192.0.2.3", protocol: "HEOSCLI", status: "auto" });
    overview.addDiscovered({ serialNumber: "S4", name: "Receiver", model: "Marantz CINEMA 60", ip: "192.0.2.4", protocol: "HYBRID", status: "excluded" });

    const lines = overview.format(true);
    assert.equal(lines[0], "Device overview: 3 found in the network, 1 added automatically, 2 added manually, 1 not added.");
    assert.match(lines[1], /^Name\s+Model\s+IP address\s+Serial number\s+Protocol\s+Status$/);
    const row = (name) => lines.find((line) => line.startsWith(name));
    assert.match(row("Dining Room"), /Denon Home 250 .* added manually$/, "keeps the configured name, adds the model");
    assert.match(row("Cellar"), /added manually, not found in the network$/);
    assert.match(row("Office"), /HEOSCLI\s+added automatically$/);
    assert.match(row("Receiver"), /HYBRID\s+not added \(excluded\)$/);
    // columns are aligned
    assert.equal(new Set(lines.slice(1).map((line) => line.indexOf("192.0.2") === -1 ? line.indexOf("IP address") : line.indexOf("192.0.2"))).size, 1);
  });

  it("doesn't claim 'not found' without discovery", () => {
    const overview = new DeviceOverview();
    overview.addManual({ serialNumber: "S2", name: "Cellar", ip: "192.0.2.2", controlProtocol: "HEOSCLI" });
    assert.match(overview.format(false)[2], /added manually$/);
  });

  it("says so when there are no devices", () => {
    assert.deepEqual(new DeviceOverview().format(true).slice(1), ["No devices configured or found."]);
  });
});

const silentLog = { debug() {}, info() {}, success() {}, warn() {}, error() {}, log() {}, prefix: "test" };

function createPlatform(config) {
  const api = {
    on() {},
    hap: { Service: {}, Characteristic: {}, uuid: { generate: (s) => `uuid-${s}` } },
    platformAccessory: class {
      constructor(displayName, UUID) {
        this.displayName = displayName;
        this.UUID = UUID;
        this.context = {};
      }
    },
  };
  const platform = new DenonAudioPlatform(silentLog, config, api);
  platform.publishNewAccessory = () => {};
  return platform;
}

const device = (serialNumber, friendlyName) => ({ serialNumber, friendlyName, modelName: "Denon Home 150", ip: "127.0.0.1" });

describe("device overview of the platform", () => {
  it("records the status of discovered devices", () => {
    const platform = createPlatform({ autoAddDiscoveredDevices: true, excludedSerialNumbers: ["EXCL"], devices: [] });
    const supported = [ControlMode.HEOSCLI];
    platform.recordDiscovered(device("AUTO", "Office"), { status: "auto", name: "Office", protocol: "HEOSCLI" });
    const result = platform.autoAddDiscoveredDevice("EXCL", "127.0.0.2", "Garage", "Denon Home 150", supported);
    assert.equal(result.status, "excluded");
    assert.equal(platform.autoAddDiscoveredDevice("NEW", "127.0.0.3", "Kitchen", "Denon Home 150", supported).status, "auto");
    assert.equal(platform.deviceOverview.get("AUTO").status, "auto");
  });

  it("logs the overview", () => {
    const lines = [];
    const platform = createPlatform({ deviceDiscovery: true });
    platform.log.info = (line) => lines.push(line);
    platform.deviceOverview.addManual({ serialNumber: "S1", name: "Dining Room", ip: "192.0.2.1", controlProtocol: "HEOSCLI" });
    platform.logOverview();
    assert.match(lines[0], /^Device overview: 0 found in the network, 0 added automatically, 1 added manually, 0 not added\.$/);
    assert.match(lines[2], /added manually, not found in the network$/);
  });
});
