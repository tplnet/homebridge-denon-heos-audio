import { ControlMode } from "./controlMode.js";
import type { DeviceConfig } from "./config.js";

/**
 * Information about a device found via SSDP device discovery.
 */
export interface DiscoveredDevice {
  serialNumber: string;
  ip: string;
  friendlyName?: string;
  modelName?: string;
  supportedModes: ControlMode[];
}

/**
 * Picks the best control protocol for the supported modes:
 * HYBRID if both protocols are available (real power on/standby plus media controls), otherwise the single supported one.
 */
export function chooseControlProtocol(supportedModes: ControlMode[]): DeviceConfig["controlProtocol"] | undefined {
  const avr = supportedModes.includes(ControlMode.AVRCONTROL);
  const heos = supportedModes.includes(ControlMode.HEOSCLI);
  if (avr && heos) {
    return "HYBRID";
  }
  if (heos) {
    return "HEOSCLI";
  }
  if (avr) {
    return "AVRCONTROL";
  }
  return undefined;
}

/**
 * Makes a name valid for HomeKit: it has to start and end with a letter or number
 * and may only contain letters, numbers, spaces and common punctuation in between.
 */
export function sanitizeAccessoryName(name: string | undefined, fallback: string): string {
  const cleaned = (name ?? "")
    .replace(/[^\p{L}\p{N}\p{Zs}’'&!._:;()/,-]/gu, " ")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .replace(/\s+/g, " ");
  return cleaned || fallback;
}

/**
 * Builds the device configuration for a discovered device.
 * @returns undefined if the device supports none of the control protocols
 */
export function buildDiscoveredDeviceConfig(device: DiscoveredDevice): DeviceConfig | undefined {
  const controlProtocol = chooseControlProtocol(device.supportedModes);
  if (!controlProtocol) {
    return undefined;
  }
  return {
    name: sanitizeAccessoryName(device.friendlyName ?? device.modelName, `Denon ${device.serialNumber}`),
    serialNumber: device.serialNumber,
    ip: device.ip,
    controlProtocol: controlProtocol,
  };
}
