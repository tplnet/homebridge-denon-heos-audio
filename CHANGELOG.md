# Changelog

All notable changes of this fork. The fork is based on [hov3rcraft/homebridge-denon-heos-audio](https://github.com/hov3rcraft/homebridge-denon-heos-audio) 1.0.0-beta.1.

## 1.5.0-beta.1 (2026-11-19)

### Changed

- **New name: "Homebridge HEOS Multiroom-Audio (tplnet)"**, npm package `@tplnet/homebridge-heos-multiroom-audio` (before: `@tplnet/homebridge-denon-heos-audio`), repository `tplnet/homebridge-heos-multiroom-audio`. HEOS is the multiroom audio system of Denon and Marantz; the new name describes it better. Switching: uninstall the old package in the terminal and install the new one (see README, "Switching from @tplnet/homebridge-denon-heos-audio"). The platform name `DenonHeosAudio` and the configuration stay the same, the devices keep their pairing in Apple Home.
- npm description and keywords: more search terms (multiroom, multi-room, Denon HEOS, Marantz HEOS, Denon AVR, Marantz AVR, Siri, …).

No changes to the functions of the plugin.

## 1.4.1-beta.1 (2026-11-19)

First beta: from now on every change is published as a beta first and becomes a regular version after it has been tested.

### Changed

- Betas are published with the npm dist-tag `beta` (before: `next`), so the Homebridge UI offers newer betas to users who run a beta of this plugin. The README explains how to install a beta (Homebridge UI → *Manage Version*) and how to go back to the regular version; new badge with the current beta.
- README: plugin icon at the top (also on npm and in the Homebridge UI).
- SECURITY.md: reports are handled on a best-effort basis.

No changes to the plugin code.

## 1.4.0 (2026-11-18)

### Added

- Switching on can start a **Quick Select** slot of the device (the numbered buttons, e.g. 1–3 on a Denon Home 150, 1–6 on a Denon Home 300) instead of a HEOS favorite when the speaker has nothing to resume: new option *Power On Quick Select* (`powerOnQuickSelect`, HEOS CLI only, 0 = use the HEOS favorite). At startup the plugin warns if the slot doesn't exist on the device; the debug log shows its name.

### Changed

- *Power On Favorite* accepts up to 200, the maximum number of favorites in the HEOS app. Its description explains that the number is the position in the favorite list of the HEOS app (*Music → Favorites*).

## 1.3.4 (2026-11-18)

### Fixed

- The settings form no longer shows "Config validation failed" because of an empty entry it adds by itself (e.g. an empty input). Lists start empty, and inputs without input ID or name are ignored by the plugin.

### Changed

- *Power On Favorite* is a number field instead of a slider in the settings form.
- At startup the plugin checks the power on favorite against the favorites in the HEOS app (HEOS CLI devices) and warns if it doesn't exist or if there are no favorites. The name of the favorite is shown in the debug log.

## 1.3.3 (2026-11-18)

### Changed

- Clearer settings form in the Homebridge UI: discovery options at the top, the manual devices in their own expandable section with the settings of each device grouped into *Volume*, *Switching on (HEOS CLI)* and *Inputs*, console log options under *Troubleshooting*. Also in the German form.
- Settings form texts: "HEOS CLI" spelled correctly, the volume limit field has a title, clearer descriptions of the device list and the volume step size; Marantz devices are no longer left out ("Add your Denon devices here").
- Removed the unused option "Selectable playing sources" from the settings form (it had no effect).
- Releases are blocked only by vulnerabilities in the runtime dependencies, like in the other tplnet projects; findings in development tools are reported.

### Fixed

- Console log (`consoleLogEnabled`) without a log level no longer stays silent; it uses `debug`, like the default in the settings form.

## 1.3.2

### Fixed

- Devices no longer show "No Response" in Apple Home after a Homebridge restart because their port changed. Every device now gets the same port at every start (as long as the same devices are there): the devices of the start – manual ones and the ones found by the discovery within the first 10 seconds – are published together, sorted by serial number. Before, the order depended on which device answered first, so the ports were shuffled and Apple Home sometimes kept connecting to the old port. Devices found later are published right away.
- With device discovery enabled, the devices appear in Apple Home about 10 seconds after the start.

### Changed

- README: troubleshooting for "No Response" after a restart (restart only the child bridge, check the announced port with `dns-sd`).

The ports are assigned once in the new order after updating; afterwards they stay the same.

## 1.3.1

### Changed

- Shorter log at startup: the details of each discovered device ("Found Denon / Marantz device …", about 8 lines per device) and the notes about manually configured or excluded devices are only written to the debug log. The device overview lists all devices with their status; "Automatically adding discovered device …" stays in the normal log.

## 1.3.0

### Added

- Device overview in the log: about 30 seconds after the start, a table lists every device found in the network and every manually configured device with its status – *added automatically*, *added manually* (or *not found in the network*) or *not added* with the reason (automatic adding disabled, excluded, not reachable, no supported protocol). Devices found later lead to an updated overview.

### Changed

- README: disclaimer (private hobby project, AI-assisted development, use at your own risk, best-effort support).

## 1.2.7

### Changed

- README: router-neutral instructions for a fixed IP address, corrected Home app usage (tap the tile; the volume is changed with the Remote in Control Center, the Home app has no volume slider for TV accessories), "Nintendo Switch" in the input example.
- Release notes of GitHub releases are taken from `CHANGELOG.md`, like in homebridge-tahoma. They also list what was checked for the release (newest Homebridge release, `npm audit`, tests, supported Node.js and Homebridge versions) and link to the changelog. `npm version` refuses to run without a changelog section; a new workflow fills existing releases.

No changes to the plugin code.

## 1.2.6

### Added

- German settings form in the Homebridge UI (`schemas/config.schema.de.json`), shown when the UI language is set to Deutsch. A test keeps the fields, defaults and limits identical to the English form. The README lists the supported languages.

## 1.2.5

### Fixed

- The speaker part (volume, mute) is now linked to the TV, as Apple recommends for TV accessories. The Home app no longer shows it as a separate speaker tile. If an existing speaker tile remains, restart Homebridge; if it is still there, remove it in the Home app (the TV tile keeps working).

### Security

- Automatic discovery only fetches the device description from the device that answered the search. A manipulated answer can no longer make the plugin fetch another (e.g. external) address.

### Changed

- New README section "Privacy": the plugin collects no data and only talks to the HEOS devices in the local network.
- Clearer debug messages for the protocol check, e.g. "AVR Control (port 23) not available (connection refused)" instead of "error for … ECONNREFUSED".

## 1.2.4

### Changed

- Shorter npm description without the fork notice, so the search results in the Homebridge UI show the supported devices and features. The fork is mentioned at the top of the README and in the credits.

1.2.3 was not published on npm; its changes are included in 1.2.4.

## 1.2.3

### Changed

- Easier to find in the plugin search of the Homebridge UI: new display name *Homebridge Denon & Marantz HEOS (tplnet)*, a description that names the supported devices and features, and more keywords (Denon Home, Home Amp, Marantz Cinema, AV receiver, amplifier, soundbar, Apple Home).
- Documentation: *Apple Home* instead of *HomeKit*; *Compatibility and security* section and badges; troubleshooting for devices that appear offline in the Homebridge UI.

### Security / CI

- Weekly *Compatibility & CVE check* with homebridge@latest and @beta on Node.js 22, 24 and 26, Dependabot for dependency updates.

## 1.2.2

### Fixed

- The tile in the Homebridge UI / Home app no longer jumps back to "off" while switching on takes a few seconds: HomeKit gets the answer immediately and switching continues in the background. If switching fails, the tile shows the real state again and the error is logged.
- A radio station that needs a few seconds to buffer is no longer replaced by the power on favorite: the plugin now waits up to 8 seconds (before: 3) for playback to start.

## 1.2.1

### Fixed

- When switching on took a few seconds (e.g. while the power on favorite was being started), the tile briefly showed "off" before it switched to "on". The requested state is now reported from the moment of the tap, and intermediate states of the device are ignored until switching has finished.
- The player list was requested twice per device at startup.

## 1.2.0

### New

- **Control protocol check at startup:** the plugin checks which protocols a device supports. If the configured protocol isn't supported (e.g. *Hybrid* or *AVR Control* on a Denon Home speaker), it uses a supported one and logs a warning with what to change, instead of the device showing "No Response". A device configured with *HEOS CLI* that also supports AVR Control gets a hint that *Hybrid* is possible. Devices that are switched off at startup keep their configuration.
- The plugin settings explain which devices support which protocol.

### Changed

- The protocol support of a device is checked on both ports in parallel (faster startup if a device is offline).

## 1.1.2

### Fixed

- Switching on (HEOS CLI) also starts the HEOS favorite when the speaker reports "paused" but has nothing to play: if the current media is empty, or if the speaker accepts the play command but playback doesn't start within 3 seconds. Seen on a Denon Home Amp after a streaming session.

## 1.1.1

### Changed

- Switching on a speaker that is already playing no longer sends an unnecessary play command.
- Starting the power on favorite is shown in the normal log (not only in the debug log), e.g. `Nothing to resume, starting HEOS favorite 1.`

### Documentation

- README: a HEOS favorite is required for switching on without a source; fixed ports and the *Ciao* mDNS advertiser help if devices appear offline in the Homebridge UI after restarts.

## 1.1.0

### New

- **Switching on always plays something (HEOS CLI):** if a speaker has nothing to resume (no active source, e.g. after a restart) or refuses to resume, the first HEOS favorite is started. This makes switching on via scenes and automations reliable. Configurable per device with `powerOnFavorite` (number of the favorite, 0 = disabled).

### Fixed

- After switching on or off, the tile could briefly jump back to the old state, because devices report the old state for a moment. The new state is now kept for a few seconds, unless the device reports a different change (e.g. from the HEOS app).

## 1.0.1

### Changed

- Releases are built by GitHub Actions and staged on npm with Trusted Publishing and provenance: every version on npm can be traced back to the GitHub commit it was built from, and it only becomes public after approval with 2FA / passkey. Before staging, the workflow checks for known vulnerabilities (`npm audit`) and runs the tests and a compatibility test with the latest Homebridge release.
- A release is a single command (`npm version x.y.z`); the GitHub release is created automatically with the notes from this changelog ([RELEASING.md](RELEASING.md)).
- CI also tests with Node.js 26.

No changes to the plugin itself.

## 1.0.0

First release of the fork as `@tplnet/homebridge-denon-heos-audio`.
Tested with Denon Home 150, Denon Home 250, Denon Home Amp and Marantz Cinema 60 on Homebridge 2.5.0 (and 1.11.4 in automated tests).

### New

- **Automatic setup:** discovered devices can be added automatically (`autoAddDiscoveredDevices`), with their HEOS name and the best control protocol (Hybrid if supported). Manually configured devices are not affected; single devices can be excluded (`excludedSerialNumbers`).
- **Inputs read from the device:** with HEOS CLI and Hybrid, the plugin asks the device for its inputs and shows exactly those, with the names set on the device. Before, every device got about 66 input entries.
- **Marantz support** in device discovery.
- New device discovery that only asks for HEOS devices, searches every 2 minutes and restarts itself after network errors.
- Step-by-step guide for adding a device to Apple Home, troubleshooting and a manual test checklist ([TESTING.md](TESTING.md)).

### Fixed

- Homebridge could crash on unexpected or malformed messages from a device (unhandled errors / promise rejections).
- Devices with a **negative HEOS player id** (common, e.g. `pid=-1234567890`) did not react at all: all their responses were discarded.
- The HEOS play state `unknown` (device without active source) was treated as an error, so the power state was shown wrongly.
- Failed HEOS commands were not recognised (`result` field) and always ran into the timeout.
- Device discovery stopped forever after the first error of any UPnP device in the network; it could also exhaust the open files of the process (`EMFILE`).
- Volume limit 0 was ignored; `setVolume` errors were not reported; the play/pause lock could stay set forever.
- The plugin configuration form in the Homebridge UI could stick to the mouse pointer after using a dropdown.
- Timers and sockets were not cleaned up; circular module imports.

### Changed

- Package name `@tplnet/homebridge-denon-heos-audio` (the platform name `DenonHeosAudio` and existing configurations are unchanged).
- Requires Node.js 22.12+, 24 or 26 (like Homebridge 2.5).
- Removed the generic SSDP library; fewer dependencies.
- Discontinued streaming services (Rhapsody, Rdio, MoodMix, Juke) removed.
- License stated as GPL-3.0 in `package.json`, matching the `LICENSE` file of the original project.

### Security

- All dependencies updated; `npm audit`: 0 known vulnerabilities.
- CI checks vulnerabilities (CVEs) and compatibility with the latest Homebridge on every push and weekly.
