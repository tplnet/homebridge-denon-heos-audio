import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { DenonClientHeosCli } from "../../dist/denonClientHeosCli.js";

// real responses (browse/browse?sid=<pid>) of the devices used for testing
const HOME_AMP = [
  { container: "no", mid: "inputs/tv", type: "station", playable: "yes", name: "Patio Music - TV", image_url: "" },
  { container: "no", mid: "inputs/optical_in_1", type: "station", playable: "yes", name: "Patio Music - Optical In", image_url: "" },
  { container: "no", mid: "inputs/line_in_1", type: "station", playable: "yes", name: "Patio Music - Line In", image_url: "" },
];
const CINEMA_60 = [
  { container: "no", mid: "inputs/bluray", type: "station", playable: "yes", name: "Switch", image_url: "" },
  { container: "no", mid: "inputs/game", type: "station", playable: "yes", name: "Switch 2", image_url: "" },
  { container: "no", mid: "inputs/aux1", type: "station", playable: "yes", name: "Apple TV", image_url: "" },
  { container: "no", mid: "inputs/aux2", type: "station", playable: "yes", name: "AUX2", image_url: "" },
];
const HOME_150 = [{ container: "no", mid: "inputs/aux_in_1", type: "station", playable: "yes", name: "Office Speaker - AUX In", image_url: "" }];

const toPlain = (inputs) => inputs.map((input) => [input.inputID, input.displayName]);

describe("DenonClientHeosCli.inputSourcesFromPayload", () => {
  it("Denon Home Amp: removes the player name prefix", () => {
    assert.deepEqual(toPlain(DenonClientHeosCli.inputSourcesFromPayload(JSON.stringify(HOME_AMP), "Patio Music")), [
      ["tv", "TV"],
      ["optical_in_1", "Optical In"],
      ["line_in_1", "Line In"],
    ]);
  });

  it("Marantz Cinema 60: keeps the names set on the receiver", () => {
    assert.deepEqual(toPlain(DenonClientHeosCli.inputSourcesFromPayload(JSON.stringify(CINEMA_60), "Marantz CINEMA 60")), [
      ["bluray", "Switch"],
      ["game", "Switch 2"],
      ["aux1", "Apple TV"],
      ["aux2", "AUX2"],
    ]);
  });

  it("Denon Home 150", () => {
    assert.deepEqual(toPlain(DenonClientHeosCli.inputSourcesFromPayload(JSON.stringify(HOME_150), "Office Speaker")), [["aux_in_1", "AUX In"]]);
  });

  it("ignores entries that are not inputs and duplicates", () => {
    const payload = [...HOME_150, ...HOME_150, { container: "yes", cid: "x", name: "Folder" }];
    assert.equal(DenonClientHeosCli.inputSourcesFromPayload(JSON.stringify(payload)).length, 1);
  });

  it("rejects payloads that are not a list", () => {
    assert.throws(() => DenonClientHeosCli.inputSourcesFromPayload(JSON.stringify({ foo: 1 })));
  });

  it("no longer lists discontinued streaming services", () => {
    const ids = DenonClientHeosCli.DISPLAY_ONLY_INPUT_SOURCES.map((input) => input.inputID);
    for (const discontinued of ["rhapsody", "rdio", "moodmix", "juke"]) {
      assert.ok(!ids.includes(discontinued), discontinued);
    }
    assert.ok(ids.includes("spotify") && ids.includes("airplay"));
  });
});
