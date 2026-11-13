import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as hap from "@homebridge/hap-nodejs";

import { DenonAudioAccessory } from "../../dist/platformAccessory.js";

const silentLog = { debug() {}, info() {}, success() {}, warn() {}, error() {}, log() {}, prefix: "test" };

function createAccessory() {
  const platform = { api: { hap }, Service: hap.Service, Characteristic: hap.Characteristic };
  const accessory = new hap.Accessory("Test Speaker", hap.uuid.generate("power-state-test"));
  const handler = new DenonAudioAccessory(
    platform,
    accessory,
    { name: "Test Speaker", serialNumber: "S", ip: "127.0.0.1", controlProtocol: "HEOSCLI", powerOnFavorite: 0 },
    silentLog,
  );
  // the device still reports the old state right after switching
  let deviceState = true;
  handler.denonClient = {
    setPower: async () => true,
    getPower: async () => deviceState,
  };
  return { handler, setDeviceState: (value) => (deviceState = value) };
}

describe("power state after switching", () => {
  it("reports the new state while the device still reports the old one", async () => {
    const { handler } = createAccessory();
    await handler.setActive(hap.Characteristic.Active.INACTIVE);
    assert.equal(await handler.getActive(), false);
  });

  it("uses the device state again after the settle time", async () => {
    const { handler } = createAccessory();
    await handler.setActive(hap.Characteristic.Active.INACTIVE);
    handler.pendingActive.until = Date.now() - 1;
    assert.equal(await handler.getActive(), true);
  });

  it("a different state reported by the device wins", async () => {
    const { handler } = createAccessory();
    await handler.setActive(hap.Characteristic.Active.INACTIVE);
    handler.callbackActive(true); // e.g. started in the HEOS app
    assert.equal(await handler.getActive(), true);
  });

  it("rejects an invalid power on favorite", () => {
    const platform = { api: { hap }, Service: hap.Service, Characteristic: hap.Characteristic };
    const accessory = new hap.Accessory("X", hap.uuid.generate("x"));
    assert.throws(
      () => new DenonAudioAccessory(platform, accessory, { name: "X", serialNumber: "X", ip: "127.0.0.1", controlProtocol: "HEOSCLI", powerOnFavorite: -1 }, silentLog),
      /Power on favorite/,
    );
  });
});
