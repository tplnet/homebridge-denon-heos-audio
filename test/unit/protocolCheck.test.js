import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { checkControlProtocol } from "../../dist/protocolCheck.js";
import { ControlMode } from "../../dist/controlMode.js";

const HEOS_ONLY = [ControlMode.HEOSCLI]; // Denon Home 150 / 250
const BOTH = [ControlMode.AVRCONTROL, ControlMode.HEOSCLI]; // Denon Home Amp, Marantz Cinema 60
const AVR_ONLY = [ControlMode.AVRCONTROL]; // older receivers without HEOS

describe("checkControlProtocol", () => {
  it("keeps a supported protocol without messages", () => {
    assert.deepEqual(checkControlProtocol("Office", "HEOSCLI", HEOS_ONLY), { protocol: "HEOSCLI" });
    assert.deepEqual(checkControlProtocol("Cinema", "HYBRID", BOTH), { protocol: "HYBRID" });
    assert.deepEqual(checkControlProtocol("Old AVR", "AVRCONTROL", AVR_ONLY), { protocol: "AVRCONTROL" });
  });

  it("Hybrid on a speaker without AVR Control: falls back to HEOS CLI with a warning", () => {
    const result = checkControlProtocol("Office Speaker", "HYBRID", HEOS_ONLY);
    assert.equal(result.protocol, "HEOSCLI");
    assert.match(result.warning, /"Office Speaker" doesn't support AVR Control \(port 23 closed\)/);
    assert.match(result.warning, /Using "HEOS CLI" instead/);
  });

  it("AVR Control on a speaker: falls back to HEOS CLI", () => {
    const result = checkControlProtocol("Office Speaker", "AVRCONTROL", HEOS_ONLY);
    assert.equal(result.protocol, "HEOSCLI");
    assert.ok(result.warning);
  });

  it("HEOS CLI on a receiver without HEOS: falls back to AVR Control", () => {
    const result = checkControlProtocol("Old AVR", "HEOSCLI", AVR_ONLY);
    assert.equal(result.protocol, "AVRCONTROL");
    assert.match(result.warning, /HEOS CLI \(port 1255 closed\)/);
  });

  it("HEOS CLI on a device that also supports AVR Control: keeps it, with a hint", () => {
    const result = checkControlProtocol("Patio Music", "HEOSCLI", BOTH);
    assert.equal(result.protocol, "HEOSCLI");
    assert.equal(result.warning, undefined);
    assert.match(result.hint, /Hybrid/);
  });

  it("device not reachable: keeps the configuration", () => {
    assert.deepEqual(checkControlProtocol("Off", "HYBRID", []), { protocol: "HYBRID" });
  });

  it("unknown protocol: left to the configuration validation", () => {
    assert.deepEqual(checkControlProtocol("X", "FOO", HEOS_ONLY), { protocol: "FOO" });
  });
});
