import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { fromDeviceVolume, toDeviceVolume } from "../../dist/volumeLimit.js";

describe("toDeviceVolume", () => {
  it("passes the volume through without a limit", () => {
    assert.equal(toDeviceVolume(0, undefined), 0);
    assert.equal(toDeviceVolume(57, undefined), 57);
    assert.equal(toDeviceVolume(100, undefined), 100);
  });

  it("scales the volume to the limit", () => {
    assert.equal(toDeviceVolume(100, 50), 50);
    assert.equal(toDeviceVolume(50, 50), 25);
    assert.equal(toDeviceVolume(33, 60), 20); // 19.8 -> 20
  });

  it("treats a limit of 0 as a limit (always 0)", () => {
    assert.equal(toDeviceVolume(100, 0), 0);
    assert.equal(toDeviceVolume(42, 0), 0);
  });
});

describe("fromDeviceVolume", () => {
  it("passes the volume through without a limit", () => {
    assert.equal(fromDeviceVolume(42, undefined), 42);
    assert.equal(fromDeviceVolume(42, undefined, 10), 42);
  });

  it("scales the device volume back to 0-100", () => {
    assert.equal(fromDeviceVolume(25, 50), 50);
    assert.equal(fromDeviceVolume(50, 50), 100);
  });

  it("caps at 100 if the device is above the limit", () => {
    assert.equal(fromDeviceVolume(80, 50), 100);
  });

  it("returns the last set volume if it maps to the device volume (no slider jumping)", () => {
    // 33 -> 20 on the device; converting 20 back would give 33.33 -> 33, but e.g. 34 also maps to 20
    assert.equal(fromDeviceVolume(20, 60, 34), 34);
    assert.equal(fromDeviceVolume(21, 60, 34), 35);
  });

  it("accepts a last set volume of 0", () => {
    assert.equal(fromDeviceVolume(0, 60, 0), 0);
  });

  it("does not divide by zero with a limit of 0", () => {
    assert.equal(fromDeviceVolume(0, 0), 0);
    assert.equal(fromDeviceVolume(0, 0, 70), 70);
  });
});
