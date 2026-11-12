import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { findMapByValue, findValueByMap, InvalidResponseException, mapResponse } from "../../dist/denonClient.js";

const VALUES = {
  ON: { VALUE: "on", MAP: true },
  OFF: { VALUE: "off", MAP: false },
};

describe("value mapping", () => {
  it("findMapByValue maps raw values, including falsy mapped values", () => {
    assert.equal(findMapByValue(VALUES, "on"), true);
    assert.equal(findMapByValue(VALUES, "off"), false);
    assert.equal(findMapByValue(VALUES, "maybe"), undefined);
  });

  it("findValueByMap maps back to raw values", () => {
    assert.equal(findValueByMap(VALUES, true), "on");
    assert.equal(findValueByMap(VALUES, false), "off");
  });

  it("mapResponse throws InvalidResponseException for unknown values", () => {
    assert.equal(mapResponse(VALUES, "off", "mute state"), false);
    assert.throws(() => mapResponse(VALUES, "maybe", "mute state"), InvalidResponseException);
  });
});
