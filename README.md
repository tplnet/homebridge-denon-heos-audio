<p align="center">
  <img src="https://raw.githubusercontent.com/tplnet/homebridge-heos-multiroom-audio/main/docs/images/icon.png" width="128" alt="Homebridge HEOS Multiroom-Audio icon">
</p>

# Homebridge HEOS Multiroom-Audio (tplnet)

[![npm](https://img.shields.io/npm/v/@tplnet/homebridge-heos-multiroom-audio)](https://www.npmjs.com/package/@tplnet/homebridge-heos-multiroom-audio)
[![CI](https://github.com/tplnet/homebridge-heos-multiroom-audio/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/tplnet/homebridge-heos-multiroom-audio/actions/workflows/ci.yml)
[![Compatibility & CVE check](https://github.com/tplnet/homebridge-heos-multiroom-audio/actions/workflows/compat.yml/badge.svg)](https://github.com/tplnet/homebridge-heos-multiroom-audio/actions/workflows/compat.yml)
[![Malware scan](https://github.com/tplnet/homebridge-heos-multiroom-audio/actions/workflows/malware.yml/badge.svg)](https://github.com/tplnet/homebridge-heos-multiroom-audio/actions/workflows/malware.yml)
[![npm beta](https://img.shields.io/npm/v/@tplnet/homebridge-heos-multiroom-audio/beta?label=beta)](https://www.npmjs.com/package/@tplnet/homebridge-heos-multiroom-audio?activeTab=versions)
[![License](https://img.shields.io/npm/l/@tplnet/homebridge-heos-multiroom-audio)](LICENSE)

Package: [`@tplnet/homebridge-heos-multiroom-audio`](https://www.npmjs.com/package/@tplnet/homebridge-heos-multiroom-audio)

**HEOS** is the multiroom audio system of **Denon** and **Marantz**. This plugin brings your HEOS speakers, amplifiers and AV receivers – e.g. Denon Home, Denon Home Amp, Marantz Cinema, Denon AVR – into Apple Home.

Each device appears in the Home app as a TV accessory, so you can:

- switch it on and off
- change the volume and mute it
- pick an input (HDMI ARC, optical, AUX, …)
- play, pause and skip tracks with the Remote in Control Center

> This is a fork of [hov3rcraft/homebridge-denon-heos-audio](https://github.com/hov3rcraft/homebridge-denon-heos-audio) with stability fixes
> (no more Homebridge crashes on unexpected device messages), automatic setup of discovered devices, inputs read from the device,
> Marantz support and automated tests. See the [changelog](CHANGELOG.md).

> **Note:** Private hobby project, developed in spare time with the help of AI tools. Use at your own risk; support is best effort. See the [disclaimer](#disclaimer).

## Contents

- [Which devices work?](#which-devices-work)
- [Requirements](#requirements)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Compatibility and security](#compatibility-and-security)
- [Privacy](#privacy)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Disclaimer](#disclaimer)
- [License and credits](#license-and-credits)

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

Not sure what your device supports? Turn on device discovery: the log lists every device found with the recommended protocol.

**Control protocols:** *HEOS CLI* for speakers (on/off = play/stop), *Hybrid* for AV receivers and amplifiers with HEOS (real standby), *AVR Control* for receivers without HEOS – see [Choosing a control protocol](https://github.com/tplnet/homebridge-heos-multiroom-audio/blob/main/docs/configuration.md#choosing-a-control-protocol).

> **Requirement for HEOS CLI:** at least one favorite in the HEOS app (*Music → Favorites*, e.g. a radio station). A speaker that has nothing to resume starts this favorite when it is switched on.

## Requirements

- Homebridge 1.8 or newer (2.x supported, tested with Homebridge 2.5)
- Node.js 22.12+, 24 or 26
- Denon or Marantz devices with HEOS and/or AVR Control in the same network as Homebridge (no VLAN or guest network separation)

## Installation

**Homebridge UI:** go to **Plugins**, search for `@tplnet/homebridge-heos-multiroom-audio` (or *HEOS*) and click **Install**. Restart Homebridge afterwards.

**Terminal:** run in the Homebridge storage directory (e.g. `/var/lib/homebridge`, or `/volume1/homebridge` on a Synology NAS):

```bash
npm install @tplnet/homebridge-heos-multiroom-audio
```

Running it on a [child bridge](https://github.com/homebridge/homebridge/wiki/Child-Bridges) is recommended.

- **Beta versions:** new features are published as a beta first – how to try one: [Beta versions](https://github.com/tplnet/homebridge-heos-multiroom-audio/blob/main/docs/configuration.md#beta-versions).
- <a id="switching-from-tplnethomebridge-denon-heos-audio"></a>**Switching** from `@tplnet/homebridge-denon-heos-audio` (the former name of this plugin) or from the original `homebridge-denon-heos-audio`: the two packages must not be installed at the same time – see [Switching from another package](https://github.com/tplnet/homebridge-heos-multiroom-audio/blob/main/docs/configuration.md#switching-from-another-package).

## Quick start

1. In the plugin settings, enable **Device Discovery** and **Add Discovered Devices Automatically**, then restart Homebridge. About 30 seconds after the start the log shows an overview of all devices and whether they were added.
2. Give the devices a fixed IP address in your router (DHCP reservation).
3. Add each device to the Home app once: **+** → **Add Accessory** → **More options…** → choose the device → enter the setup code from the log – see [Apple Home](https://github.com/tplnet/homebridge-heos-multiroom-audio/blob/main/docs/apple-home.md).

Devices you want to set up yourself (name, protocol, inputs, volume limit) are added under **Devices** in the settings form; they always keep their manual settings. All options: [Configuration](https://github.com/tplnet/homebridge-heos-multiroom-audio/blob/main/docs/configuration.md).

## Compatibility and security

This plugin is kept compatible with the **newest Homebridge release** and free of **known vulnerabilities (CVEs)** and **malware**:

- **Weekly and on every dependency change** the [Compatibility & CVE check](https://github.com/tplnet/homebridge-heos-multiroom-audio/actions/workflows/compat.yml) workflow
  - runs `npm audit` – any known vulnerability in the runtime dependencies fails the check,
  - builds the plugin and starts it with **homebridge@latest** and **homebridge@beta** on Node.js 22, 24 and 26 with simulated HEOS and AVR Control devices (`npm run smoke`): the plugin must load, be accepted as compatible (`engines`), connect to the devices, read their inputs and run without errors, HAP warnings or deprecation warnings.
- **On every push** the [CI](https://github.com/tplnet/homebridge-heos-multiroom-audio/actions/workflows/ci.yml) workflow runs lint, the unit tests and the smoke test, also with **Homebridge 1.x** (on Node.js 22 and 24).
- **Every release** runs the same CVE, malware and Homebridge checks before the version is staged on npm – a release with a known vulnerability, malware or an incompatibility is not published.
- **Malware scan** ([workflow](https://github.com/tplnet/homebridge-heos-multiroom-audio/actions/workflows/malware.yml), weekly, on every dependency change and before every release): [OSV-Scanner](https://google.github.io/osv-scanner/) checks all dependencies against the list of **known malicious npm packages**, and [ClamAV](https://www.clamav.net/) scans the package as it is published plus all installed dependencies for **malware**. Dependencies are installed with `npm ci --ignore-scripts`, so their install scripts never run in the build.
- **Dependabot** opens weekly pull requests for dependency and GitHub Actions updates.

Found a security issue? Please report it privately via GitHub (*Security* → *Report a vulnerability*) instead of a public issue, see [SECURITY.md](SECURITY.md).

## Privacy

**The plugin does not collect any data and does not send anything to the internet.** There is no telemetry, no analytics, no crash reporting and no cloud service.

It only talks to your HEOS devices in the local network:

| Connection | Target | Purpose |
| --- | --- | --- |
| SSDP search (UDP 1900, multicast) | local network | find HEOS devices (automatic setup) |
| HTTP (device description, port 60006) | the device itself | name, model, serial number, firmware |
| TCP 1255 (HEOS CLI) / TCP 23 (AVR Control) | the device itself | control: power, volume, mute, inputs, play/pause |

- Device descriptions are only fetched from the device that answered the search, never from another address it names.
- The plugin writes no files of its own. Device names, IP addresses and serial numbers are kept only in your Homebridge configuration and the local Homebridge log.
- The runtime dependencies (`@xmldom/xmldom`, `async-mutex`, `date-fns`) have no network access.
- Only Homebridge itself and the Homebridge UI go online (e.g. to check npm for plugin updates); the plugin doesn't.

## Documentation

- [Configuration](https://github.com/tplnet/homebridge-heos-multiroom-audio/blob/main/docs/configuration.md) – control protocols, automatic and manual setup, all options, inputs, languages, beta versions, switching from another package
- [Apple Home](https://github.com/tplnet/homebridge-heos-multiroom-audio/blob/main/docs/apple-home.md) – adding a device step by step, using it in the Home app
- [Troubleshooting](https://github.com/tplnet/homebridge-heos-multiroom-audio/blob/main/docs/troubleshooting.md) – common problems, debug log, reporting a problem
- [Development](https://github.com/tplnet/homebridge-heos-multiroom-audio/blob/main/docs/development.md) – building, tests, protocol specifications
- [Releasing](https://github.com/tplnet/homebridge-heos-multiroom-audio/blob/main/docs/releasing.md) and [testing](https://github.com/tplnet/homebridge-heos-multiroom-audio/blob/main/docs/testing.md) – for maintainers
- [Changelog](CHANGELOG.md)

## Contributing

Bug reports, device reports and pull requests are welcome: <https://github.com/tplnet/homebridge-heos-multiroom-audio/issues>. What to include: see [Reporting a problem](https://github.com/tplnet/homebridge-heos-multiroom-audio/blob/main/docs/troubleshooting.md#reporting-a-problem).

## Disclaimer

This is a private development project. It exists to keep the plugin compatible with current Homebridge releases, to apply security updates, to add features and to fix bugs.

- It is developed in spare time and with the help of AI tools. Every change goes through the automated checks described under [Compatibility and security](#compatibility-and-security) and is tested with real devices where possible, but mistakes can still happen.
- **Use at your own risk.** The plugin is provided as is, without any warranty (see the [GPL-3.0 license](LICENSE)).
- Questions, bug reports and feature requests are welcome and are handled on a best-effort basis. There is no guaranteed response time and no guarantee that a request will be implemented.
- This project is not affiliated with or endorsed by Denon, Marantz, Apple or the Homebridge project. All product names are trademarks of their respective owners.

## License and credits

[GNU General Public License v3.0](LICENSE), like the original project. Original plugin by [hov3rcraft](https://github.com/hov3rcraft) – thank you! Fork maintained by [tplnet](https://github.com/tplnet).
