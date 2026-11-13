import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import { DenonAudioPlatform } from "../../dist/platform.js";

const silentLog = { debug() {}, info() {}, success() {}, warn() {}, error() {}, log() {}, prefix: "test" };

function createPlatform() {
  const handlers = {};
  const api = {
    on: (event, handler) => (handlers[event] = handler),
    hap: { Service: {}, Characteristic: {}, uuid: { generate: (s) => `uuid-${s}` } },
    platformAccessory: class {},
  };
  const platform = new DenonAudioPlatform(silentLog, { deviceDiscovery: true }, api);
  platform.discoveryRestartDelaysMs = [5];
  return { platform, shutdown: () => handlers.shutdown() };
}

/** Fake discovery: emits the given devices after start, then optionally fails. */
function fakeDiscovery({ devices = [], failWith, startError }) {
  const discovery = new EventEmitter();
  discovery.stopped = false;
  discovery.stop = () => {
    discovery.stopped = true;
  };
  discovery.start = async () => {
    if (startError) {
      throw startError;
    }
    setImmediate(() => {
      devices.forEach((device) => discovery.emit("device", device));
      if (failWith) {
        discovery.emit("error", failWith);
      }
    });
  };
  return discovery;
}

describe("device discovery lifecycle", () => {
  it("restarts after a socket error", async () => {
    const { platform, shutdown } = createPlatform();
    const discoveries = [fakeDiscovery({ failWith: new Error("send EMFILE") }), fakeDiscovery({ devices: [{ serialNumber: "later-device" }] })];
    const checked = [];
    let created = 0;
    platform.discoveryFactory = () => discoveries[created++];
    platform.checkDiscoveredDevice = async (device) => checked.push(device.serialNumber);

    platform.runDeviceDiscovery();
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(created, 2, "discovery was restarted once");
    assert.ok(discoveries[0].stopped, "the failed discovery was stopped");
    assert.deepEqual(checked, ["later-device"], "devices are found after the restart");
    shutdown();
  });

  it("keeps running if checking a single device throws", async () => {
    const { platform, shutdown } = createPlatform();
    const checked = [];
    let created = 0;
    platform.discoveryFactory = () => {
      created++;
      return fakeDiscovery({ devices: [{ serialNumber: "broken" }, { serialNumber: "ok" }] });
    };
    platform.checkDiscoveredDevice = async (device) => {
      if (device.serialNumber === "broken") {
        throw new Error("boom");
      }
      checked.push(device.serialNumber);
    };

    platform.runDeviceDiscovery();
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(created, 1);
    assert.deepEqual(checked, ["ok"]);
    shutdown();
  });

  it("retries if the discovery can't be started", async () => {
    const { platform, shutdown } = createPlatform();
    let attempts = 0;
    platform.discoveryFactory = () => {
      attempts++;
      return fakeDiscovery(attempts < 3 ? { startError: new Error("EADDRINUSE") } : {});
    };

    platform.runDeviceDiscovery();
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(attempts, 3);
    shutdown();
  });

  it("stops after Homebridge shuts down", async () => {
    const { platform, shutdown } = createPlatform();
    let created = 0;
    let last;
    platform.discoveryFactory = () => {
      created++;
      last = fakeDiscovery({ failWith: new Error("fail") });
      return last;
    };

    const running = platform.runDeviceDiscovery();
    await new Promise((resolve) => setTimeout(resolve, 2));
    shutdown();
    await running;
    const createdAtShutdown = created;
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(created, createdAtShutdown, "no restart after shutdown");
    assert.ok(last.stopped);
  });
});
