import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { DenonAudioPlatform } from "../../dist/platform.js";
import { ControlMode } from "../../dist/controlMode.js";

const silentLog = { debug() {}, info() {}, success() {}, warn() {}, error() {}, log() {}, prefix: "test" };
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function createPlatform(config) {
  const published = [];
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
    publishExternalAccessories: (_plugin, accessories) => published.push(accessories.map((a) => a.displayName)),
    unregisterPlatformAccessories() {},
  };
  const platform = new DenonAudioPlatform(silentLog, config, api);
  // no device access: each setup takes a different time, like the real protocol check and input query
  const delays = { S3: 30, S1: 5, S2: 15, S4: 1 };
  platform.withCheckedProtocol = async (deviceConfig) => {
    await tick(delays[deviceConfig.serialNumber] ?? 1);
    return deviceConfig;
  };
  platform.createAccessoryHandler = () => ({ setupInputs: async () => {} });
  platform.runDeviceDiscovery = async () => {};
  return { platform, published };
}

const device = (serialNumber, name) => ({ serialNumber, name, ip: "192.0.2.1", controlProtocol: "HEOSCLI" });

describe("stable ports: accessories of the start are published together, sorted by serial number", () => {
  it("without discovery: right after the manual devices are set up", async () => {
    const { platform, published } = createPlatform({ devices: [device("S3", "C"), device("S1", "A"), device("S2", "B")] });
    platform.discoverDevices();
    await tick(60);
    assert.deepEqual(published, [["A", "B", "C"]]);
  });

  it("with discovery: waits for the window and includes the devices found in it", async () => {
    const { platform, published } = createPlatform({ deviceDiscovery: true, autoAddDiscoveredDevices: true, devices: [device("S3", "C")] });
    platform.discoverDevices();
    platform.autoAddDiscoveredDevice("S2", "192.0.2.2", "B", "Denon Home 150", [ControlMode.HEOSCLI]);
    platform.autoAddDiscoveredDevice("S1", "192.0.2.3", "A", "Denon Home 150", [ControlMode.HEOSCLI]);
    await tick(60);
    assert.deepEqual(published, [], "nothing is published while the window is open");
    platform.closeInitialWindow();
    assert.deepEqual(published, [["A", "B", "C"]]);

    // a device found later is published on its own
    platform.autoAddDiscoveredDevice("S4", "192.0.2.4", "D", "Denon Home 150", [ControlMode.HEOSCLI]);
    await tick(20);
    assert.deepEqual(published, [["A", "B", "C"], ["D"]]);
  });

  it("waits for setups still running when the window closes", async () => {
    const { platform, published } = createPlatform({ deviceDiscovery: true, devices: [device("S3", "C"), device("S1", "A")] });
    platform.discoverDevices();
    platform.closeInitialWindow();
    assert.deepEqual(published, []);
    await tick(60);
    assert.deepEqual(published, [["A", "C"]]);
  });
});
