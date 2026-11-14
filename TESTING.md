# Test checklist

## Automated checks (before every release)

```bash
npm run check
```

This runs `npm audit` (known vulnerabilities / CVEs), lint, the unit tests and a smoke test against the installed Homebridge version with simulated devices.
Also run the smoke test against the **latest** Homebridge release:

```bash
npm view homebridge version          # latest release
npm install --no-save homebridge@latest && npm run smoke
npm install                          # back to the pinned version
```

GitHub runs these checks automatically: CI on every push (Node 22/24/26, Homebridge 1.x, pinned and latest) and the *Compatibility & CVE check* weekly and on dependency changes (homebridge@latest and @beta).

## Manual tests with real devices

Unit and smoke tests cover the protocol handling without a device.
The following checklist covers what can only be verified with real hardware.

## Test devices

| Device | Protocol(s) to test |
| --- | --- |
| Denon Home 150 | HEOS CLI |
| Denon Home 250 | HEOS CLI |
| Denon Home Amp | Hybrid, AVR Control, HEOS CLI |
| Marantz Cinema 60 | Hybrid, AVR Control, HEOS CLI |

Run Homebridge with debug logging (`homebridge -D` or `npm run watch`) and keep the log open while testing.

## 1. Discovery

- [x] Every device is listed in the log with the correct name, model, serial number and IP address.
- [x] The listed supported modes are plausible (Denon Home 150 / 250: `HEOSCLI`; Home Amp and Cinema 60: `AVRCONTROL, HEOSCLI`).

## 2. Automatic setup

- [x] With `autoAddDiscoveredDevices` enabled, every discovered device is added with its HEOS name (log: `Automatically adding discovered device …`).
- [ ] Home Amp and Cinema 60 are added as `HYBRID`, the Denon Home 150 / 250 as `HEOSCLI`.
- [x] Manually configured devices keep their manual settings (log: `… is configured manually. Using the manual configuration.`).
- [ ] Devices in `excludedSerialNumbers` are not added.
- [ ] Moving a device from automatic to manual configuration keeps it paired in the Home app.

## 3. Startup

- [x] All configured devices start without errors.
- [ ] Manufacturer, model and firmware version are shown in the accessory details in the Home app.
- [ ] A device with a wrong `controlProtocol` is reported in the log and skipped, and the other devices still work.
- [ ] Homebridge starts while one device is unplugged, and that device shows *No Response*.

## 4. Controls (per device)

| Check | Home 150 | Home 250 | Home Amp | Cinema 60 |
| --- | :-: | :-: | :-: | :-: |
| Switch on with nothing to resume (e.g. ended Spotify session): first HEOS favorite starts | ✅ | ☐ | ✅ | – |
| Switch on resumes a radio station that needs a few seconds to buffer (no favorite) | ✅ | ✅ | ☐ | – |
| Tile doesn't jump back after switching on / off (1.2.2) | ✅ | ✅ | ☐ | ☐ |
| Power on / off from the Home app | ✅ (Office, Kids Room; resumes Spotify) | ☐ | ☐ | ✅ |
| Power state updates when changed on the device / in the HEOS app | ☐ | ☐ | ☐ | ☐ |
| Volume slider sets the volume | ☐ | ☐ | ☐ | ☐ |
| Volume changed on the device updates the slider | ☐ | ☐ | ☐ | ☐ |
| Remote: volume buttons (`volumeStepSize`) | ☐ | ☐ | ☐ | ☐ |
| One tile per device in the Home app, volume via the Control Center remote (1.2.5) | ✅ | ☐ | ☐ | ☐ |
| Volume limit: 100 % in Home = limit on device | ☐ | ☐ | ☐ | ☐ |
| Volume limit 0 keeps the device silent | ☐ | ☐ | ☐ | ☐ |
| Mute / unmute | ☐ | ☐ | ☐ | ☐ |
| Switch input from the Home app | ☐ | ☐ | ☐ | ☐ |
| Input changed in the HEOS app shows up in Home | ☐ | ☐ | ☐ | ☐ |
| Streaming source (Spotify / AirPlay) is shown as current input | ☐ | ☐ | ☐ | ☐ |
| Remote: play / pause | ☐ | ☐ | ☐ | ☐ |
| Remote: next / previous track | ☐ | ☐ | ☐ | ☐ |

Inputs are read from the device (log: `Inputs reported by the device: …`). Verified with plugin 1.0.0-beta.1-tplnet.7 on all test devices:

- Denon Home Amp: TV, Optical In, Line In
- Denon Home 150 / 250: AUX In
- Marantz Cinema 60: the sources enabled on the receiver (Switch, Switch 2, Apple TV, AUX2)

Note: HEOS player ids can be negative (Dining Room, Garage, Kids Room). Control of "Kids Room" (negative id) verified with tplnet.7.

## 5. Robustness

- [ ] Unplug a device for a minute and plug it back in. It becomes responsive again without restarting Homebridge.
- [ ] Restart the router / Wi-Fi. All devices reconnect.
- [ ] Rapidly move the volume slider and press play/pause several times. Homebridge must not crash.
- [ ] Control the same device from the HEOS app while the Home app is open. States stay in sync.
- [ ] Leave Homebridge running for 24 h and check the log for errors or warnings.
- [ ] Device discovery is still running after 24 h (no `Device discovery stopped` without a following restart). With `autoAddDiscoveredDevices`, a speaker switched on hours after the Homebridge start is added.

## 6. Adding to the Home app

- [ ] Every device can be added with **+ → Add Accessory → More options…** and the setup code from the log.
- [x] The pairing survives a Homebridge restart and a plugin update.

## 7. Homebridge UI

- [x] With the UI language set to Deutsch, the plugin settings form is shown in German (1.2.6).
- [x] Dropdowns in the settings form don't make the form move with the mouse (`orderable: false`).

## Reporting

For any failure note: device, protocol, what you did, what you expected, and the debug log around that time.
