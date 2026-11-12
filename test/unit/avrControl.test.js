import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { DenonClientAvrControl } from "../../dist/denonClientAvrControl.js";

describe("DenonClientAvrControl response handling", () => {
  let client;

  before(() => {
    // Nothing listens on this address, the initial connect fails quickly and is only logged.
    client = new DenonClientAvrControl("SERIAL", "Test", "127.0.0.1", 200, 200, () => {});
  });

  after(() => {
    client.socket = undefined;
  });

  const receive = (data) => client.dataHandler(Buffer.from(data));

  it("dispatches change events to the update callbacks", () => {
    const updates = [];
    client.powerUpdateCallback = (p) => updates.push(["power", p]);
    client.muteUpdateCallback = (m) => updates.push(["mute", m]);
    client.volumeUpdateCallback = (v) => updates.push(["volume", v]);
    client.inputUpdateCallback = (i) => updates.push(["input", i]);

    receive("PWON\rMUOFF\rMV455\rSITUNER\r");

    assert.deepEqual(updates, [
      ["power", true],
      ["mute", false],
      ["volume", 45],
      ["input", "TUNER"],
    ]);
  });

  it("does not throw on unknown values", () => {
    assert.doesNotThrow(() => receive("PWMAYBE\rMUWHATEVER\r"));
  });

  it("resolves a pending command with the matching response", async () => {
    client.socket = { write: () => {} };
    const pending = client.sendUnchecked("MV?", "MV?", /^MV(\d{2})5?$/);
    receive("MV30\r");
    assert.equal(await pending, "30");
  });
});
