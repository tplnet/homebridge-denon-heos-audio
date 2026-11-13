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

/** Fake SSDP bus: emits the given services, then either fails or keeps waiting. */
function fakeBus({ services = [], failWith }) {
  const bus = new EventEmitter();
  bus.stopped = false;
  bus.stop = async () => {
    bus.stopped = true;
  };
  bus.discover = async function* () {
    for (const service of services) {
      yield service;
    }
    if (failWith) {
      setImmediate(() => bus.emit("error", failWith));
    }
    await new Promise(() => {}); // a real discovery never ends by itself
  };
  return bus;
}

describe("device discovery", () => {
  it("restarts after the discovery service failed", async () => {
    const { platform, shutdown } = createPlatform();
    const socketError = Object.assign(new Error("send EHOSTUNREACH"), { syscall: "send", code: "EHOSTUNREACH" });
    const buses = [fakeBus({ failWith: socketError }), fakeBus({ services: [{ id: "later-device" }] })];
    const checked = [];
    let created = 0;
    platform.ssdpFactory = async () => buses[created++];
    platform.checkSsdpDevice = async (service) => checked.push(service.id);

    platform.runDeviceDiscovery();
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(created, 2, "discovery was restarted once");
    assert.ok(buses[0].stopped, "the failed bus was stopped");
    assert.deepEqual(checked, ["later-device"], "devices are found after the restart");
    shutdown();
  });

  it("ignores errors of single devices reported by the SSDP library", async () => {
    const { platform, shutdown } = createPlatform();
    let created = 0;
    platform.ssdpFactory = async () => {
      created++;
      return fakeBus({ failWith: new TypeError("fetch failed") });
    };
    platform.checkSsdpDevice = async () => {};

    platform.runDeviceDiscovery();
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(created, 1, "discovery was not restarted");
    shutdown();
  });

  it("keeps running if checking a single device throws", async () => {
    const { platform, shutdown } = createPlatform();
    const checked = [];
    let created = 0;
    platform.ssdpFactory = async () => {
      created++;
      return fakeBus({ services: [{ id: "broken" }, { id: "ok" }] });
    };
    platform.checkSsdpDevice = async (service) => {
      if (service.id === "broken") {
        throw new Error("boom");
      }
      checked.push(service.id);
    };

    platform.runDeviceDiscovery();
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(created, 1);
    assert.deepEqual(checked, ["ok"]);
    shutdown();
  });

  it("retries if the discovery service can't be started", async () => {
    const { platform, shutdown } = createPlatform();
    let attempts = 0;
    platform.ssdpFactory = async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error("EADDRINUSE");
      }
      return fakeBus({});
    };

    platform.runDeviceDiscovery();
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(attempts, 3);
    shutdown();
  });

  it("stops restarting after Homebridge shuts down", async () => {
    const { platform, shutdown } = createPlatform();
    let created = 0;
    platform.ssdpFactory = async () => {
      created++;
      return fakeBus({ failWith: Object.assign(new Error("fail"), { syscall: "bind" }) });
    };

    const running = platform.runDeviceDiscovery();
    await new Promise((resolve) => setTimeout(resolve, 2));
    shutdown();
    await running;
    const createdAtShutdown = created;
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(created, createdAtShutdown, "no restart after shutdown");
  });
});
