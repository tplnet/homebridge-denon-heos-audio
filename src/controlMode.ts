/**
 * Supported control protocols. The numeric value is the TCP port of the protocol (HYBRID uses both).
 */
export enum ControlMode {
  AVRCONTROL = 23,
  HEOSCLI = 1255,
  HYBRID = -1,
}

export const CONTROL_MODE_BY_NAME: Record<keyof typeof ControlMode, ControlMode> = {
  AVRCONTROL: ControlMode.AVRCONTROL,
  HEOSCLI: ControlMode.HEOSCLI,
  HYBRID: ControlMode.HYBRID,
};
