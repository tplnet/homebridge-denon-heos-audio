import { describe, it } from "node:test";
import assert from "node:assert/strict";
const hap = await import("@homebridge/hap-nodejs").catch(() => import("hap-nodejs"));

import { DenonAudioAccessory } from "../../dist/platformAccessory.js";
import { DenonClientHeosCli } from "../../dist/denonClientHeosCli.js";

function createAccessory(powerOnFavorite, favorites) {
  const logs = { warn: [], debug: [] };
  const log = { debug: (m) => logs.debug.push(m), info() {}, success() {}, warn: (m) => logs.warn.push(m), error() {}, log() {}, prefix: "test" };
  const platform = { api: { hap }, Service: hap.Service, Characteristic: hap.Characteristic };
  const accessory = new hap.Accessory("Test Speaker", hap.uuid.generate(`favorite-test-${powerOnFavorite}`));
  const handler = new DenonAudioAccessory(
    platform,
    accessory,
    { name: "Test Speaker", serialNumber: "S", ip: "127.0.0.1", controlProtocol: "HEOSCLI", powerOnFavorite },
    log,
  );
  handler.denonClient = {
    setPowerOnFavorite() {},
    getFavorites: async () => {
      if (favorites instanceof Error) throw favorites;
      return favorites;
    },
  };
  return { handler, logs };
}

describe("power on favorite check", () => {
  it("reads the favorite names from the browse result", () => {
    const payload = JSON.stringify([{ name: "Radio One" }, { name: " " }, { name: "Jazz" }]);
    assert.deepEqual(DenonClientHeosCli.favoritesFromPayload(payload), ["Radio One", "Favorite 2", "Jazz"]);
    assert.throws(() => DenonClientHeosCli.favoritesFromPayload("{}"));
  });

  it("warns if the favorite doesn't exist", async () => {
    const { handler, logs } = createAccessory(3, ["Radio One", "Jazz"]);
    await handler.checkPowerOnFavorite();
    assert.equal(logs.warn.length, 1);
    assert.match(logs.warn[0], /Power on favorite 3 doesn't exist: the HEOS app has 2 favorite\(s\)/);
  });

  it("warns if there are no favorites", async () => {
    const { handler, logs } = createAccessory(1, []);
    await handler.checkPowerOnFavorite();
    assert.match(logs.warn[0], /There are no HEOS favorites/);
  });

  it("names the favorite in the debug log if it exists", async () => {
    const { handler, logs } = createAccessory(2, ["Radio One", "Jazz"]);
    await handler.checkPowerOnFavorite();
    assert.equal(logs.warn.length, 0);
    assert.ok(logs.debug.some((m) => m.includes("starts HEOS favorite 2: Jazz")));
  });

  it("does nothing when disabled and only logs to debug if the favorites can't be read", async () => {
    const disabled = createAccessory(0, []);
    await disabled.handler.checkPowerOnFavorite();
    assert.equal(disabled.logs.warn.length, 0);

    const failing = createAccessory(1, new Error("User not logged in"));
    await failing.handler.checkPowerOnFavorite();
    assert.equal(failing.logs.warn.length, 0);
    assert.ok(failing.logs.debug.some((m) => m.includes("User not logged in")));
  });
});
