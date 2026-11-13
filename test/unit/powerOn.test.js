import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { CommandFailedException } from "../../dist/denonClient.js";
import { DenonClientHeosCli } from "../../dist/denonClientHeosCli.js";

const PID = -555;
const heos = (obj) => JSON.stringify(obj) + "\r\n";

// "now playing" payloads as reported by real devices
const RADIO = { type: "station", song: "", station: "RADIO HAMBURG Live", album: "", artist: "", mid: "https://stream.example/live", qid: 1, sid: 3 };
const EMPTY = { type: "station", song: "", station: "", album: "", artist: "", album_id: "1", mid: "1", qid: 1, sid: 4 };
const AUX = { type: "station", song: "", station: "", album: "", artist: "", mid: "inputs/aux_in_1", sid: 1027 };

describe("HEOS power on", () => {
  let client;
  let written;
  let infos;
  const powerUpdates = [];

  before(() => {
    client = new DenonClientHeosCli("SERIAL", "Test", "127.0.0.1", 200, 200, () => {}, (power) => powerUpdates.push(power));
    client.player_id = PID;
    client.playVerifyIntervalMs = 5;
  });

  beforeEach(() => {
    infos = [];
    client.setPowerOnFavorite(1, (message) => infos.push(message));
  });

  after(() => {
    client.socket = undefined;
  });

  /**
   * Fake device. `states` is the sequence of answers to get_play_state (the last one repeats).
   */
  const device = ({ states, media = RADIO, setPlay = "success" }) => {
    written = [];
    let stateIndex = 0;
    client.socket = {
      write: (data) => {
        const command = data.replace("heos://", "").replace("\r\n", "");
        written.push(command);
        const [name] = command.split("?");
        let reply;
        if (name === "player/get_play_state") {
          const state = states[Math.min(stateIndex++, states.length - 1)];
          reply = { heos: { command: name, result: "success", message: `pid=${PID}&state=${state}` } };
        } else if (name === "player/get_now_playing_media") {
          reply = { heos: { command: name, result: "success", message: `pid=${PID}` }, payload: media };
        } else if (name === "player/set_play_state") {
          reply =
            setPlay === "success"
              ? { heos: { command: name, result: "success", message: `pid=${PID}&state=${command.match(/state=(\w+)/)[1]}` } }
              : { heos: { command: name, result: "fail", message: "eid=2&text=Invalid ID" } };
        } else if (name === "browse/play_preset") {
          reply = { heos: { command: name, result: "success", message: `pid=${PID}&preset=${command.match(/preset=(\d+)/)[1]}` } };
        }
        setImmediate(() => reply && client.dataHandler(Buffer.from(heos(reply))));
      },
    };
  };
  const commands = () => written.map((command) => command.split("?")[0]);

  it("does nothing if the speaker is already playing", async () => {
    device({ states: ["play"] });
    assert.equal(await client.setPower(true), true);
    assert.deepEqual(commands(), ["player/get_play_state"]);
  });

  it("resumes a radio station that needs a few seconds to buffer", async () => {
    device({ states: ["stop", "stop", "stop", "stop", "stop", "play"] });
    assert.equal(await client.setPower(true), true);
    assert.ok(!commands().includes("browse/play_preset"));
    assert.deepEqual(infos, []);
  });

  it("resumes the current media (radio)", async () => {
    device({ states: ["stop", "play"] });
    assert.equal(await client.setPower(true), true);
    assert.deepEqual(commands(), ["player/get_play_state", "player/get_now_playing_media", "player/set_play_state", "player/get_play_state"]);
    assert.deepEqual(infos, []);
  });

  it("resumes a physical input", async () => {
    device({ states: ["pause", "play"], media: AUX });
    assert.equal(await client.setPower(true), true);
    assert.ok(!commands().includes("browse/play_preset"));
  });

  it("starts the favorite if there is no source (state unknown)", async () => {
    device({ states: ["unknown"] });
    powerUpdates.length = 0;
    assert.equal(await client.setPower(true), true);
    assert.deepEqual(commands(), ["player/get_play_state", "browse/play_preset"]);
    assert.deepEqual(infos, ["Nothing to resume, starting HEOS favorite 1."]);
    assert.deepEqual(powerUpdates, [true]);
  });

  it("starts the favorite if the current media is empty (Denon Home Amp after a streaming session)", async () => {
    device({ states: ["pause"], media: EMPTY });
    assert.equal(await client.setPower(true), true);
    assert.deepEqual(commands(), ["player/get_play_state", "player/get_now_playing_media", "browse/play_preset"]);
    assert.deepEqual(infos, ["Nothing to resume (no current media), starting HEOS favorite 1."]);
  });

  it("starts the favorite if play is accepted but playback doesn't start", async () => {
    device({ states: ["pause"] }); // stays paused
    assert.equal(await client.setPower(true), true);
    assert.deepEqual(commands(), [
      "player/get_play_state",
      "player/get_now_playing_media",
      "player/set_play_state",
      // waits up to 8 s (radio streams need time to buffer)
      ...Array(8).fill("player/get_play_state"),
      "browse/play_preset",
    ]);
    assert.deepEqual(infos, ["Playback did not start, starting HEOS favorite 1."]);
  });

  it("starts the configured favorite if the speaker refuses to play", async () => {
    client.setPowerOnFavorite(3, (message) => infos.push(message));
    device({ states: ["stop"], setPlay: "fail" });
    assert.equal(await client.setPower(true), true);
    assert.equal(written.at(-1), `browse/play_preset?pid=${PID}&preset=3`);
    assert.deepEqual(infos, ["The speaker refused to resume playback, starting HEOS favorite 3."]);
  });

  it("with the fallback disabled: only resumes and reports refusals", async () => {
    client.setPowerOnFavorite(0);
    device({ states: ["pause"], media: EMPTY });
    assert.equal(await client.setPower(true), true);
    assert.deepEqual(commands(), ["player/get_play_state", "player/set_play_state"]);

    device({ states: ["stop"], setPlay: "fail" });
    await assert.rejects(client.setPower(true), CommandFailedException);
    assert.ok(!commands().includes("browse/play_preset"));
  });

  it("switching off still sends stop", async () => {
    device({ states: ["play"] });
    powerUpdates.length = 0;
    assert.equal(await client.setPower(false), false);
    assert.deepEqual(written, [`player/set_play_state?pid=${PID}&state=stop`]);
    assert.deepEqual(powerUpdates, [false]);
  });
});
