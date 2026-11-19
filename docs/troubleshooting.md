# Troubleshooting

[← Back to the README](../README.md)

**The device shows "No Response".**
Check that the IP address is still correct and that the device is reachable from the Homebridge host (`ping <ip>`). Speakers in deep sleep sometimes need one wake-up via the HEOS app.

**Some devices show "No Response" after a Homebridge restart, others work.**
Apple Home (or your home hub) may still use an old port of the device. Since 1.3.2 every device gets the same port at every start, as long as the same devices are there and no other plugin with its own accessories (e.g. cameras) is added to the same port range – the port range is shared by all plugins, so adding such a plugin moves the ports of the HEOS devices once: the plugin publishes the devices of the start together, sorted by serial number, about 10 seconds after the start (with device discovery). If a device still shows *No Response*, restart only the **child bridge** of this plugin (not the whole Homebridge): the devices keep their ports and are announced again. If the port is correct and the device still shows *No Response*, restart your **home hub** (HomePod, HomePod mini or Apple TV; for a HomePod: unplug it for 10 seconds). After many port changes the hub sometimes stops trying to reconnect. To check which port a device is announced with, run on a Mac: `dns-sd -L "<name shown in the log, e.g. Office 1B20>" _hap._tcp local.` and compare it with `… is running on port …` in the log.

**"Player list does not include serial …" in the debug log.**
The serial number doesn't match. Use the value from device discovery exactly as shown.

**Discovery finds nothing.**
SSDP doesn't cross VLANs or guest networks. Docker installations need `network_mode: host`.

**A speaker doesn't switch on (HEOS CLI).**
Switching on starts playback. If the speaker has nothing to resume, the plugin starts the HEOS favorite set in `powerOnFavorite` (default: the first one) or, if set, the Quick Select slot in `powerOnQuickSelect`. Make sure the favorite exists in the HEOS app (*Music → Favorites*) or the Quick Select slot is stored on the device; the plugin warns at startup if not. The log shows `starting HEOS favorite …` / `starting Quick Select …` when this happens.

**The Marantz receiver doesn't react to AVR Control commands.**
Enable *Network Control* (sometimes called *IP Control*) in the receiver's network settings so it stays reachable in standby.

**The device can't be added in the Home app.**
See [The device does not appear in step 4?](apple-home.md#adding-a-device-step-by-step)

**Devices appear offline in the Homebridge UI after a restart ("fetch failed"), or commands from the UI don't arrive.**
Every device runs on its own port. Without a port range, the ports change at every restart and the Homebridge UI may still use the old ones, especially if mDNS doesn't work reliably (e.g. on a Synology NAS: `Failed to create listener for avahi-daemon`). In the Homebridge UI under **Settings → Network**:
1. set a **port range** for accessories, e.g. `52100`–`52150` (or `"ports": { "start": 52100, "end": 52150 }` in `config.json`), outside of the ports of your bridges,
2. set the **mDNS Advertiser** to **Ciao**,

then restart Homebridge **once** and reload the page.

**Homebridge doesn't start: `EADDRINUSE: address already in use`.**
Usually an old Homebridge process is still running (e.g. after several restarts in a row): `ps aux | grep -i [h]omebridge` shows two main `homebridge` processes. Stop Homebridge, end the old process (`kill <pid>`) and start Homebridge again.

**The window *Plugin Logs* stays empty (except right after a restart).**
The Homebridge UI shows only the lines that start with the name from the plugin settings. Without a name it looks for the package name, which the Homebridge log doesn't use for the plugin's lines. Open the plugin settings (the *Name* field is prefilled with `HEOS Multiroom-Audio`), save and restart the plugin.

**A device is added automatically although I don't want it in Apple Home.**
Add its serial number to `excludedSerialNumbers` and restart Homebridge. Then remove it from the Home app.

## Debug log

Enable debug logging for the child bridge of this plugin (Homebridge UI → *Plugins* → ⋮ on this plugin → *Bridge Settings* → *Debug*), or for the whole Homebridge, or set `consoleLogEnabled`. The debug log shows every command sent to the devices and every answer, the supported protocols of each discovered device and the inputs, favorites and Quick Select slots it reports.

## Reporting a problem

Please open an issue at <https://github.com/tplnet/homebridge-heos-multiroom-audio/issues> with:

- the plugin, Homebridge and Node.js versions,
- the device model and the control protocol,
- what you did, what you expected and what happened,
- the debug log around that time (remove IP addresses and serial numbers if you like).
