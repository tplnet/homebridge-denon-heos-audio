# Configuration

[← Back to the README](../README.md)

The settings form of the Homebridge UI covers everything described here (in English and German). This page explains the control protocols and the setup, and is the reference for all options and for editing `config.json` directly.

- [Choosing a control protocol](#choosing-a-control-protocol)
- [Setup](#setup)
- [Configuration reference](#configuration-reference)
- [Inputs](#inputs)
- [Languages](#languages)
- [Beta versions](#beta-versions)
- [Switching from another package](#switching-from-another-package)

## Choosing a control protocol

| Protocol | Best for | Power button in Home | Play / pause / skip | Volume, mute, inputs |
| --- | --- | --- | --- | --- |
| **HEOS CLI** | Smart speakers (Denon Home 150 / 250 / 350, …) | Starts / stops **playback** | ✅ | ✅ |
| **AVR Control** | Older AV receivers without HEOS | Real power on / standby | ❌ | ✅ |
| **Hybrid** | AV receivers and amplifiers with HEOS (e.g. Marantz Cinema series, Denon AVR-X, Denon Home Amp) | Real power on / standby | ✅ | ✅ |

**Why does "power" mean "playback" with HEOS CLI?** HEOS speakers have no real standby command. The plugin therefore treats "playing" as on and "stopped/paused" as off.
Switching on resumes the last source. If there is nothing to resume (e.g. after the speaker was restarted or a streaming session ended), or playback doesn't start within 8 seconds, the first HEOS favorite is started, so switching on also works in scenes and automations. You can choose another favorite or turn this off with `powerOnFavorite`.

> **Requirement:** at least one favorite in the HEOS app (*Music → Favorites*, e.g. a radio station). Without a favorite, a speaker that has nothing to resume can't be switched on from Apple Home.

**Hybrid** uses AVR Control for power and HEOS CLI for everything else. Pick it whenever discovery reports both protocols and you want real standby.

**Wrong protocol?** At startup the plugin checks which protocols the device supports. If the configured one isn't supported (e.g. *Hybrid* on a Denon Home 150), it uses a supported one instead and logs a warning:
`"Office Speaker" doesn't support AVR Control (port 23 closed), so "Hybrid" can't be used. Using "HEOS CLI" instead – please change "Control Protocol" in the plugin settings.`
If a device configured with *HEOS CLI* also supports AVR Control, the log mentions that *Hybrid* is possible. If the device is switched off at startup, the configuration is used unchanged.

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

In the plugin settings, enable **Device Discovery** and restart Homebridge. About 30 seconds after the start, the log shows an **overview of all devices** – the ones found in the network and the manually configured ones – and whether they were added:

```
[Platform] Device overview: 4 found in the network, 2 added automatically, 1 added manually, 1 not added.
[Platform] Name          Model              IP address     Serial number  Protocol  Status
[Platform] Dining Room   Denon Home 250     192.168.1.120  BMC012345678   HEOSCLI   added manually
[Platform] Office        Denon Home 150     192.168.1.112  BLT012345678   HEOSCLI   added automatically
[Platform] Patio Music   Denon Home Amp     192.168.1.149  DCPZ012345678  HYBRID    added automatically
[Platform] Receiver      Marantz CINEMA 60  192.168.1.146  MBZM012345678  HYBRID    not added (excluded)
```

Possible states: *added automatically*, *added manually* (with *not found in the network* if the discovery didn't find a configured device), *not added* with the reason (*automatic adding disabled*, *excluded*, *not reachable*, *no supported protocol*). If a device is found later, an updated overview follows. The supported control protocols of each device (e.g. `AVRCONTROL, HEOSCLI`) are listed in the debug log.

> Make sure Homebridge's log level is at least *info*. Discovery uses SSDP/UPnP and only asks for HEOS devices (search target `urn:schemas-denon-com:device:ACT-Denon:1`), so other devices in your network are not contacted. Homebridge and the devices must be in the same network (no VLAN or guest network separation).

### Step 2: Give the devices a fixed IP address

The plugin connects to the device's IP address. Reserve the address in your router so it doesn't change. Most routers call this a *DHCP reservation*, *static lease* or *fixed IP address*: open the router's web interface, find the list of connected devices and choose the option to always assign the same address to the speaker. The router's manual describes the exact steps.
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

See [Apple Home](apple-home.md).

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
| `devices[].powerOnFavorite` | no | `1` | HEOS CLI only: HEOS favorite that is started when the speaker is switched on but has nothing to resume (position in the favorite list of the HEOS app, *Music → Favorites*: 1 = first, up to 200; 0 = disabled). The favorite must exist in the HEOS app. Also used for automatically added devices. |
| `devices[].powerOnQuickSelect` | no | `0` | HEOS CLI only: Quick Select slot of the device (the numbered buttons, e.g. 1–3 on a Denon Home 150, 1–6 on a Denon Home 300) that is started instead of the HEOS favorite when the speaker has nothing to resume. 0 = use the HEOS favorite. |
| `devices[].inputs` | no | `[]` | Inputs to show in the Home app, see [Inputs](#inputs). |
| `devices[].inputs[].inputID` | yes | | Input ID (depends on the protocol, see below). Entries without input ID or name are ignored. |
| `devices[].inputs[].name` | yes | | Name shown in the Home app. |
| `devices[].inputs[].showInList` | no | `true` | Hide the input from the input list without removing it. |
| `consoleLogEnabled` | no | `false` | Writes the plugin log directly to the console (debugging only). |
| `consoleLogLevel` | no | `debug` | Log level for the console log. |

`devices` lists the manually configured devices. Each serial number may only appear once.

A misconfigured device (unknown protocol, invalid volume limit, …) is reported in the log and skipped. The other devices keep working.

## Inputs

**You usually don't have to configure inputs.** With HEOS CLI and Hybrid the plugin asks the device for its inputs at startup and shows exactly those in the Home app, with the names set on the device (e.g. *Apple TV* or *Nintendo Switch* on a Marantz receiver):

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

## Languages

The settings form in the Homebridge UI is available in these languages:

| Language | File |
| --- | --- |
| English (default) | `config.schema.json` |
| German (Deutsch) | `schemas/config.schema.de.json` |

The Homebridge UI shows the German form when its language is set to **Deutsch** (*Settings* → UI language). With the language set to *Automatic* (auto) and in Homebridge UI versions before 5.15, the English form is shown. Log messages and the documentation are in English.

## Beta versions

New features and fixes are published as a **beta** first (e.g. `1.5.0-beta.1`) and become a regular version after they have been tested. Betas are not offered to users of the regular version. To try one: Homebridge UI → *Plugins* → ⋮ on this plugin → *Manage Version* → choose the beta, or run `npm install @tplnet/homebridge-heos-multiroom-audio@beta` in the Homebridge storage directory. While you run a beta, the Homebridge UI offers newer betas and later the regular version as updates. Betas can contain errors – please report them as an [issue](https://github.com/tplnet/homebridge-heos-multiroom-audio/issues).

## Switching from another package

### Switching from @tplnet/homebridge-denon-heos-audio

This plugin was renamed from `@tplnet/homebridge-denon-heos-audio` to `@tplnet/homebridge-heos-multiroom-audio` (version 1.5.0). The platform name `DenonHeosAudio` and your configuration stay the same, and the devices keep their pairing in Apple Home. The two packages must not be installed at the same time:

1. Remove the old package **in the terminal**, in the Homebridge storage directory (removing it in the UI may also delete its configuration):

   ```bash
   npm uninstall @tplnet/homebridge-denon-heos-audio
   ```

2. Install `@tplnet/homebridge-heos-multiroom-audio` as described in the [README](../README.md#installation) and restart Homebridge.

### Switching from the original plugin

The original plugin is called `homebridge-denon-heos-audio` (without `@tplnet/`). Both use the platform name `DenonHeosAudio`, so your existing configuration keeps working, but they must not be installed at the same time:

1. Remove the original **in the terminal** (removing it in the UI may also delete its configuration):

   ```bash
   npm uninstall homebridge-denon-heos-audio
   ```

2. Install this plugin as described in the [README](../README.md#installation) and restart Homebridge.
