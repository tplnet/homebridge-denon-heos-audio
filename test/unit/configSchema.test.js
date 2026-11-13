import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const schema = JSON.parse(fs.readFileSync(new URL("../../config.schema.json", import.meta.url), "utf8"));

function collectArrays(node, path, result = []) {
  if (node && typeof node === "object") {
    if (node.type === "array") {
      result.push({ path, node });
    }
    for (const [key, value] of Object.entries(node.properties ?? {})) {
      collectArrays(value, `${path}.${key}`, result);
    }
    if (node.items) {
      collectArrays(node.items, `${path}[]`, result);
    }
  }
  return result;
}

describe("config.schema.json", () => {
  it("disables drag & drop ordering for all lists (the Homebridge UI drag handle gets stuck after using a dropdown)", () => {
    const arrays = collectArrays(schema.schema, "schema");
    assert.ok(arrays.length >= 3);
    for (const { path, node } of arrays) {
      assert.equal(node.orderable, false, `${path} must set "orderable": false`);
    }
  });

  it("lists every option of the platform", () => {
    assert.deepEqual(Object.keys(schema.schema.properties).sort(), [
      "autoAddDiscoveredDevices",
      "consoleLogEnabled",
      "consoleLogLevel",
      "deviceDiscovery",
      "devices",
      "excludedSerialNumbers",
    ]);
  });
});
