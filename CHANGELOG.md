# Changelog

All notable changes of this fork. The fork is based on [hov3rcraft/homebridge-denon-heos-audio](https://github.com/hov3rcraft/homebridge-denon-heos-audio) 1.0.0-beta.1.

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
