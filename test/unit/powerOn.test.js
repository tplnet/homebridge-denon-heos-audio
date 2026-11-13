import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { CommandFailedException } from "../../dist/denonClient.js";
import { DenonClientHeosCli } from "../../dist/denonClientHeosCli.js";

const PID = -555;
const heos = (obj) => JSON.stringify(obj) + "\r\n";

describe("HEOS power on", () => {
  let client;
  let written;
  const powerUpdates = [];

  before(() => {
    client = new DenonClientHeosCli("SERIAL", "Test", "127.0.0.1", 200, 200, () => {}, (power) => powerUpdates.push(power));
    client.player_id = PID;
  });

  after(() => {
    client.socket = undefined;
  });

  /** Fake device: answers every written command with the given handler. */
  const device = (handler) => {
    written = [];
    client.socket = {
      write: (data) => {
        const command = data.replace("heos://", "").replace("\r\n", "");
        written.push(command);
        setImmediate(() => {
          const [name] = command.split("?");
          const reply = handler(name, command);
          if (reply) {
            client.dataHandler(Buffer.from(heos({ heos: { command: name, ...reply } })));
          }
        });
      },
    };
  };

  it("resumes playback if there is something to resume", async () => {
    device((name) => {
      if (name === "player/get_play_state") return { result: "success", message: `pid=${PID}&state=stop` };
      if (name === "player/set_play_state") return { result: "success", message: `pid=${PID}&state=play` };
    });
    assert.equal(await client.setPower(true), true);
    assert.deepEqual(written, [`player/get_play_state?pid=${PID}`, `player/set_play_state?pid=${PID}&state=play`]);
  });

  it("starts HEOS favorite 1 if there is no source (state unknown)", async () => {
    device((name) => {
      if (name === "player/get_play_state") return { result: "success", message: `pid=${PID}&state=unknown` };
      if (name === "browse/play_preset") return { result: "success", message: `pid=${PID}&preset=1` };
    });
    powerUpdates.length = 0;
    assert.equal(await client.setPower(true), true);
    assert.deepEqual(written, [`player/get_play_state?pid=${PID}`, `browse/play_preset?pid=${PID}&preset=1`]);
    assert.deepEqual(powerUpdates, [true]);
  });

  it("starts the configured favorite if the device refuses to play", async () => {
    client.setPowerOnFavorite(3);
    device((name) => {
      if (name === "player/get_play_state") return { result: "success", message: `pid=${PID}&state=stop` };
      if (name === "player/set_play_state") return { result: "fail", message: "eid=2&text=Invalid ID" };
      if (name === "browse/play_preset") return { result: "success", message: `pid=${PID}&preset=3` };
    });
    assert.equal(await client.setPower(true), true);
    assert.deepEqual(written, [`player/get_play_state?pid=${PID}`, `player/set_play_state?pid=${PID}&state=play`, `browse/play_preset?pid=${PID}&preset=3`]);
    client.setPowerOnFavorite(1);
  });

  it("reports the error if the fallback is disabled", async () => {
    client.setPowerOnFavorite(0);
    device((name) => {
      if (name === "player/get_play_state") return { result: "success", message: `pid=${PID}&state=stop` };
      if (name === "player/set_play_state") return { result: "fail", message: "eid=2&text=Invalid ID" };
    });
    await assert.rejects(client.setPower(true), CommandFailedException);
    assert.ok(!written.some((command) => command.startsWith("browse/play_preset")));
    client.setPowerOnFavorite(1);
  });

  it("switching off still sends stop", async () => {
    device((name) => {
      if (name === "player/set_play_state") return { result: "success", message: `pid=${PID}&state=stop` };
    });
    powerUpdates.length = 0;
    assert.equal(await client.setPower(false), false);
    assert.deepEqual(written, [`player/set_play_state?pid=${PID}&state=stop`]);
    assert.deepEqual(powerUpdates, [false]);
  });
});
