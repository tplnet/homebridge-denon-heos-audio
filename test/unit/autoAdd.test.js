import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { DenonAudioPlatform } from "../../dist/platform.js";
import { ControlMode } from "../../dist/controlMode.js";

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
  const published = [];
  // replace the HomeKit part, only the selection logic is tested here
  platform.publishNewAccessory = (deviceConfig, accessory) => published.push({ deviceConfig, accessory });
  return { platform, published };
}

const HEOS = [ControlMode.HEOSCLI];
const BOTH = [ControlMode.AVRCONTROL, ControlMode.HEOSCLI];

describe("auto-adding discovered devices", () => {
  it("adds a discovered device with name and best protocol", () => {
    const { platform, published } = createPlatform({ autoAddDiscoveredDevices: true });
    platform.autoAddDiscoveredDevice("DCPZ000000001", "192.168.1.149", "Patio Music", "Denon Home Amp", BOTH);
    assert.equal(published.length, 1);
    assert.deepEqual(published[0].deviceConfig, {
      name: "Patio Music",
      serialNumber: "DCPZ000000001",
      ip: "192.168.1.149",
      controlProtocol: "HYBRID",
    });
    assert.equal(published[0].accessory.UUID, "uuid-DCPZ000000001");
  });

  it("leaves manually configured devices untouched", () => {
    const manual = { name: "Dining Room", serialNumber: "BMC00000000001", ip: "192.168.1.120", controlProtocol: "HEOSCLI" };
    const { platform, published } = createPlatform({ autoAddDiscoveredDevices: true, devices: [manual] });
    platform.runDeviceDiscovery = async () => {};
    platform.discoverDevices();
    assert.equal(published.length, 1);
    assert.equal(published[0].deviceConfig, manual);

    platform.autoAddDiscoveredDevice("BMC00000000001", "192.168.1.120", "Dining Room Speaker", "Denon Home 250", HEOS);
    assert.equal(published.length, 1);
  });

  it("skips excluded devices (case-insensitive)", () => {
    const { platform, published } = createPlatform({ autoAddDiscoveredDevices: true, excludedSerialNumbers: ["blt00000000002 "] });
    platform.autoAddDiscoveredDevice("BLT00000000002", "192.168.1.111", "Kids Room Speaker", "Denon Home 150", HEOS);
    assert.equal(published.length, 0);
  });

  it("adds each device only once", () => {
    const { platform, published } = createPlatform({ autoAddDiscoveredDevices: true });
    platform.autoAddDiscoveredDevice("BLT00000000003", "192.168.1.112", "Office Speaker", "Denon Home 150", HEOS);
    platform.autoAddDiscoveredDevice("BLT00000000003", "192.168.1.112", "Office Speaker", "Denon Home 150", HEOS);
    assert.equal(published.length, 1);
  });

  it("skips duplicate manual entries for the same serial number", () => {
    const device = { name: "A", serialNumber: "S1", ip: "1.2.3.4", controlProtocol: "HEOSCLI" };
    const { platform, published } = createPlatform({ devices: [device, { ...device, name: "B" }] });
    platform.runDeviceDiscovery = async () => {};
    platform.discoverDevices();
    assert.equal(published.length, 1);
    assert.equal(published[0].deviceConfig.name, "A");
  });
});
