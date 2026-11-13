/**
 * Typed representation of the plugin configuration (see config.schema.json).
 */

export interface InputConfig {
  inputID: string;
  name: string;
  showInList?: boolean;
}

export interface DeviceConfig {
  name: string;
  serialNumber: string;
  ip: string;
  controlProtocol: "AVRCONTROL" | "HEOSCLI" | "HYBRID";
  volumeLimitEnabled?: boolean;
  volumeLimit?: number;
  volumeStepSize?: number;
  powerOnFavorite?: number;
  inputs?: InputConfig[];
}
