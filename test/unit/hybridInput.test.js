import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { DenonClientHybrid } from "../../dist/denonClientHybrid.js";

// HEOS input ids of a Marantz Cinema 60 (browse/browse?sid=<pid>)
const CINEMA_60_INPUTS = ["bluray", "game", "aux1", "aux2"];

/** Hybrid client without network connections, only the input mapping. */
function hybridWithoutConnections(knownInputIds, heosInput = "spotify") {
  const reported = [];
  const hybrid = Object.create(DenonClientHybrid.prototype);
  Object.assign(hybrid, {
    knownInputIds,
    debugLog: () => {},
    inputUpdateCallback: (input) => reported.push(input),
    clientHeosCli: { getInput: async () => heosInput },
  });
  return { hybrid, reported };
}

describe("Hybrid: input changed on the receiver (AVR Control SI…)", () => {
  it("maps AVR Control input codes to the HEOS input ids of the device", () => {
    assert.equal(
      DenonClientHybrid.heosInputFromAvrInput("AUX1", CINEMA_60_INPUTS),
      "aux1",
    );
    assert.equal(
      DenonClientHybrid.heosInputFromAvrInput("BD", CINEMA_60_INPUTS),
      "bluray",
    );
    assert.equal(
      DenonClientHybrid.heosInputFromAvrInput("GAME1", CINEMA_60_INPUTS),
      "game",
    );
    assert.equal(
      DenonClientHybrid.heosInputFromAvrInput("GAME", CINEMA_60_INPUTS),
      "game",
    );
  });

  it("prefers the candidate the device offers", () => {
    assert.equal(
      DenonClientHybrid.heosInputFromAvrInput("TV", ["tv", "optical_in_1"]),
      "tv",
    );
    assert.equal(
      DenonClientHybrid.heosInputFromAvrInput("TV", ["tvaudio", "cd"]),
      "tvaudio",
    );
    assert.equal(
      DenonClientHybrid.heosInputFromAvrInput("CBL/SAT", ["cable_sat"]),
      "cable_sat",
    );
    assert.equal(
      DenonClientHybrid.heosInputFromAvrInput("MPLAY", ["mediaplayer"]),
      "mediaplayer",
    );
  });

  it("uses the first candidate while the input list is unknown", () => {
    assert.equal(DenonClientHybrid.heosInputFromAvrInput("TV", []), "tvaudio");
    assert.equal(DenonClientHybrid.heosInputFromAvrInput("AUX2", []), "aux2");
  });

  it("leaves HEOS music sources and inputs HEOS doesn't offer to HEOS", () => {
    assert.equal(
      DenonClientHybrid.heosInputFromAvrInput("NET", CINEMA_60_INPUTS),
      undefined,
    );
    assert.equal(DenonClientHybrid.heosInputFromAvrInput("BT", []), undefined);
    assert.equal(
      DenonClientHybrid.heosInputFromAvrInput("PHONO", CINEMA_60_INPUTS),
      undefined,
    );
  });

  it("reports a mapped input directly", () => {
    const { hybrid, reported } = hybridWithoutConnections(CINEMA_60_INPUTS);
    hybrid.onAvrInputChanged("GAME1");
    hybrid.onAvrInputChanged("AUX1");
    assert.deepEqual(reported, ["game", "aux1"]);
  });

  it("asks HEOS for the current source of a HEOS music source", async () => {
    const { hybrid, reported } = hybridWithoutConnections(
      CINEMA_60_INPUTS,
      "spotify",
    );
    hybrid.onAvrInputChanged("NET");
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(reported, ["spotify"]);
  });

  it("ignores a failed HEOS query", async () => {
    const { hybrid, reported } = hybridWithoutConnections(CINEMA_60_INPUTS);
    hybrid.clientHeosCli = {
      getInput: async () => Promise.reject(new Error("timeout")),
    };
    hybrid.onAvrInputChanged("NET");
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(reported, []);
  });
});
