import * as net from "net";

import { IDenonClient } from "./denonClient.js";
import { DenonClientAvrControl } from "./denonClientAvrControl.js";
import { DenonClientHeosCli } from "./denonClientHeosCli.js";
import { DenonClientHybrid } from "./denonClientHybrid.js";
import { ControlMode } from "./controlMode.js";

export { CONTROL_MODE_BY_NAME, ControlMode } from "./controlMode.js";

export const CLIENT_MAP: Record<
  ControlMode,
  new (
    serialNumber: string,
    name: string,
    host: string,
    connect_timeout: number,
    response_timeout: number,
    debugLogCallback?: (message: string, ...parameters: any[]) => void,
    powerUpdateCallback?: (power: boolean) => void,
    muteUpdateCallback?: (mute: boolean) => void,
    volumeUpdateCallback?: (volume: number) => void,
    inputUpdateCallback?: (input: string) => void,
  ) => IDenonClient
> = {
  [ControlMode.AVRCONTROL]: DenonClientAvrControl,
  [ControlMode.HEOSCLI]: DenonClientHeosCli,
  [ControlMode.HYBRID]: DenonClientHybrid,
};

function checkProtocolSupportAtPort(host: string, port: number, debugLogCallback?: (message: string, ...parameters: any[]) => void): Promise<boolean> {
  const CONNECT_TIMEOUT = 5000;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (supported: boolean, ...logParameters: any[]) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      debugLogCallback?.(logParameters[0], ...logParameters.slice(1));
      socket.destroy();
      resolve(supported);
    };

    const socket = net.createConnection({ host: host, port: port }, () => finish(true, "successfully connected to", host, port));
    socket.on("error", (error) => finish(false, "error for", host, port, error.message));
    // Hard upper bound for the connection attempt (covers devices that silently drop the SYN).
    const timer = setTimeout(() => finish(false, "timeout for", host, port), CONNECT_TIMEOUT);
  });
}

export async function checkProtocolSupport(host: string, debugLogCallback?: (message: string, ...parameters: any[]) => void): Promise<ControlMode[]> {
  const modes = Object.values(ControlMode).filter((value): value is ControlMode => typeof value === "number" && value >= 0);
  // check all ports in parallel, so an unreachable device delays the startup only once
  const results = await Promise.all(modes.map((mode) => checkProtocolSupportAtPort(host, mode, debugLogCallback)));
  return modes.filter((_mode, index) => results[index]);
}
