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

const TEXT_KEYS = new Set(["title", "description", "placeholder"]);
const withoutTexts = (node) =>
  Array.isArray(node)
    ? node.map(withoutTexts)
    : node && typeof node === "object"
      ? Object.fromEntries(Object.entries(node).filter(([key]) => !TEXT_KEYS.has(key)).map(([key, value]) => [key, withoutTexts(value)]))
      : node;
const texts = (node, result = []) => {
  if (Array.isArray(node)) {
    node.forEach((value) => texts(value, result));
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (TEXT_KEYS.has(key) && typeof value === "string") {
        result.push(key);
      } else {
        texts(value, result);
      }
    }
  }
  return result;
};

describe("translated config schemas (Homebridge UI)", () => {
  const packageJson = JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  const languages = ["de"];

  it("are found by the Homebridge UI and published", () => {
    assert.equal(packageJson.directories?.schemas, "schemas");
    assert.ok(packageJson.files.includes("schemas/*.json"));
  });

  for (const language of languages) {
    const translated = JSON.parse(fs.readFileSync(new URL(`../../schemas/config.schema.${language}.json`, import.meta.url), "utf8"));

    it(`${language}: same fields, defaults and limits as config.schema.json`, () => {
      assert.deepEqual(withoutTexts(translated), withoutTexts(schema));
    });

    it(`${language}: has the same texts as config.schema.json`, () => {
      assert.deepEqual(texts(translated), texts(schema));
    });
  }
});
