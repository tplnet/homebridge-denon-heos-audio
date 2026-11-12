/**
 * Helpers to map between the HomeKit volume scale (0-100) and the device volume scale when a volume limit is configured.
 * With a volume limit, 100% in HomeKit corresponds to `volumeLimit` on the device.
 */

/**
 * Converts a HomeKit volume (0-100) to the device volume.
 */
export function toDeviceVolume(volume: number, volumeLimit: number | undefined): number {
  if (volumeLimit === undefined) {
    return volume;
  }
  return Math.round((volume * volumeLimit) / 100);
}

/**
 * Converts a device volume back to the HomeKit volume scale (0-100).
 *
 * If the device volume equals the converted value of the last volume set via HomeKit, the last set volume is returned,
 * so that rounding does not make the HomeKit slider jump.
 */
export function fromDeviceVolume(deviceVolume: number, volumeLimit: number | undefined, lastSetVolume?: number): number {
  if (volumeLimit === undefined) {
    return deviceVolume;
  }
  if (lastSetVolume !== undefined && toDeviceVolume(lastSetVolume, volumeLimit) === deviceVolume) {
    return lastSetVolume;
  }
  if (volumeLimit === 0) {
    return 0;
  }
  return Math.min(100, Math.round((deviceVolume / volumeLimit) * 100));
}
