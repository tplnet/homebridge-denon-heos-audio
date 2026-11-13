/**
 * Compatibility smoke test: starts the installed Homebridge version with this plugin and
 * simulated HEOS / AVR Control devices, and checks that the plugin loads and publishes its
 * accessories without errors or HAP warnings.
 *
 * Usage: npm run build && node scripts/smoke-test.mjs
 * Uses the Homebridge version from node_modules (install another one with `npm install --no-save homebridge@<version>`).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(repoDir, "package.json"), "utf8"));
const RUN_SECONDS = 15;

// ---- simulated devices -------------------------------------------------------------------------
const players = [
  // negative player ids exist on real devices
  { pid: -11, serial: "SMOKE-HEOS", name: "Smoke HEOS" },
  { pid: 22, serial: "SMOKE-HYBRID", name: "Smoke Hybrid" },
];
const reply = (socket, obj) => socket.write(JSON.stringify(obj) + "\r\n");

function startHeos() {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      let buffer = "";
      socket.on("error", () => {});
      socket.on("data", (data) => {
        buffer += data;
        const lines = buffer.split("\r\n");
        buffer = lines.pop();
        for (const line of lines) {
          const [command, query = ""] = line.replace("heos://", "").split("?");
          const pid = query.match(/pid=(-?\d+)/)?.[1];
          const sid = query.match(/sid=(-?\d+)/)?.[1];
          const ok = (message, payload) => reply(socket, { heos: { command, result: "success", message }, ...(payload ? { payload } : {}) });
          if (command === "system/register_for_change_events") ok("enable=on");
          else if (command === "player/get_players") ok("", players);
          else if (command === "player/get_volume") ok(`pid=${pid}&level=25`);
          else if (command === "player/get_mute") ok(`pid=${pid}&state=off`);
          else if (command === "player/get_play_state") ok(`pid=${pid}&state=play`);
          else if (command === "player/get_now_playing_media") ok(`pid=${pid}`, { sid: 1027, mid: "inputs/aux_in_1" });
          else if (command === "browse/browse") {
            // like the real devices: first "command under process", then the result
            ok(`command under process&sid=${sid}`);
            const player = players.find((p) => String(p.pid) === sid);
            setTimeout(() => {
              ok(`sid=${sid}&returned=1&count=1`, [{ container: "no", mid: "inputs/aux_in_1", type: "station", playable: "yes", name: `${player?.name} - AUX In` }]);
            }, 300);
          }
        }
      });
    });
    server.once("error", reject);
    server.listen(1255, "127.0.0.1", () => resolve(server));
  });
}

function startAvr() {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      socket.on("error", () => {});
      socket.on("data", (data) => {
        for (const command of data.toString().split(/\r\n?/).filter(Boolean)) {
          if (command === "PW?") socket.write("PWON\r");
        }
      });
    });
    // port 23 needs root on Linux; the hybrid device is skipped if it can't be opened
    server.once("error", () => resolve(undefined));
    server.listen(23, "127.0.0.1", () => resolve(server));
  });
}

function startDescription() {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.end(
        '<?xml version="1.0"?><root><device><manufacturer>Denon</manufacturer><modelName>Smoke Test</modelName>' +
          "<deviceList><device><firmware_version>1.0.0</firmware_version></device></deviceList></device></root>",
      );
    });
    server.once("error", () => resolve(undefined));
    server.listen(60006, "127.0.0.1", () => resolve(server));
  });
}

// ---- main ----------------------------------------------------------------------------------------
const servers = [await startHeos(), await startAvr(), await startDescription()];
const avrAvailable = servers[1] !== undefined;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hb-smoke-"));
const storage = path.join(tmp, "storage");
const pluginRoot = path.join(tmp, "plugins");
fs.mkdirSync(storage);
fs.mkdirSync(path.join(pluginRoot, path.dirname(pkg.name)), { recursive: true });
fs.symlinkSync(repoDir, path.join(pluginRoot, pkg.name), "dir");

const devices = [
  { name: "Smoke HEOS", serialNumber: "SMOKE-HEOS", ip: "127.0.0.1", controlProtocol: "HEOSCLI", inputs: [{ inputID: "aux_in_1", name: "AUX" }] },
  { name: "Smoke Invalid", serialNumber: "SMOKE-INVALID", ip: "127.0.0.1", controlProtocol: "INVALID" },
];
if (avrAvailable) {
  devices.push({ name: "Smoke Hybrid", serialNumber: "SMOKE-HYBRID", ip: "127.0.0.1", controlProtocol: "HYBRID", volumeLimitEnabled: true, volumeLimit: 50 });
}
fs.writeFileSync(
  path.join(storage, "config.json"),
  JSON.stringify({
    bridge: { name: "Smoke", username: "0E:AA:BB:CC:DD:EE", port: 51899, pin: "031-45-154" },
    platforms: [{ platform: "DenonHeosAudio", deviceDiscovery: false, devices }],
  }),
);

const homebridgeDir = path.join(repoDir, "node_modules", "homebridge");
const hbPkg = JSON.parse(fs.readFileSync(path.join(homebridgeDir, "package.json"), "utf8"));
const hbVersion = hbPkg.version;
// the executable is bin/homebridge in 1.x and bin/homebridge.js in 2.x
const homebridgeBin = path.join(homebridgeDir, typeof hbPkg.bin === "string" ? hbPkg.bin : hbPkg.bin.homebridge);
console.log(`Smoke test: ${pkg.name}@${pkg.version} on Homebridge ${hbVersion}, Node ${process.version}${avrAvailable ? "" : " (AVR port 23 unavailable, hybrid device skipped)"}`);

let output = "";
const child = spawn(process.execPath, [homebridgeBin, "-U", storage, "-P", pluginRoot, "--strict-plugin-resolution", "-D", "-I"], {
  env: { ...process.env, FORCE_COLOR: "0" },
});
child.stdout.on("data", (d) => (output += d));
child.stderr.on("data", (d) => (output += d));
const exited = new Promise((resolve) => child.once("exit", resolve));

// stop after RUN_SECONDS, or earlier if Homebridge exits by itself (which is a failure)
const exitedEarly = await Promise.race([exited.then(() => true), new Promise((resolve) => setTimeout(() => resolve(false), RUN_SECONDS * 1000))]);
if (!exitedEarly) {
  child.kill("SIGTERM");
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
  child.kill("SIGKILL");
}
servers.forEach((server) => server?.close());
fs.rmSync(tmp, { recursive: true, force: true });
fs.writeFileSync(path.join(repoDir, "smoke-test.log"), output);

const expectedAccessories = avrAvailable ? 2 : 1;
const checks = [
  ["Homebridge kept running", !exitedEarly],
  ["plugin loaded", output.includes(`Loaded plugin: ${pkg.name}@${pkg.version}`)],
  [`${expectedAccessories} accessories published`, (output.match(/Publishing external accessory/g) ?? []).length === expectedAccessories],
  ["invalid device skipped with a clear message", output.includes("Could not set up device 'Smoke Invalid'")],
  ["connected to the HEOS device", output.includes("[Smoke HEOS] New connection established.")],
  ["inputs read from the device (negative player id)", output.includes("[Smoke HEOS] Inputs reported by the device: AUX In (aux_in_1)")],
  ["no HAP-NodeJS warnings", !output.includes("HAP-NodeJS WARNING")],
  ["no deprecation warnings", !/deprecat/i.test(output)],
  ["no uncaught errors", !/Uncaught|unhandledRejection|TypeError|ReferenceError/.test(output)],
];

let failed = false;
for (const [name, ok] of checks) {
  console.log(`${ok ? "✔" : "✖"} ${name}`);
  failed ||= !ok;
}
console.log(`Full log: smoke-test.log`);
process.exit(failed ? 1 : 0);
