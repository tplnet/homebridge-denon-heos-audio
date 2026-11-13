# Homebridge Denon Heos Audio

Control your **Denon and Marantz HEOS speakers, amplifiers and AV receivers** from Apple Home.

Each device appears in the Home app as a TV accessory, so you can:

- switch it on and off
- change the volume and mute it
- pick an input (HDMI ARC, optical, AUX, …)
- play, pause and skip tracks with the Remote in Control Center

[![npm](https://img.shields.io/npm/v/@tplnet/homebridge-denon-heos-audio)](https://www.npmjs.com/package/@tplnet/homebridge-denon-heos-audio)
[![CI](https://github.com/tplnet/homebridge-denon-heos-audio/actions/workflows/ci.yml/badge.svg)](https://github.com/tplnet/homebridge-denon-heos-audio/actions/workflows/ci.yml)

> This is a fork of [hov3rcraft/homebridge-denon-heos-audio](https://github.com/hov3rcraft/homebridge-denon-heos-audio) with stability fixes
> (no more Homebridge crashes on unexpected device messages), automatic setup of discovered devices, inputs read from the device,
> Marantz support and automated tests. See the [changelog](CHANGELOG.md).
> Running it on a [child bridge](https://github.com/homebridge/homebridge/wiki/Child-Bridges) is recommended.

## Contents

- [Which devices work?](#which-devices-work)
- [Choosing a control protocol](#choosing-a-control-protocol)
- [Installation](#installation)
- [Setup](#setup)
- [Adding a device to Apple Home (step by step)](#adding-a-device-to-apple-home-step-by-step)
- [Configuration reference](#configuration-reference)
- [Inputs](#inputs)
- [Using it in the Home app](#using-it-in-the-home-app)
- [Troubleshooting](#troubleshooting)
- [Compatibility and security](#compatibility-and-security)
- [Development](#development)

## Which devices work?

Any Denon or Marantz device that supports **HEOS** and/or the network control protocol known as **AVR Control** (Telnet port 23).
The plugin talks to the device directly over your local network. No cloud and no HEOS account are needed.

Devices used for testing this fork:

| Device | Type | Recommended protocol |
| --- | --- | --- |
| Denon Home 150 | Smart speaker | HEOS CLI |
| Denon Home 250 | Smart speaker | HEOS CLI |
| Denon Home Amp | Streaming amplifier | Hybrid |
| Marantz Cinema 60 | AV receiver | Hybrid |

Not sure what your device supports? Turn on [device discovery](#1-find-your-device): it lists every device found and the protocols it supports.

## Choosing a control protocol

| Protocol | Best for | Power button in Home | Play / pause / skip | Volume, mute, inputs |
| --- | --- | --- | --- | --- |
| **HEOS CLI** | Smart speakers (Denon Home 150 / 250 / 350, …) | Starts / stops **playback** | ✅ | ✅ |
| **AVR Control** | Older AV receivers without HEOS | Real power on / standby | ❌ | ✅ |
| **Hybrid** | AV receivers and amplifiers with HEOS (e.g. Marantz Cinema series, Denon AVR-X, Denon Home Amp) | Real power on / standby | ✅ | ✅ |

**Why does "power" mean "playback" with HEOS CLI?** HEOS speakers have no real standby command. The plugin therefore treats "playing" as on and "stopped/paused" as off.
Switching on resumes the last source. If there is nothing to resume (e.g. after the speaker was restarted), the first HEOS favorite is started, so switching on also works in scenes and automations. You can choose another favorite or turn this off with `powerOnFavorite`.

**Hybrid** uses AVR Control for power and HEOS CLI for everything else. Pick it whenever discovery reports both protocols.

## Installation

**Homebridge UI:** go to **Plugins**, search for `@tplnet/homebridge-denon-heos-audio` and click **Install**. Restart Homebridge afterwards.

**Terminal:** run in the Homebridge storage directory (e.g. `/var/lib/homebridge`, or `/volume1/homebridge` on a Synology NAS):

```bash
npm install @tplnet/homebridge-denon-heos-audio
```

Requirements: Homebridge 1.8 or newer (2.x supported), Node.js 22.12+, 24 or 26.

### Switching from the original plugin

The original plugin is called `homebridge-denon-heos-audio` (without `@tplnet/`). Both use the platform name `DenonHeosAudio`, so your existing configuration keeps working, but they must not be installed at the same time:

1. Remove the original **in the terminal** (removing it in the UI may also delete its configuration):

   ```bash
   npm uninstall homebridge-denon-heos-audio
   ```

2. Install this plugin as described above and restart Homebridge.

## Setup

There are two ways to set up your devices. You can combine them.

| | Automatic | Manual |
| --- | --- | --- |
| Effort | Switch on one option | One entry per device |
| Name in the Home app | Name from the HEOS app | Your choice |
| Control protocol | Chosen automatically (Hybrid if supported) | Your choice |
| Inputs | Read from the device | Read from the device, or your own list |
| Volume limit, step size | Defaults | Fully configurable |
| Device switched on later | Added with the next search (every 2 min) | Always present (shows *No Response* while off) |

**Rule of thumb:** use automatic setup for simple speakers and add AV receivers or amplifiers whose inputs you want to switch manually.
Devices that you configure manually are **never** touched by the automatic setup, even if they are discovered.

### Step 1: Find your devices

In the plugin settings, enable **Device Discovery** and restart Homebridge. After a few seconds the log lists every device it finds:

```
[Platform] Found Denon / Marantz device in local network:
[Platform] Friendly name: Patio Music
[Platform] Model name:    Denon Home Amp
[Platform] Serial number: DCPZ012345678
[Platform] IP address:    192.168.1.149
[Platform] Supported modes: AVRCONTROL, HEOSCLI
```

> Make sure Homebridge's log level is at least *info*. Discovery uses SSDP/UPnP and only asks for HEOS devices (search target `urn:schemas-denon-com:device:ACT-Denon:1`), so other devices in your network are not contacted. Homebridge and the devices must be in the same network (no VLAN or guest network separation).

### Step 2: Give the devices a fixed IP address

The plugin connects to the device's IP address. Reserve the address in your router so it doesn't change (on a FRITZ!Box: *Home Network → Network → device → "Always assign this network device the same IPv4 address"*).
With automatic setup the current address is picked up at every Homebridge start; a reservation still avoids problems if the address changes while Homebridge is running.

### Step 3a: Automatic setup

Enable **Add Discovered Devices Automatically** in the plugin settings (or set `"autoAddDiscoveredDevices": true`) and restart Homebridge. Each discovered device is added with:

- the **name** from the HEOS app (e.g. *Patio Music*),
- the **control protocol** `HYBRID` if the device supports both protocols, otherwise `HEOSCLI`,
- the inputs reported by the device,
- default settings (volume step 2, no volume limit, first HEOS favorite when switching on without a source).

The log confirms every device: `Automatically adding discovered device 'Patio Music' (HYBRID, 192.168.1.149).`

To leave out a device, add its serial number to **Excluded Devices** (`excludedSerialNumbers`).

Discovery keeps running in the background and searches for HEOS devices every 2 minutes, so a device that is switched on later is added with the next search. If the discovery fails (for example after a network change), it restarts automatically after 1 to 30 minutes.

### Step 3b: Manual setup

Use the settings form in the Homebridge UI, or edit `config.json`:

```json
{
  "platform": "DenonHeosAudio",
  "deviceDiscovery": true,
  "autoAddDiscoveredDevices": true,
  "excludedSerialNumbers": ["BLT01234567890"],
  "devices": [
    {
      "name": "Cinema",
      "serialNumber": "MBZM012345678",
      "ip": "192.168.1.146",
      "controlProtocol": "HYBRID",
      "volumeLimitEnabled": true,
      "volumeLimit": 70,
      "inputs": [
        { "inputID": "TV", "name": "TV" },
        { "inputID": "GAME", "name": "PlayStation" },
        { "inputID": "MPLAY", "name": "Apple TV" }
      ]
    }
  ]
}
```

In this example *Cinema* uses the manual configuration, all other discovered devices are added automatically, and the device with the serial number `BLT01234567890` is skipped.

Restart Homebridge afterwards.

> **Switching a device from automatic to manual keeps it in the Home app.** The accessory is identified by the serial number, so you don't have to add it again.

### Step 4: Add the devices to the Home app

See the next section.

## Adding a device to Apple Home (step by step)

HomeKit allows only one TV per bridge. That's why every device is published as its **own accessory**. It does **not** appear in the Home app automatically together with your other Homebridge accessories, so you have to add each device once.

**Before you start**

- Your iPhone or iPad is in the **same Wi-Fi network** as Homebridge.
- Homebridge is running and the log shows a line like this for each device:
  `Please add [Patio Music BF75] manually in Home app. Setup Code: 031-45-154`
  The setup code is the **PIN of the bridge that runs the plugin** (the child bridge PIN, if you use a child bridge). You can also find it in the Homebridge UI.

**Steps**

1. Open the **Home** app.
2. Tap **+** (top right) and choose **Add Accessory**.
3. Tap **More options…** at the bottom. Don't scan a code, the QR code in the Homebridge UI belongs to the bridge, not to the speaker.
4. Wait a moment until the device appears with a TV icon, e.g. *Patio Music BF75*. Tap it.
5. The Home app says that the accessory is not certified. Tap **Add Anyway**. This is normal for Homebridge.
6. Enter the **setup code** from the log, e.g. `031-45-154`.
7. Choose the **room** and tap **Continue**.
8. Keep or change the **name** and tap **Continue**.
9. The Home app may ask about the TV inputs. Leave them as they are and tap **Continue**. You can rename or hide inputs later.
10. Tap **Done**.

Repeat these steps for every device. You only have to do it once per device. Updates of the plugin and Homebridge restarts keep the pairing.

**Afterwards**

- Long-press the tile to see power, volume (in the device settings) and inputs.
- Use the **Remote** in Control Center to play/pause, skip tracks and change the volume with the iPhone's volume buttons. Select the device at the top of the Remote.
- If you configured inputs, you can hide or rename them in the device settings under **Inputs**.

**The device does not appear in step 4?**

- Wait up to a minute and make sure the iPhone is in the same network.
- Check the Homebridge log for the `Please add [...] manually in Home app` line. No line means the device was not set up (check the configuration and the log for errors).
- On some systems (e.g. Synology NAS, Docker) the default network advertiser doesn't work reliably. In the Homebridge UI go to **Settings → mDNS Advertiser**, choose **Ciao** (or **Avahi**), restart and try again.
- The device was paired before and removed from the Home app in the meantime: restart Homebridge and try again.

## Configuration reference

| Option | Required | Default | Description |
| --- | --- | --- | --- |
| `deviceDiscovery` | no | `true` | Logs Denon / Marantz devices found in the network. |
| `autoAddDiscoveredDevices` | no | `false` | Adds every discovered device automatically (see [automatic setup](#step-3a-automatic-setup)). Manually configured devices are not affected. |
| `excludedSerialNumbers` | no | `[]` | Serial numbers of discovered devices that should not be added automatically. |
| `devices[].name` | yes | | Name shown in the Home app. |
| `devices[].serialNumber` | yes | | Serial number of the device (see discovery). |
| `devices[].ip` | yes | | Fixed IPv4 address of the device. |
| `devices[].controlProtocol` | yes | | `HEOSCLI`, `AVRCONTROL` or `HYBRID` (see [above](#choosing-a-control-protocol)). |
| `devices[].volumeLimitEnabled` | no | `false` | Enables the volume limit. |
| `devices[].volumeLimit` | no | `99` | 0–99. With a limit, 100 % in the Home app equals this value on the device. |
| `devices[].volumeStepSize` | no | `2` | 1–10. Volume change per press of the volume buttons in the Remote. |
| `devices[].powerOnFavorite` | no | `1` | HEOS CLI only: HEOS favorite that is started when the speaker is switched on but has nothing to resume (1 = first favorite in the HEOS app, 0 = disabled). Also used for automatically added devices. |
| `devices[].inputs` | no | `[]` | Inputs to show in the Home app, see [Inputs](#inputs). |
| `devices[].inputs[].inputID` | yes | | Input ID (depends on the protocol, see below). |
| `devices[].inputs[].name` | yes | | Name shown in the Home app. |
| `devices[].inputs[].showInList` | no | `true` | Hide the input from the input list without removing it. |
| `consoleLogEnabled` | no | `false` | Writes the plugin log directly to the console (debugging only). |
| `consoleLogLevel` | no | `debug` | Log level for the console log. |

`devices` lists the manually configured devices. Each serial number may only appear once.

A misconfigured device (unknown protocol, invalid volume limit, …) is reported in the log and skipped. The other devices keep working.

## Inputs

**You usually don't have to configure inputs.** With HEOS CLI and Hybrid the plugin asks the device for its inputs at startup and shows exactly those in the Home app, with the names set on the device (e.g. *Apple TV* or *Switch* on a Marantz receiver):

| Device (examples) | Inputs reported by the device |
| --- | --- |
| Denon Home 150 / 250 | AUX In |
| Denon Home Amp | TV, Optical In, Line In |
| Marantz Cinema 60 | the sources enabled on the receiver |

The log shows what was found: `Inputs reported by the device: TV (tv), Optical In (optical_in_1), Line In (line_in_1)`.

Configure `inputs` only if you want to choose the inputs, their names or their order yourself. As soon as you configure inputs, only those are shown in the input list.
If the device can't be reached at startup, the plugin falls back to a list of all known inputs (hidden). Pure AVR Control can't list inputs and always uses that list.

The input IDs depend on the protocol:

| Protocol | Example input IDs |
| --- | --- |
| HEOS CLI and Hybrid | `tv`, `hdmi_arc_1`, `optical_in_1`, `aux_in_1`, `line_in_1`, `bluray`, `game`, `aux1`, `cable_sat` |
| AVR Control | `TV`, `BD`, `GAME`, `MPLAY`, `CBL/SAT`, `DVD`, `CD`, `TUNER`, `AUX1`, `NET` |

The settings form in the Homebridge UI suggests all known IDs as you type.

Streaming sources (Spotify, TuneIn, AirPlay, …) are recognised and shown as the *current* input, but they can't be selected from the Home app. Start them from the HEOS app, AirPlay or Spotify Connect.

**Finding an ID manually:** select the input once with the HEOS app or the remote, then look at the Homebridge debug log. With HEOS CLI and Hybrid the ID appears as `"mid":"inputs/<id>"`, with AVR Control as `SI<ID>`.

## Using it in the Home app

| Action | What happens |
| --- | --- |
| Power button | Power on / standby (AVR Control, Hybrid) or play / stop (HEOS CLI). With HEOS CLI, switching on resumes the last source; if there is none, the first HEOS favorite is started (see `powerOnFavorite`). |
| Input picker | Switches the input |
| Control Center → Remote → volume buttons on your iPhone | Volume up / down by `volumeStepSize` |
| Remote → centre button / play-pause | Play / pause (HEOS CLI, Hybrid) |
| Remote → left / right | Previous / next track (HEOS CLI, Hybrid) |
| Siri, scenes and automations | Power, volume, mute and inputs |

## Troubleshooting

**The device shows "No Response".**
Check that the IP address is still correct and that the device is reachable from the Homebridge host (`ping <ip>`). Speakers in deep sleep sometimes need one wake-up via the HEOS app.

**"Player list does not include serial …" in the debug log.**
The serial number doesn't match. Use the value from device discovery exactly as shown.

**Discovery finds nothing.**
SSDP doesn't cross VLANs or guest networks. Docker installations need `network_mode: host`.

**A speaker doesn't switch on (HEOS CLI).**
Switching on starts playback. If the speaker has nothing to resume, the plugin starts the HEOS favorite set in `powerOnFavorite` (default: the first one). Make sure at least one favorite exists in the HEOS app (*Music → Favorites*). The debug log shows `starting HEOS favorite …` when this happens.

**The Marantz receiver doesn't react to AVR Control commands.**
Enable *Network Control* (sometimes called *IP Control*) in the receiver's network settings so it stays reachable in standby.

**The device can't be added in the Home app.**
See [The device does not appear in step 4?](#adding-a-device-to-apple-home-step-by-step)

**A device is added automatically although I don't want it in HomeKit.**
Add its serial number to `excludedSerialNumbers` and restart Homebridge. Then remove it from the Home app.

**Getting more details:** enable debug logging for Homebridge (or `consoleLogEnabled`) and include the log when [opening an issue](https://github.com/tplnet/homebridge-denon-heos-audio/issues).

## Compatibility and security

Every change is checked against the current Homebridge release and for known vulnerabilities (CVEs):

| Checked | Versions |
| --- | --- |
| Homebridge | 1.11.4 and 2.5.0 (HAP-NodeJS 0.14.3 / 2.3.0) |
| Node.js | 22, 24 and 26 (Homebridge 1.x: up to 24) |
| Known vulnerabilities | `npm audit`: 0 findings (runtime and development dependencies) |

*Last checked: November 2026.* The GitHub workflow repeats these checks on every push and **weekly**, so new Homebridge releases and newly published CVEs are noticed even without code changes.

To run all checks locally:

```bash
npm run check   # npm audit + lint + unit tests + smoke test
```

The smoke test (`npm run smoke`) starts the installed Homebridge version with simulated HEOS and AVR Control devices and fails on errors, HAP warnings or deprecation warnings. To test another Homebridge version, install it temporarily with `npm install --no-save homebridge@<version>`.

## Development

```bash
git clone https://github.com/tplnet/homebridge-denon-heos-audio.git
cd homebridge-denon-heos-audio
npm install          # also builds the plugin
npm run lint
npm test             # builds and runs the unit tests (no device needed)
npm run smoke        # compatibility smoke test with simulated devices
npm run check        # everything: audit, lint, tests, smoke test
npm run watch        # starts a local Homebridge with test/hbConfig and rebuilds on change
```

Manual tests with real devices: see [TESTING.md](TESTING.md).
Publishing a new version: see [RELEASING.md](RELEASING.md).

Upstream changes from the original project can be merged with:

```bash
git remote add upstream https://github.com/hov3rcraft/homebridge-denon-heos-audio.git
git fetch upstream && git merge upstream/main
```

## Resources

- [AVR Control protocol specification](https://assets.denon.com/documentmaster/uk/avr1713_avr1613_protocol_v860.pdf)
- [HEOS CLI protocol specification](https://rn.dmglobal.com/usmodel/HEOS_CLI_ProtocolSpecification-Version-1.17.pdf)

## Credits

Original plugin by [hov3rcraft](https://github.com/hov3rcraft), fork maintained by [tplnet](https://github.com/tplnet).
Licensed under the [GNU General Public License v3.0](LICENSE), like the original project.
