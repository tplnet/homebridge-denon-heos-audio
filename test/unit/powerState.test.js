import { describe, it } from "node:test";
import assert from "node:assert/strict";
// HAP-NodeJS is "@homebridge/hap-nodejs" in Homebridge 2.x and "hap-nodejs" in Homebridge 1.x
const hap = await import("@homebridge/hap-nodejs").catch(() => import("hap-nodejs"));

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
    await handler.powerChange;
    assert.equal(await handler.getActive(), false);
  });

  it("uses the device state again after the settle time", async () => {
    const { handler } = createAccessory();
    await handler.setActive(hap.Characteristic.Active.INACTIVE);
    await handler.powerChange;
    handler.pendingActive.until = Date.now() - 1;
    assert.equal(await handler.getActive(), true);
  });

  it("a different state reported by the device wins", async () => {
    const { handler } = createAccessory();
    await handler.setActive(hap.Characteristic.Active.INACTIVE);
    await handler.powerChange;
    handler.callbackActive(true); // e.g. started in the HEOS app
    assert.equal(await handler.getActive(), true);
  });

  it("answers HomeKit immediately and keeps the requested state while switching", async () => {
    const { handler } = createAccessory();
    handler.denonClient.getPower = async () => false; // device: still stopped
    let finish;
    handler.denonClient.setPower = () => new Promise((resolve) => (finish = resolve));

    // resolves although the device hasn't finished switching
    await handler.setActive(hap.Characteristic.Active.ACTIVE);
    assert.equal(await handler.getActive(), true, "requested state while switching");

    // intermediate state reported by the device while the favorite is being started
    handler.callbackActive(false);
    assert.equal(await handler.getActive(), true, "intermediate state is ignored");

    finish(true);
    await handler.powerChange;
    assert.equal(await handler.getActive(), true);
  });

  it("shows the real state again if switching fails", async () => {
    const { handler } = createAccessory();
    handler.denonClient.getPower = async () => false;
    handler.denonClient.setPower = async () => {
      throw new Error("refused");
    };
    await handler.setActive(hap.Characteristic.Active.ACTIVE);
    await handler.powerChange;
    assert.equal(await handler.getActive(), false);
    assert.equal(handler.tvService.getCharacteristic(hap.Characteristic.Active).value, hap.Characteristic.Active.INACTIVE);
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

describe("services", () => {
  it("links the speaker to the TV (one tile in the Home app)", () => {
    const { handler } = createAccessory();
    assert.ok(handler.tvService.linkedServices.includes(handler.speakerService));
    assert.equal(handler.tvService.linkedServices.filter((s) => s === handler.speakerService).length, 1);
  });
});
