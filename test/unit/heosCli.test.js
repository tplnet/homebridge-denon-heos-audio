import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { CommandFailedException } from "../../dist/denonClient.js";
import { DenonClientHeosCli } from "../../dist/denonClientHeosCli.js";

describe("DenonClientHeosCli.inputPayloadToInputID", () => {
  const toId = (payload) => DenonClientHeosCli.inputPayloadToInputID(JSON.stringify(payload));

  it("maps physical inputs via the media id", () => {
    assert.equal(toId({ sid: 1027, mid: "inputs/aux_in_1" }), "aux_in_1");
  });

  it("maps CDs", () => {
    assert.equal(toId({ sid: 1027, mid: "cd/1234" }), "cd");
  });

  it("maps known HEOS music sources", () => {
    assert.equal(toId({ sid: 4 }), "spotify");
    assert.equal(toId({ sid: 1024 }), "local");
  });

  it("detects AirPlay", () => {
    assert.equal(toId({ sid: 1024, album_id: "1" }), "airplay");
  });

  it("falls back to the source id", () => {
    assert.equal(toId({ sid: 4711 }), "4711");
  });

  it("throws without a source id", () => {
    assert.throws(() => toId({ mid: "x" }));
  });
});

describe("DenonClientHeosCli response handling", () => {
  const PID = 12345;
  const logs = [];
  let client;
  let written;

  before(() => {
    // Nothing listens on this address, the initial player lookup fails quickly and is only logged.
    client = new DenonClientHeosCli("SERIAL", "Test", "127.0.0.1", 200, 200, (...args) => logs.push(args.join(" ")));
    client.player_id = PID;
  });

  after(() => {
    client.socket = undefined;
  });

  const attachFakeSocket = () => {
    written = [];
    client.socket = { write: (data) => written.push(data) };
  };
  const receive = (data) => client.dataHandler(Buffer.from(data));
  const heos = (obj) => JSON.stringify(obj) + "\r\n";

  it("does not throw on malformed data", () => {
    assert.doesNotThrow(() => receive("this is not json\r\n"));
    assert.doesNotThrow(() => receive(heos({ foo: "bar" })));
    assert.doesNotThrow(() => receive(heos({ heos: { command: "event/player_state_changed", message: `pid=${PID}&state=nonsense` } })));
    assert.doesNotThrow(() => receive(heos({ heos: { command: "event/player_volume_changed", message: `pid=${PID}` } })));
    assert.ok(logs.some((line) => line.includes("Error while processing incoming data")));
  });

  it("resolves a pending command with the matching response", async () => {
    attachFakeSocket();
    const pending = client.sendUnchecked(`player/get_mute?pid=${PID}`, "player/get_mute", /state=(\w+)/);
    receive(heos({ heos: { command: "player/get_mute", result: "success", message: `pid=${PID}&state=on` } }));
    assert.equal(await pending, "on");
    assert.deepEqual(written, [`heos://player/get_mute?pid=${PID}\r\n`]);
  });

  it("handles responses split across several data events", async () => {
    attachFakeSocket();
    const pending = client.sendUnchecked(`player/get_volume?pid=${PID}`, "player/get_volume", /level=(\d+)/);
    const message = heos({ heos: { command: "player/get_volume", result: "success", message: `pid=${PID}&level=27` } });
    receive(message.slice(0, 20));
    receive(message.slice(20));
    assert.equal(await pending, "27");
  });

  it("rejects a pending command immediately on a 'fail' result", async () => {
    attachFakeSocket();
    const pending = client.sendUnchecked(`player/set_mute?pid=${PID}&state=on`, "player/set_mute", /state=(\w+)/);
    receive(heos({ heos: { command: "player/set_mute", result: "fail", message: "eid=2&text=Invalid ID" } }));
    await assert.rejects(pending, CommandFailedException);
  });

  it("ignores responses for other players", async () => {
    attachFakeSocket();
    const pending = client.sendUnchecked(`player/get_mute?pid=${PID}`, "player/get_mute", /state=(\w+)/);
    receive(heos({ heos: { command: "player/get_mute", result: "success", message: `pid=999&state=off` } }));
    receive(heos({ heos: { command: "player/get_mute", result: "success", message: `pid=${PID}&state=off` } }));
    assert.equal(await pending, "off");
  });

  it("dispatches change events to the update callbacks", () => {
    const updates = [];
    client.volumeUpdateCallback = (v) => updates.push(["volume", v]);
    client.muteUpdateCallback = (m) => updates.push(["mute", m]);
    client.powerUpdateCallback = (p) => updates.push(["power", p]);

    receive(heos({ heos: { command: "event/player_volume_changed", message: `pid=${PID}&level=42&mute=off` } }));
    receive(heos({ heos: { command: "event/player_state_changed", message: `pid=${PID}&state=play` } }));
    receive(heos({ heos: { command: "event/player_state_changed", message: `pid=999&state=pause` } }));

    assert.deepEqual(updates, [
      ["mute", false],
      ["volume", 42],
      ["power", true],
    ]);
  });
});
