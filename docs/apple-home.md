# Apple Home

[← Back to the README](../README.md)

- [Adding a device (step by step)](#adding-a-device-step-by-step)
- [Using it in the Home app](#using-it-in-the-home-app)

## Adding a device (step by step)

Apple Home allows only one TV per bridge. That's why every device is published as its **own accessory**. It does **not** appear in the Home app automatically together with your other Homebridge accessories, so you have to add each device once.

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

- Tap the tile to switch the device on or off and to choose an input.
- The Home app has no volume slider for TV accessories. Change the volume with the **Remote** in Control Center: select the device at the top of the Remote and press the iPhone's volume buttons. The Remote also plays/pauses and skips tracks.
- If you configured inputs, you can hide or rename them in the device settings under **Inputs**.

**The device does not appear in step 4?**

- Wait up to a minute and make sure the iPhone is in the same network.
- Check the Homebridge log for the `Please add [...] manually in Home app` line. No line means the device was not set up (check the configuration and the log for errors).
- On some systems (e.g. Synology NAS, Docker) the default network advertiser doesn't work reliably. In the Homebridge UI go to **Settings → mDNS Advertiser**, choose **Ciao** (or **Avahi**), restart and try again.
- The device was paired before and removed from the Home app in the meantime: restart Homebridge and try again.

## Using it in the Home app

| Action | What happens |
| --- | --- |
| Power button | Power on / standby (AVR Control, Hybrid) or play / stop (HEOS CLI). With HEOS CLI, switching on resumes the last source; if there is none, the first HEOS favorite is started (see `powerOnFavorite`). |
| Input picker | Switches the input |
| Control Center → Remote → volume buttons on your iPhone | Volume up / down by `volumeStepSize` |
| Remote → centre button / play-pause | Play / pause (HEOS CLI, Hybrid) |
| Remote → left / right | Previous / next track (HEOS CLI, Hybrid) |
| Siri, scenes and automations | Power and inputs |
| Homebridge UI (*Speaker* tile) or apps that show all accessory settings (e.g. Eve, Controller for HomeKit) | Set the volume directly, mute / unmute |
