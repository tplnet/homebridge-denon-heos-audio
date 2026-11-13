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

The GitHub workflow runs the same checks on every push and weekly (Node 22/24, Homebridge 1.x and latest).

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

- [ ] Every device is listed in the log with the correct name, model, serial number and IP address.
- [ ] The listed supported modes are plausible (Denon Home 150 / 250: `HEOSCLI`; Home Amp and Cinema 60: `AVRCONTROL, HEOSCLI`).

## 2. Automatic setup

- [ ] With `autoAddDiscoveredDevices` enabled, every discovered device is added with its HEOS name (log: `Automatically adding discovered device …`).
- [ ] Home Amp and Cinema 60 are added as `HYBRID`, the Denon Home 150 / 250 as `HEOSCLI`.
- [ ] Manually configured devices keep their manual settings (log: `… is configured manually. Using the manual configuration.`).
- [ ] Devices in `excludedSerialNumbers` are not added.
- [ ] Moving a device from automatic to manual configuration keeps it paired in the Home app.

## 3. Startup

- [ ] All configured devices start without errors.
- [ ] Manufacturer, model and firmware version are shown in the accessory details in the Home app.
- [ ] A device with a wrong `controlProtocol` is reported in the log and skipped, and the other devices still work.
- [ ] Homebridge starts while one device is unplugged, and that device shows *No Response*.

## 4. Controls (per device)

| Check | Home 150 | Home 250 | Home Amp | Cinema 60 |
| --- | :-: | :-: | :-: | :-: |
| Power on / off from the Home app | ✅ (Office) | ☐ | ☐ | ✅ |
| Power state updates when changed on the device / in the HEOS app | ☐ | ☐ | ☐ | ☐ |
| Volume slider sets the volume | ☐ | ☐ | ☐ | ☐ |
| Volume changed on the device updates the slider | ☐ | ☐ | ☐ | ☐ |
| Remote: volume buttons (`volumeStepSize`) | ☐ | ☐ | ☐ | ☐ |
| Volume limit: 100 % in Home = limit on device | ☐ | ☐ | ☐ | ☐ |
| Volume limit 0 keeps the device silent | ☐ | ☐ | ☐ | ☐ |
| Mute / unmute | ☐ | ☐ | ☐ | ☐ |
| Switch input from the Home app | ☐ | ☐ | ☐ | ☐ |
| Input changed in the HEOS app shows up in Home | ☐ | ☐ | ☐ | ☐ |
| Streaming source (Spotify / AirPlay) is shown as current input | ☐ | ☐ | ☐ | ☐ |
| Remote: play / pause | ☐ | ☐ | ☐ | ☐ |
| Remote: next / previous track | ☐ | ☐ | ☐ | ☐ |

Suggested inputs to configure:

- Denon Home Amp (Hybrid / AVR Control): check the IDs in the debug log (`SI…`) after switching inputs once
- Denon Home 150 / 250: `aux_in_1`
- Marantz Cinema 60 (Hybrid / AVR Control): `TV`, `BD`, `GAME`, `MPLAY`

## 5. Robustness

- [ ] Unplug a device for a minute and plug it back in. It becomes responsive again without restarting Homebridge.
- [ ] Restart the router / Wi-Fi. All devices reconnect.
- [ ] Rapidly move the volume slider and press play/pause several times. Homebridge must not crash.
- [ ] Control the same device from the HEOS app while the Home app is open. States stay in sync.
- [ ] Leave Homebridge running for 24 h and check the log for errors or warnings.
- [ ] Device discovery is still running after 24 h (no `Device discovery stopped` without a following restart). With `autoAddDiscoveredDevices`, a speaker switched on hours after the Homebridge start is added.

## 6. Adding to the Home app

- [ ] Every device can be added with **+ → Add Accessory → More options…** and the setup code from the log.
- [ ] The pairing survives a Homebridge restart and a plugin update.

## Reporting

For any failure note: device, protocol, what you did, what you expected, and the debug log around that time.
