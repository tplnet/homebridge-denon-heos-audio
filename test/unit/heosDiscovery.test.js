import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import dgram from "node:dgram";
import http from "node:http";

import { HEOS_SEARCH_TARGET, HeosDiscovery, isLocationOfSender, parseDeviceDescription, parseSsdpMessage } from "../../dist/heosDiscovery.js";

const DESCRIPTION = `<?xml version="1.0"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
  <device>
    <friendlyName>Office Speaker</friendlyName>
    <manufacturer>Denon</manufacturer>
    <modelName>Denon Home 150</modelName>
    <serialNumber>BLT00000000003</serialNumber>
    <deviceList>
      <device><friendlyName>sub</friendlyName><serialNumber>SUB</serialNumber></device>
    </deviceList>
  </device>
</root>`;

describe("SSDP / description parsing", () => {
  it("parses SSDP responses case-insensitively", () => {
    const { startLine, headers } = parseSsdpMessage("HTTP/1.1 200 OK\r\nst: X\r\nLOCATION: http://1.2.3.4:60006/a.xml\r\n\r\n");
    assert.equal(startLine, "HTTP/1.1 200 OK");
    assert.equal(headers.location, "http://1.2.3.4:60006/a.xml");
    assert.equal(headers.st, "X");
  });

  it("reads the root device fields, not those of sub devices", () => {
    assert.deepEqual(parseDeviceDescription(DESCRIPTION), {
      serialNumber: "BLT00000000003",
      friendlyName: "Office Speaker",
      modelName: "Denon Home 150",
      manufacturer: "Denon",
    });
  });

  it("falls back to sub devices if the root device has no serial number", () => {
    const xml = `<root><device><friendlyName>X</friendlyName><deviceList><device><serialNumber>S1</serialNumber></device></deviceList></device></root>`;
    assert.equal(parseDeviceDescription(xml).serialNumber, "S1");
  });
});

describe("HeosDiscovery", () => {
  let httpServer;
  let responder;
  let httpPort;
  let requests = 0;
  let searches = [];
  let respondWith = () => [];
  let openConnections = 0;

  before(async () => {
    httpServer = http.createServer((req, res) => {
      requests++;
      if (req.url === "/slow.xml") {
        return; // never answers -> timeout
      }
      if (req.url === "/missing.xml") {
        res.statusCode = 404;
        return res.end("not found");
      }
      res.setHeader("content-type", "text/xml");
      res.end(DESCRIPTION);
    });
    httpServer.on("connection", (socket) => {
      openConnections++;
      socket.on("close", () => openConnections--);
    });
    await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    httpPort = httpServer.address().port;

    responder = dgram.createSocket("udp4");
    responder.on("message", (message, remote) => {
      searches.push(message.toString());
      for (const response of respondWith()) {
        responder.send(Buffer.from(response), remote.port, remote.address);
      }
    });
    await new Promise((resolve) => responder.bind(0, "127.0.0.1", resolve));
  });

  after(() => {
    httpServer.close();
    responder.close();
  });

  const response = (path, st = HEOS_SEARCH_TARGET) =>
    `HTTP/1.1 200 OK\r\nCACHE-CONTROL: max-age=180\r\nST: ${st}\r\nLOCATION: http://127.0.0.1:${httpPort}${path}\r\nUSN: uuid:x::${st}\r\n\r\n`;

  const createDiscovery = (options = {}) =>
    new HeosDiscovery({ interfaceAddresses: ["127.0.0.1"], target: { address: "127.0.0.1", port: responder.address().port }, ...options });

  it("searches for HEOS devices and emits each device once", async () => {
    searches = [];
    requests = 0;
    // the device answers twice per search (as real devices often do)
    respondWith = () => [response("/desc.xml"), response("/desc.xml")];
    const discovery = createDiscovery({ searchIntervalMs: 30 });
    const found = [];
    discovery.on("device", (device) => found.push(device));
    await discovery.start();
    await new Promise((resolve) => setTimeout(resolve, 150));
    discovery.stop();

    assert.ok(searches.length >= 2, "searches periodically");
    assert.match(searches[0], new RegExp(`ST: ${HEOS_SEARCH_TARGET}`));
    assert.equal(found.length, 1);
    assert.deepEqual(found[0], {
      serialNumber: "BLT00000000003",
      friendlyName: "Office Speaker",
      modelName: "Denon Home 150",
      manufacturer: "Denon",
      ip: "127.0.0.1",
      location: `http://127.0.0.1:${httpPort}/desc.xml`,
    });
    assert.equal(requests, 1, "the description is fetched only once");
  });

  it("ignores responses whose location points to another host", async () => {
    requests = 0;
    respondWith = () => [response("/desc.xml").replace("http://127.0.0.1:", "http://127.0.0.2:")];
    const discovery = createDiscovery();
    const found = [];
    discovery.on("device", (device) => found.push(device));
    await discovery.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    discovery.stop();
    assert.equal(found.length, 0);
    assert.equal(requests, 0, "nothing is fetched");
  });

  it("ignores responses of other device types", async () => {
    requests = 0;
    respondWith = () => [response("/desc.xml", "urn:schemas-upnp-org:device:InternetGatewayDevice:1")];
    const discovery = createDiscovery();
    const found = [];
    discovery.on("device", (device) => found.push(device));
    await discovery.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    discovery.stop();
    assert.equal(found.length, 0);
    assert.equal(requests, 0, "nothing is fetched");
  });

  it("does not leak connections on timeouts and errors and retries later", async () => {
    requests = 0;
    respondWith = () => [response("/slow.xml"), response("/missing.xml")];
    const discovery = createDiscovery({ fetchTimeoutMs: 50, searchIntervalMs: 120 });
    const found = [];
    discovery.on("device", (device) => found.push(device));
    discovery.on("error", (error) => assert.fail(`unexpected error ${error}`));
    await discovery.start();
    await new Promise((resolve) => setTimeout(resolve, 200));
    discovery.stop();
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(found.length, 0);
    assert.ok(requests >= 4, `failed descriptions are fetched again with the next search (${requests})`);
    assert.equal(openConnections, 0, "all connections are closed");
  });
});

describe("isLocationOfSender", () => {
  it("accepts HTTP locations on the sender only", () => {
    assert.equal(isLocationOfSender(new URL("http://192.0.2.10:60006/desc.xml"), "192.0.2.10"), true);
    assert.equal(isLocationOfSender(new URL("http://192.0.2.10:60006/desc.xml"), "::ffff:192.0.2.10"), true);
    assert.equal(isLocationOfSender(new URL("http://192.0.2.11:60006/desc.xml"), "192.0.2.10"), false);
    assert.equal(isLocationOfSender(new URL("http://example.com/desc.xml"), "192.0.2.10"), false);
    assert.equal(isLocationOfSender(new URL("https://192.0.2.10/desc.xml"), "192.0.2.10"), false);
    assert.equal(isLocationOfSender(new URL("file:///etc/passwd"), "192.0.2.10"), false);
    assert.equal(isLocationOfSender(new URL("http://user:pw@192.0.2.10/desc.xml"), "192.0.2.10"), false);
  });
});
