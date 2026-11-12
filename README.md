# Homebridge Denon Heos Audio

Control your **Denon and Marantz HEOS speakers, amplifiers and AV receivers** from Apple Home.

Each device appears in the Home app as a TV accessory, so you can:

- switch it on and off
- change the volume and mute it
- pick an input (HDMI ARC, optical, AUX, …)
- play, pause and skip tracks with the Remote in Control Center

> This is a fork of [hov3rcraft/homebridge-denon-heos-audio](https://github.com/hov3rcraft/homebridge-denon-heos-audio) with stability fixes
> (no more Homebridge crashes on unexpected device messages), Marantz support in device discovery and unit tests.
> The plugin is still **beta**. Running it on a [child bridge](https://github.com/homebridge/homebridge/wiki/Child-Bridges) is recommended.

## Contents

- [Which devices work?](#which-devices-work)
- [Choosing a control protocol](#choosing-a-control-protocol)
- [Installation](#installation)
- [Setup in 4 steps](#setup-in-4-steps)
- [Configuration reference](#configuration-reference)
- [Inputs](#inputs)
- [Using it in the Home app](#using-it-in-the-home-app)
- [Troubleshooting](#troubleshooting)
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

**Hybrid** uses AVR Control for power and HEOS CLI for everything else. Pick it whenever discovery reports both protocols.

## Installation

This fork is not published on npm. Install it directly from GitHub.

1. If the original plugin is installed, uninstall it first. Both use the same package name.
2. Open the **Homebridge UI → Terminal** (or SSH into your Homebridge host) and run:

   ```bash
   npm install -g github:tplnet/homebridge-denon-heos-audio
   ```

   The plugin is compiled automatically during installation.
3. Restart Homebridge.

To update later, run the same command again and restart Homebridge.

## Setup in 4 steps

### 1. Find your device

In the plugin settings, enable **Device Discovery** and restart Homebridge. After a few seconds the log shows something like:

```
[Platform] Found Denon / Marantz device in local network:
[Platform] Friendly name: Living Room
[Platform] Model name:    Denon Home 250
[Platform] Serial number: BME12345678901
[Platform] IP address:    192.168.1.42
[Platform] Supported modes: HEOSCLI
```

Note the **serial number**, the **IP address** and the **supported modes**.

> Make sure Homebridge's log level is at least *info*. Discovery uses SSDP/UPnP, so Homebridge and the device must be in the same network (no VLAN separation).

### 2. Give the device a fixed IP address

The plugin connects to the IP address you configure. Reserve that address for the device in your router (on a FRITZ!Box: *Home Network → Network → device → "Always assign this network device the same IPv4 address"*).

### 3. Add the device to the plugin configuration

Use the settings form in the Homebridge UI, or edit `config.json`:

```json
{
  "platform": "DenonHeosAudio",
  "deviceDiscovery": true,
  "devices": [
    {
      "name": "Living Room",
      "serialNumber": "BME12345678901",
      "ip": "192.168.1.42",
      "controlProtocol": "HEOSCLI"
    },
    {
      "name": "Cinema",
      "serialNumber": "MZC12345678901",
      "ip": "192.168.1.50",
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

Restart Homebridge afterwards. Once everything is set up you can turn device discovery off again.

### 4. Add the accessory to the Home app

HomeKit allows only one TV per bridge, so every device is published as its **own accessory** and does **not** appear automatically:

1. Home app → **+** → **Add Accessory** → **More options…**
2. Select the device (e.g. *Living Room*).
3. Enter the **Homebridge PIN** (shown in the Homebridge UI and in the log).

## Configuration reference

| Option | Required | Default | Description |
| --- | --- | --- | --- |
| `deviceDiscovery` | no | `true` | Logs Denon / Marantz devices found in the network. |
| `devices[].name` | yes | | Name shown in the Home app. |
| `devices[].serialNumber` | yes | | Serial number of the device (see discovery). |
| `devices[].ip` | yes | | Fixed IPv4 address of the device. |
| `devices[].controlProtocol` | yes | | `HEOSCLI`, `AVRCONTROL` or `HYBRID` (see [above](#choosing-a-control-protocol)). |
| `devices[].volumeLimitEnabled` | no | `false` | Enables the volume limit. |
| `devices[].volumeLimit` | no | `99` | 0–99. With a limit, 100 % in the Home app equals this value on the device. |
| `devices[].volumeStepSize` | no | `2` | 1–10. Volume change per press of the volume buttons in the Remote. |
| `devices[].inputs` | no | `[]` | Inputs to show in the Home app, see [Inputs](#inputs). |
| `devices[].inputs[].inputID` | yes | | Input ID (depends on the protocol, see below). |
| `devices[].inputs[].name` | yes | | Name shown in the Home app. |
| `devices[].inputs[].showInList` | no | `true` | Hide the input from the input list without removing it. |
| `consoleLogEnabled` | no | `false` | Writes the plugin log directly to the console (debugging only). |
| `consoleLogLevel` | no | `debug` | Log level for the console log. |

A misconfigured device (unknown protocol, invalid volume limit, …) is reported in the log and skipped. The other devices keep working.

## Inputs

Only the inputs you list under `inputs` are shown in the Home app. The input IDs depend on the protocol:

| Protocol | Example input IDs |
| --- | --- |
| HEOS CLI | `hdmi_arc_1`, `optical_in_1`, `aux_in_1`, `line_in_1`, `coax_in_1`, `phono` |
| AVR Control / Hybrid | `TV`, `BD`, `GAME`, `MPLAY`, `CBL/SAT`, `DVD`, `CD`, `TUNER`, `AUX1`, `NET` |

The settings form in the Homebridge UI suggests all known IDs as you type.

Streaming sources (Spotify, TuneIn, AirPlay, …) are recognised and shown as the *current* input, but they can't be selected from the Home app. Start them from the HEOS app, AirPlay or Spotify Connect.

**Finding the right ID:** select the input once with the HEOS app or the remote, then look at the Homebridge debug log. With HEOS CLI the ID appears as `"mid":"inputs/<id>"`, with AVR Control as `SI<ID>`.

## Using it in the Home app

| Action | What happens |
| --- | --- |
| Power button | Power on / standby (AVR Control, Hybrid) or play / stop (HEOS CLI) |
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

**The Marantz receiver doesn't react to AVR Control commands.**
Enable *Network Control* (sometimes called *IP Control*) in the receiver's network settings so it stays reachable in standby.

**Getting more details:** enable debug logging for Homebridge (or `consoleLogEnabled`) and include the log when [opening an issue](https://github.com/tplnet/homebridge-denon-heos-audio/issues).

## Development

```bash
git clone https://github.com/tplnet/homebridge-denon-heos-audio.git
cd homebridge-denon-heos-audio
npm install          # also builds the plugin
npm run lint
npm test             # builds and runs the unit tests (no device needed)
npm run watch        # starts a local Homebridge with test/hbConfig and rebuilds on change
```

Manual tests with real devices: see [TESTING.md](TESTING.md).

Upstream changes from the original project can be merged with:

```bash
git remote add upstream https://github.com/hov3rcraft/homebridge-denon-heos-audio.git
git fetch upstream && git merge upstream/main
```

## Resources

- [AVR Control protocol specification](https://assets.denon.com/documentmaster/uk/avr1713_avr1613_protocol_v860.pdf)
- [HEOS CLI protocol specification](https://rn.dmglobal.com/usmodel/HEOS_CLI_ProtocolSpecification-Version-1.17.pdf)

## Credits

Original plugin by [hov3rcraft](https://github.com/hov3rcraft). Licensed under the [MIT License](LICENSE).
