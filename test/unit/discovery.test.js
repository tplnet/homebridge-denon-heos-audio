import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildDiscoveredDeviceConfig, chooseControlProtocol, sanitizeAccessoryName } from "../../dist/discovery.js";
import { ControlMode } from "../../dist/controlMode.js";

describe("chooseControlProtocol", () => {
  it("prefers HYBRID if both protocols are supported", () => {
    assert.equal(chooseControlProtocol([ControlMode.AVRCONTROL, ControlMode.HEOSCLI]), "HYBRID");
  });

  it("uses the single supported protocol", () => {
    assert.equal(chooseControlProtocol([ControlMode.HEOSCLI]), "HEOSCLI");
    assert.equal(chooseControlProtocol([ControlMode.AVRCONTROL]), "AVRCONTROL");
  });

  it("returns undefined without supported protocols", () => {
    assert.equal(chooseControlProtocol([]), undefined);
  });
});

describe("sanitizeAccessoryName", () => {
  it("keeps valid names including umlauts", () => {
    assert.equal(sanitizeAccessoryName("Küche Lautsprecher", "x"), "Küche Lautsprecher");
    assert.equal(sanitizeAccessoryName("Marantz CINEMA 60", "x"), "Marantz CINEMA 60");
  });

  it("removes characters HomeKit does not accept and trims the ends", () => {
    assert.equal(sanitizeAccessoryName("🎵 Küche #2 🎵", "x"), "Küche 2");
    assert.equal(sanitizeAccessoryName("'Living Room'", "x"), "Living Room");
    assert.equal(sanitizeAccessoryName("Kids'", "x"), "Kids");
  });

  it("falls back if nothing usable is left", () => {
    assert.equal(sanitizeAccessoryName("🎵🎵", "Denon 123"), "Denon 123");
    assert.equal(sanitizeAccessoryName(undefined, "Denon 123"), "Denon 123");
  });
});

describe("buildDiscoveredDeviceConfig", () => {
  it("builds a config from the discovery data", () => {
    assert.deepEqual(
      buildDiscoveredDeviceConfig({
        serialNumber: "DCPZ000000001",
        ip: "192.168.1.149",
        friendlyName: "Patio Music",
        modelName: "Denon Home Amp",
        supportedModes: [ControlMode.AVRCONTROL, ControlMode.HEOSCLI],
      }),
      { name: "Patio Music", serialNumber: "DCPZ000000001", ip: "192.168.1.149", controlProtocol: "HYBRID" },
    );
  });

  it("falls back to the model name", () => {
    const config = buildDiscoveredDeviceConfig({ serialNumber: "S", ip: "1.2.3.4", modelName: "Denon Home 150", supportedModes: [ControlMode.HEOSCLI] });
    assert.equal(config.name, "Denon Home 150");
  });

  it("returns undefined without supported protocols", () => {
    assert.equal(buildDiscoveredDeviceConfig({ serialNumber: "S", ip: "1.2.3.4", supportedModes: [] }), undefined);
  });
});
