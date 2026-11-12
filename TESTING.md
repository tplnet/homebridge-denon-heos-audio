# Manual test checklist

Unit tests (`npm test`) cover the protocol handling without a device.
This checklist covers what can only be verified with real hardware.

## Test devices

| Device | Protocol(s) to test |
| --- | --- |
| Denon Home 150 | HEOS CLI |
| Denon Home 250 | HEOS CLI |
| Denon Home Amp | HEOS CLI |
| Marantz Cinema 60 | Hybrid, AVR Control, HEOS CLI |

Run Homebridge with debug logging (`homebridge -D` or `npm run watch`) and keep the log open while testing.

## 1. Discovery

- [ ] Every device is listed in the log with the correct name, model, serial number and IP address.
- [ ] The listed supported modes are plausible (Denon Home: `HEOSCLI`; Cinema 60: `AVRCONTROL, HEOSCLI`).

## 2. Startup

- [ ] All configured devices start without errors.
- [ ] Manufacturer, model and firmware version are shown in the accessory details in the Home app.
- [ ] A device with a wrong `controlProtocol` is reported in the log and skipped, and the other devices still work.
- [ ] Homebridge starts while one device is unplugged, and that device shows *No Response*.

## 3. Controls (per device)

| Check | Home 150 | Home 250 | Home Amp | Cinema 60 |
| --- | :-: | :-: | :-: | :-: |
| Power on / off from the Home app | ☐ | ☐ | ☐ | ☐ |
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

- Denon Home Amp: `hdmi_arc_1`, `optical_in_1`, `aux_in_1`
- Denon Home 150 / 250: `aux_in_1`
- Marantz Cinema 60 (Hybrid / AVR Control): `TV`, `BD`, `GAME`, `MPLAY`

## 4. Robustness

- [ ] Unplug a device for a minute and plug it back in. It becomes responsive again without restarting Homebridge.
- [ ] Restart the router / Wi-Fi. All devices reconnect.
- [ ] Rapidly move the volume slider and press play/pause several times. Homebridge must not crash.
- [ ] Control the same device from the HEOS app while the Home app is open. States stay in sync.
- [ ] Leave Homebridge running for 24 h and check the log for errors or warnings.

## Reporting

For any failure note: device, protocol, what you did, what you expected, and the debug log around that time.
