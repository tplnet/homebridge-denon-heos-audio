import { ControlMode, CONTROL_MODE_BY_NAME } from "./controlMode.js";
import type { DeviceConfig } from "./config.js";
import { chooseControlProtocol } from "./discovery.js";

type ProtocolName = DeviceConfig["controlProtocol"];

/** Ports (= control modes) a protocol needs. */
const REQUIRED_MODES: Record<ProtocolName, ControlMode[]> = {
  AVRCONTROL: [ControlMode.AVRCONTROL],
  HEOSCLI: [ControlMode.HEOSCLI],
  HYBRID: [ControlMode.AVRCONTROL, ControlMode.HEOSCLI],
};

const PROTOCOL_LABEL: Record<ProtocolName, string> = {
  AVRCONTROL: "AVR Control",
  HEOSCLI: "HEOS CLI",
  HYBRID: "Hybrid",
};

export interface ProtocolCheckResult {
  /** The protocol to use. */
  protocol: ProtocolName;
  /** Warning for the log if the configured protocol can't be used. */
  warning?: string;
  /** Hint for the log (e.g. a better protocol is available). */
  hint?: string;
}

/**
 * Checks the configured control protocol against the protocols the device supports.
 *
 * - The device supports everything the protocol needs: keep it (with a hint if Hybrid would be possible instead of HEOS CLI).
 * - The device doesn't support it, but another one: use the best supported protocol and return a warning.
 * - The device can't be reached (nothing supported): keep the configuration, the device may just be switched off.
 */
export function checkControlProtocol(deviceName: string, configured: ProtocolName, supportedModes: ControlMode[]): ProtocolCheckResult {
  if (!(configured in CONTROL_MODE_BY_NAME) || supportedModes.length === 0) {
    return { protocol: configured };
  }

  const missing = REQUIRED_MODES[configured].filter((mode) => !supportedModes.includes(mode));
  if (missing.length === 0) {
    if (configured === "HEOSCLI" && supportedModes.includes(ControlMode.AVRCONTROL)) {
      return {
        protocol: configured,
        hint: `"${deviceName}" also supports AVR Control. "Hybrid" would switch it to real standby instead of only stopping the playback.`,
      };
    }
    return { protocol: configured };
  }

  const fallback = chooseControlProtocol(supportedModes);
  if (!fallback) {
    return { protocol: configured };
  }
  const missingText = missing.map((mode) => `${ControlMode[mode] === "AVRCONTROL" ? "AVR Control" : "HEOS CLI"} (port ${mode} closed)`).join(", ");
  return {
    protocol: fallback,
    warning:
      `"${deviceName}" doesn't support ${missingText}, so "${PROTOCOL_LABEL[configured]}" can't be used. ` +
      `Using "${PROTOCOL_LABEL[fallback]}" instead – please change "Control Protocol" in the plugin settings.`,
  };
}
