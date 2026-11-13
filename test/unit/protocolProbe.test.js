import { test } from "node:test";
import assert from "node:assert/strict";
import { describeProbeResult } from "../../dist/denonProtocol.js";

test("probe messages name the protocol and port", () => {
  assert.equal(describeProbeResult("192.0.2.10", 1255, true), "192.0.2.10: HEOS CLI (port 1255) available");
  assert.equal(
    describeProbeResult("192.0.2.10", 23, false, "connection refused"),
    "192.0.2.10: AVR Control (port 23) not available (connection refused)",
  );
});
