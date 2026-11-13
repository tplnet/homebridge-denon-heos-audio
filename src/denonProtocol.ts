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

const PROTOCOL_NAMES: Partial<Record<number, string>> = {
  [ControlMode.AVRCONTROL]: "AVR Control",
  [ControlMode.HEOSCLI]: "HEOS CLI",
};

export function describeProbeResult(host: string, port: number, supported: boolean, reason?: string): string {
  const protocol = `${PROTOCOL_NAMES[port] ?? "Protocol"} (port ${port})`;
  return supported ? `${host}: ${protocol} available` : `${host}: ${protocol} not available${reason ? ` (${reason})` : ""}`;
}

function checkProtocolSupportAtPort(host: string, port: number, debugLogCallback?: (message: string, ...parameters: any[]) => void): Promise<boolean> {
  const CONNECT_TIMEOUT = 5000;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (supported: boolean, reason?: string) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      debugLogCallback?.(describeProbeResult(host, port, supported, reason));
      socket.destroy();
      resolve(supported);
    };

    const socket = net.createConnection({ host: host, port: port }, () => finish(true));
    socket.on("error", (error: NodeJS.ErrnoException) => finish(false, error.code === "ECONNREFUSED" ? "connection refused" : (error.code ?? error.message)));
    // Hard upper bound for the connection attempt (covers devices that silently drop the SYN).
    const timer = setTimeout(() => finish(false, "no answer within 5 s"), CONNECT_TIMEOUT);
  });
}

export async function checkProtocolSupport(host: string, debugLogCallback?: (message: string, ...parameters: any[]) => void): Promise<ControlMode[]> {
  const modes = Object.values(ControlMode).filter((value): value is ControlMode => typeof value === "number" && value >= 0);
  // check all ports in parallel, so an unreachable device delays the startup only once
  const results = await Promise.all(modes.map((mode) => checkProtocolSupportAtPort(host, mode, debugLogCallback)));
  return modes.filter((_mode, index) => results[index]);
}
