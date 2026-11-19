import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { ConsoleLogger } from "../../dist/customLogging.js";

/** The filter of the Homebridge UI window "Plugin Logs" (homebridge-config-ui-x 5.x). */
const shownInPluginLogs = (line, alias) => line.includes(`\x1b[36m[${alias}]`);

function captureConsole(fn) {
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args.join(" "));
  try {
    fn();
  } finally {
    console.log = original;
  }
  return lines;
}

describe('Homebridge UI "Plugin Logs"', () => {
  it("console log lines carry the prefix the way the Homebridge UI filters them", () => {
    const lines = captureConsole(() =>
      new ConsoleLogger("debug", "HEOS Multiroom-Audio", true).info(
        "[Platform] hello",
      ),
    );
    assert.equal(lines.length, 1);
    assert.ok(
      shownInPluginLogs(lines[0], "HEOS Multiroom-Audio"),
      JSON.stringify(lines[0]),
    );
  });

  it("the settings form sets a name (the UI filters by it), in all languages", () => {
    for (const file of [
      "../../config.schema.json",
      "../../schemas/config.schema.de.json",
    ]) {
      const schema = JSON.parse(
        fs.readFileSync(new URL(file, import.meta.url), "utf8"),
      );
      assert.equal(schema.schema.properties.name.type, "string", file);
      assert.equal(
        schema.schema.properties.name.default,
        "HEOS Multiroom-Audio",
        file,
      );
      assert.equal(schema.layout[0], "name", file);
    }
  });
});
